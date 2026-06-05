-- =====================================================================
-- AI 小说转剧本工具 — PostgreSQL DDL 最终版 (v1.0)
-- 对应 Design.md 第八章「数据库设计」、第七章「预处理 Pipeline」、
-- 10.4「对话历史管理」、10.5「API 路由设计（多用户预留）」
--
-- 目标库：PostgreSQL 14+
-- 约定：
--   - 所有表主键统一用 UUID（gen_random_uuid()，pg13+ 内置）
--   - 所有业务表预留 user_id（第一期固定默认值 '00000000-...-0001'）
--   - 文档型字段统一用 JSONB，并按需建 GIN 索引
--   - 软删除不做，删除走级联（ON DELETE CASCADE）
--   - updated_at 由触发器统一维护
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. 扩展与公共函数
-- ---------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()

-- 第一期默认用户（多用户预留，未来接入 OAuth 后替换）
-- 注：users 表第一期仅占位，路由层固定写入默认 user_id
CREATE TABLE IF NOT EXISTS users (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username    TEXT        NOT NULL UNIQUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO users (id, username)
VALUES ('00000000-0000-0000-0000-000000000001', 'default_user')
ON CONFLICT (id) DO NOTHING;

-- updated_at 自动维护触发器
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- 1. 枚举类型
-- ---------------------------------------------------------------------
-- 小说预处理总状态
CREATE TYPE novel_status AS ENUM (
    'uploaded',            -- 已上传，未开始
    'preprocessing',       -- 预处理中
    'ready_for_planning',  -- 预处理完成，可进入改编方案
    'preprocessing_failed' -- 预处理失败
);

-- 剧本三套 Schema
CREATE TYPE schema_type AS ENUM (
    'ai_video',      -- Schema 1 · AI 视频
    'screenwriter',  -- Schema 2 · 编剧工作
    'overview'       -- Schema 3 · 快速概览
);

-- 剧本状态
CREATE TYPE screenplay_status AS ENUM (
    'draft',         -- 概览版自动生成 / 未确认方案
    'planning',      -- 改编方案待确认
    'generating',    -- 流式生成中
    'completed'      -- 全部集生成完成
);

-- 单集状态
CREATE TYPE episode_status AS ENUM (
    'pending',       -- 待生成
    'generating',    -- 生成中
    'done',          -- 已完成
    'failed'         -- 生成失败
);

-- 异步任务类型与状态
CREATE TYPE task_type AS ENUM (
    'preprocess',
    'generate_episode',
    'generate_overview',
    'export'
);
CREATE TYPE task_status AS ENUM (
    'pending', 'running', 'done', 'failed', 'cancelled'
);

-- 角色定位
CREATE TYPE character_role AS ENUM (
    'protagonist',   -- 主角
    'supporting',    -- 主要配角
    'minor'          -- 次要角色
);

-- 质量等级（预处理 / fallback 标记，见 7.7.2）
CREATE TYPE quality_level AS ENUM (
    'excellent', 'good', 'degraded', 'poor', 'fallback'
);

-- 对话上下文类型（context_type）
CREATE TYPE conversation_context AS ENUM (
    'preprocessing', 'planning', 'generation', 'conversation'
);
CREATE TYPE conversation_status AS ENUM ('active', 'archived');

-- 消息角色
CREATE TYPE message_role AS ENUM ('user', 'assistant', 'tool', 'system');

-- 导出格式
CREATE TYPE export_format AS ENUM ('yaml', 'pdf', 'zip');
CREATE TYPE export_status AS ENUM ('pending', 'running', 'done', 'failed');

-- =====================================================================
-- 2. 核心实体表
-- =====================================================================

-- ---------------------------------------------------------------------
-- 2.1 novels — 小说
-- ---------------------------------------------------------------------
CREATE TABLE novels (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                  UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'
                                 REFERENCES users(id) ON DELETE CASCADE,
    title                    TEXT        NOT NULL,
    author                   TEXT,
    original_text_url        TEXT        NOT NULL,          -- 原文存对象存储

    -- 预处理产物
    summary                  TEXT,                          -- 全书摘要
    character_arcs           JSONB       NOT NULL DEFAULT '[]'::jsonb,  -- 所有角色弧光（冗余镜像，主存 characters 表）
    foreshadowing            JSONB       NOT NULL DEFAULT '[]'::jsonb,  -- 伏笔索引 pairs

    -- 题材（上传强制多选 1-3 个 + AI 二次确认，见 10.2.2 / 7.4.6）
    user_selected_genres     TEXT[]      NOT NULL DEFAULT '{}',
    ai_predicted_genres      TEXT[]      NOT NULL DEFAULT '{}',
    genre_confidence         REAL,                          -- 0-1
    needs_genre_confirmation BOOLEAN     NOT NULL DEFAULT FALSE,

    -- 状态机与断点续传
    status                   novel_status NOT NULL DEFAULT 'uploaded',
    preprocessing_stages     JSONB       NOT NULL DEFAULT '{
        "split": "pending",
        "chapters": "pending",
        "novel_analysis": "pending",
        "vectorize": "pending",
        "genre": "pending",
        "overview": "pending"
    }'::jsonb,                                              -- 见 7.6 续传
    preprocessing_quality    quality_level,                 -- 见 7.7.2
    error_message            TEXT,

    word_count               INTEGER,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_genre_count CHECK (cardinality(user_selected_genres) BETWEEN 0 AND 3),
    CONSTRAINT chk_genre_conf  CHECK (genre_confidence IS NULL
                                      OR (genre_confidence >= 0 AND genre_confidence <= 1))
);
CREATE INDEX idx_novels_user        ON novels(user_id);
CREATE INDEX idx_novels_status      ON novels(status);
CREATE INDEX idx_novels_created     ON novels(created_at DESC);
CREATE INDEX idx_novels_arcs_gin    ON novels USING GIN (character_arcs);
CREATE INDEX idx_novels_foreshad_gin ON novels USING GIN (foreshadowing);

CREATE TRIGGER trg_novels_updated
    BEFORE UPDATE ON novels
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------
-- 2.2 chapters — 章节
-- ---------------------------------------------------------------------
CREATE TABLE chapters (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    novel_id             UUID NOT NULL REFERENCES novels(id) ON DELETE CASCADE,
    chapter_num          INTEGER     NOT NULL,              -- 拆分后顺序号
    title                TEXT        NOT NULL,
    content              TEXT        NOT NULL,              -- 章节完整原文
    word_count           INTEGER     NOT NULL DEFAULT 0,

    -- 预处理产物
    summary              TEXT,                              -- 章节摘要（500 字）
    summary_quality      quality_level,                     -- fallback 标记（7.4.2）
    key_events           JSONB       NOT NULL DEFAULT '[]'::jsonb,

    -- 章节类型与拆分（见 7.2.3）
    special_type         TEXT,                              -- 楔子/序章/番外/尾声 等；正集为 NULL
    needs_sub_split      BOOLEAN     NOT NULL DEFAULT FALSE,

    -- 断点续传子状态（见 7.6.1）
    -- 取值：pending / processing / done / failed_retried / fallback / skipped
    preprocessing_status JSONB       NOT NULL DEFAULT '{
        "summary": "pending",
        "key_events": "pending",
        "segmentation": "pending"
    }'::jsonb,
    retry_count          INTEGER     NOT NULL DEFAULT 0,

    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_chapter_num UNIQUE (novel_id, chapter_num)
);
CREATE INDEX idx_chapters_novel       ON chapters(novel_id);
CREATE INDEX idx_chapters_status_gin  ON chapters USING GIN (preprocessing_status);  -- 7.8 续传查询

CREATE TRIGGER trg_chapters_updated
    BEFORE UPDATE ON chapters
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------
-- 2.3 scenes_in_novel — RAG 语义切片表
-- ---------------------------------------------------------------------
CREATE TABLE scenes_in_novel (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    novel_id             UUID NOT NULL REFERENCES novels(id) ON DELETE CASCADE,  -- 冗余，便于按书清理/查询
    chapter_id           UUID NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
    scene_index          INTEGER     NOT NULL,              -- 章节内场景序号
    content              TEXT        NOT NULL,
    description          TEXT,                              -- AI 标记的场景一句话描述
    characters           JSONB       NOT NULL DEFAULT '[]'::jsonb,

    -- 向量化
    vector_id            TEXT,                              -- Chroma 内的 ID（通常 = 本表 id）
    vectorized           BOOLEAN     NOT NULL DEFAULT FALSE,
    segmentation_quality quality_level,                     -- fallback 切片标记（7.4.3）

    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_scene_idx UNIQUE (chapter_id, scene_index)
);
CREATE INDEX idx_scenes_novel       ON scenes_in_novel(novel_id);
CREATE INDEX idx_scenes_chapter     ON scenes_in_novel(chapter_id);
CREATE INDEX idx_scenes_unvectored  ON scenes_in_novel(novel_id) WHERE vectorized = FALSE;  -- 向量化续传
CREATE INDEX idx_scenes_chars_gin   ON scenes_in_novel USING GIN (characters);

-- ---------------------------------------------------------------------
-- 2.4 characters — 角色弧光
-- ---------------------------------------------------------------------
CREATE TABLE characters (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    novel_id        UUID NOT NULL REFERENCES novels(id) ON DELETE CASCADE,
    name            TEXT        NOT NULL,
    role            character_role NOT NULL DEFAULT 'supporting',
    arc_description TEXT,
    timeline        JSONB       NOT NULL DEFAULT '[]'::jsonb,  -- 按章节的角色弧光卡片
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_character_name UNIQUE (novel_id, name)
);
CREATE INDEX idx_characters_novel    ON characters(novel_id);
CREATE INDEX idx_characters_timeline ON characters USING GIN (timeline);

CREATE TRIGGER trg_characters_updated
    BEFORE UPDATE ON characters
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =====================================================================
-- 3. 剧本与生成
-- =====================================================================

-- ---------------------------------------------------------------------
-- 3.1 screenplays — 剧本
-- ---------------------------------------------------------------------
CREATE TABLE screenplays (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'
                          REFERENCES users(id) ON DELETE CASCADE,
    novel_id          UUID NOT NULL REFERENCES novels(id) ON DELETE CASCADE,
    schema_type       schema_type       NOT NULL,
    schema_version    TEXT              NOT NULL DEFAULT '1.0',

    adaptation_plan   JSONB,                               -- 集→章映射方案（强制确认环节）
    -- 跨集风格一致性：用户偏好持久化为剧本级元数据（决策清单）
    style_preferences JSONB             NOT NULL DEFAULT '{}'::jsonb,

    status            screenplay_status NOT NULL DEFAULT 'draft',
    is_auto_generated BOOLEAN           NOT NULL DEFAULT FALSE,  -- 概览版自动生成
    quality           quality_level,                        -- fallback 概览标记

    created_at        TIMESTAMPTZ       NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ       NOT NULL DEFAULT now()
);
CREATE INDEX idx_screenplays_novel ON screenplays(novel_id);
CREATE INDEX idx_screenplays_user  ON screenplays(user_id);
-- 每本小说每套 Schema 仅一份自动生成的概览版
CREATE UNIQUE INDEX uq_auto_overview
    ON screenplays(novel_id, schema_type)
    WHERE is_auto_generated = TRUE;

CREATE TRIGGER trg_screenplays_updated
    BEFORE UPDATE ON screenplays
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------
-- 3.2 episodes — 剧本集
-- ---------------------------------------------------------------------
CREATE TABLE episodes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    screenplay_id   UUID NOT NULL REFERENCES screenplays(id) ON DELETE CASCADE,
    episode_num     INTEGER        NOT NULL,
    title           TEXT,
    source_chapters INTEGER[]      NOT NULL DEFAULT '{}',   -- 溯源：对应的小说章节号
    content         JSONB,                                  -- 完整集内容（当前版本镜像）
    status          episode_status NOT NULL DEFAULT 'pending',
    error_message   TEXT,
    generated_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ    NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ    NOT NULL DEFAULT now(),

    CONSTRAINT uq_episode_num UNIQUE (screenplay_id, episode_num)
);
CREATE INDEX idx_episodes_screenplay ON episodes(screenplay_id);
CREATE INDEX idx_episodes_status     ON episodes(screenplay_id, status);

CREATE TRIGGER trg_episodes_updated
    BEFORE UPDATE ON episodes
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------
-- 3.3 episode_versions — 集版本管理
-- ---------------------------------------------------------------------
CREATE TABLE episode_versions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    episode_id  UUID NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
    version     INTEGER     NOT NULL,
    content     JSONB       NOT NULL,
    modified_by TEXT        NOT NULL DEFAULT 'ai',          -- 'user' / 'ai'
    modified_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_episode_version UNIQUE (episode_id, version),
    CONSTRAINT chk_modified_by   CHECK (modified_by IN ('user', 'ai'))
);
CREATE INDEX idx_versions_episode ON episode_versions(episode_id, version DESC);

-- =====================================================================
-- 4. 对话历史（见 10.4）
-- =====================================================================

-- ---------------------------------------------------------------------
-- 4.1 conversations — 对话会话
-- ---------------------------------------------------------------------
CREATE TABLE conversations (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'
                      REFERENCES users(id) ON DELETE CASCADE,
    novel_id      UUID NOT NULL REFERENCES novels(id) ON DELETE CASCADE,
    screenplay_id UUID REFERENCES screenplays(id) ON DELETE CASCADE,  -- 可空，未选 Schema 前
    title         TEXT,                                    -- 3 轮后自动生成
    context_type  conversation_context NOT NULL DEFAULT 'conversation',
    status        conversation_status  NOT NULL DEFAULT 'active',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_conv_novel      ON conversations(novel_id);
CREATE INDEX idx_conv_screenplay ON conversations(screenplay_id);
CREATE INDEX idx_conv_user       ON conversations(user_id, status);

CREATE TRIGGER trg_conv_updated
    BEFORE UPDATE ON conversations
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------
-- 4.2 messages — 对话消息
-- ---------------------------------------------------------------------
CREATE TABLE messages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role            message_role NOT NULL,
    content         TEXT,
    tool_calls      JSONB,
    tool_results    JSONB,
    token_usage     JSONB,
    is_pinned       BOOLEAN     NOT NULL DEFAULT FALSE,     -- 关键决策点（压缩时永不丢弃）
    is_compressed   BOOLEAN     NOT NULL DEFAULT FALSE,     -- 已压缩进摘要（不删除，仅跳过）
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- 构建 context 时常用：按会话取未压缩 / pinned 消息
CREATE INDEX idx_messages_conv     ON messages(conversation_id, created_at);
CREATE INDEX idx_messages_active   ON messages(conversation_id, created_at)
    WHERE is_compressed = FALSE;
CREATE INDEX idx_messages_pinned   ON messages(conversation_id)
    WHERE is_pinned = TRUE;

-- ---------------------------------------------------------------------
-- 4.3 compressed_segments — 压缩段（Anchor + Compress）
-- ---------------------------------------------------------------------
CREATE TABLE compressed_segments (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id      UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    summary              TEXT        NOT NULL,              -- 中间对话摘要
    original_message_ids UUID[]      NOT NULL DEFAULT '{}', -- 被压缩的消息 ID 列表
    compressed_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_compressed_conv ON compressed_segments(conversation_id, compressed_at);

-- =====================================================================
-- 5. 异步任务、进度与导出
-- =====================================================================

-- ---------------------------------------------------------------------
-- 5.1 tasks — 异步任务
-- ---------------------------------------------------------------------
CREATE TABLE tasks (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'
                      REFERENCES users(id) ON DELETE CASCADE,
    type          task_type   NOT NULL,
    novel_id      UUID REFERENCES novels(id) ON DELETE CASCADE,
    episode_id    UUID REFERENCES episodes(id) ON DELETE CASCADE,
    celery_id     TEXT,                                    -- Celery 任务 ID，便于追踪/取消
    status        task_status NOT NULL DEFAULT 'pending',
    progress      INTEGER     NOT NULL DEFAULT 0,          -- 0-100
    error_message TEXT,
    retry_count   INTEGER     NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_progress CHECK (progress BETWEEN 0 AND 100),
    -- 任务必须挂在某个实体上
    CONSTRAINT chk_task_target CHECK (novel_id IS NOT NULL OR episode_id IS NOT NULL)
);
CREATE INDEX idx_tasks_novel   ON tasks(novel_id);
CREATE INDEX idx_tasks_episode ON tasks(episode_id);
CREATE INDEX idx_tasks_status  ON tasks(status);
CREATE INDEX idx_tasks_celery  ON tasks(celery_id);

CREATE TRIGGER trg_tasks_updated
    BEFORE UPDATE ON tasks
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------
-- 5.2 progress_events — 进度事件持久化（见 7.5.1，断线重连恢复）
-- ---------------------------------------------------------------------
CREATE TABLE progress_events (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    novel_id   UUID NOT NULL REFERENCES novels(id) ON DELETE CASCADE,
    event_type TEXT        NOT NULL,                       -- split_completed / chapter_done / ...
    payload    JSONB       NOT NULL DEFAULT '{}'::jsonb,   -- 见 7.5.2 PROGRESS_EVENTS
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_progress_novel ON progress_events(novel_id, created_at);

-- ---------------------------------------------------------------------
-- 5.3 exports — 导出记录（见 10.5.2 /api/exports）
-- ---------------------------------------------------------------------
CREATE TABLE exports (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'
                      REFERENCES users(id) ON DELETE CASCADE,
    screenplay_id UUID NOT NULL REFERENCES screenplays(id) ON DELETE CASCADE,
    format        export_format NOT NULL,
    status        export_status NOT NULL DEFAULT 'pending',
    file_url      TEXT,                                    -- 对象存储路径
    error_message TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at    TIMESTAMPTZ                              -- 临时下载链接过期时间
);
CREATE INDEX idx_exports_screenplay ON exports(screenplay_id);
CREATE INDEX idx_exports_user       ON exports(user_id, created_at DESC);

-- =====================================================================
-- 6. 技能包
-- =====================================================================
CREATE TABLE skills (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT        NOT NULL UNIQUE,               -- skill_xianxia / skill_general ...
    description TEXT,
    content     JSONB       NOT NULL DEFAULT '{}'::jsonb,  -- SKILL.md / glossary / examples
    created_by  TEXT        NOT NULL DEFAULT 'builtin',    -- builtin / 用户名（预留扩展）
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_skills_updated
    BEFORE UPDATE ON skills
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 内置 skill 占位（内容由应用启动时从 skills/ 目录同步）
INSERT INTO skills (name, description, created_by) VALUES
    ('skill_general',      '默认通用 skill（兜底）',      'builtin'),
    ('skill_urban_drama',  '都市情感',                    'builtin'),
    ('skill_xianxia',      '仙侠玄幻',                    'builtin'),
    ('skill_ancient_power','古装权谋',                    'builtin'),
    ('skill_wuxia',        '武侠',                        'builtin'),
    ('skill_suspense',     '悬疑推理',                    'builtin'),
    ('skill_ai_shorts',    'AI 短剧分镜',                 'builtin')
ON CONFLICT (name) DO NOTHING;

-- =====================================================================
-- 7. 视图（便捷查询，可选）
-- =====================================================================
-- 小说预处理进度概览
CREATE OR REPLACE VIEW v_novel_preprocessing AS
SELECT
    n.id,
    n.title,
    n.status,
    n.preprocessing_quality,
    COUNT(c.id)                                          AS total_chapters,
    COUNT(c.id) FILTER (WHERE c.summary IS NOT NULL)     AS summarized_chapters,
    COUNT(s.id)                                          AS total_scenes,
    COUNT(s.id) FILTER (WHERE s.vectorized)              AS vectorized_scenes
FROM novels n
LEFT JOIN chapters c        ON c.novel_id = n.id
LEFT JOIN scenes_in_novel s ON s.novel_id = n.id
GROUP BY n.id;
