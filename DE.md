# AI 小说转剧本工具 — 设计讨论文档

**项目名称**：AI 小说转剧本工具  
**讨论日期**：2026 年 6 月  
**文档版本**：v1.0  
**文档目的**：记录项目从需求到架构的完整设计决策过程

---

## 目录

1. [项目背景](#一项目背景)
2. [核心需求](#二核心需求)
3. [Schema 设计 —— 三套剧本格式](#三schema-设计--三套剧本格式)
4. [整体架构决策](#四整体架构决策)
5. [Agent 与工具设计](#五agent-与工具设计)
6. [上下文与 RAG 设计](#六上下文与-rag-设计)
7. [数据库设计](#七数据库设计)
8. [生成流程设计](#八生成流程设计)
9. [关键技术决策回顾](#九关键技术决策回顾)
10. [待办事项](#十待办事项)

---

## 一、项目背景

### 1.1 目标

开发一款 AI 辅助剧本创作工具，将小说（≥3 章节）自动转换为结构化剧本（YAML 格式），降低改编门槛，提升效率。

### 1.2 目标用户

工具需服务三类不同需求的用户：

- **AI 视频创作者**：需要可直接投喂给 Sora、Kling 等视频模型的分镜数据
- **专业编剧**：需要保留小说情感深度、便于二次创作打磨的剧本初稿
- **制片/版权方**：需要快速判断小说改编可行性的极简概览

---

## 二、核心需求

| 需求 | 说明 |
|------|------|
| 支持长篇小说 | 上限 100 万字（参考红楼梦 70 万字） |
| 三套剧本格式 | 用户根据用途选择 |
| 流式生成 | 一集一集推送，用户立即可见 |
| 多轮对话修改 | Agent 协助用户持续打磨剧本 |
| 画布编辑 | 用户可手动修改场景和对白 |
| 异步任务 | 长任务后台执行，前端进度展示 |
| 改编方案确认 | 生成前先确认集→章映射方案 |

---

## 三、Schema 设计 —— 三套剧本格式

### 3.1 设计原则

**剧本用途决定 Schema 结构**。不同的下游消费者需要完全不同的信息粒度。

### 3.2 三套 Schema 概览

| 维度 | Schema 1 · AI 视频 | Schema 2 · 编剧工作 | Schema 3 · 快速概览 |
|------|------|------|------|
| 拆分粒度 | shot 分镜（3-10秒） | scene 场景 | scene 场景（极简） |
| 核心字段 | `camera_movement`, `lighting`, `character_emotion`, `voice_tone`, `generation_prompt` | `subtext`, `rewrite_notes`, `source_text_excerpt`, `arc` | `market_comparable`, `adaptation_difficulty`, `hook`, `weight` |
| 描述字数 | 短，机器可读 | 200-500 字/场 | 一句话/字段 |
| 目标用户 | AI 视频模型 | 人类编剧 | 制片/投资方 |
| 是否含对白 | 含（带语气/语速） | 含（带潜台词） | 不含 |
| 是否含镜头 | 完整运镜参数 | 仅 `director_notes` 建议 | 无 |
| 阅读时间 | 不适合人读 | 30 分钟+ | 5 分钟 |

### 3.3 Schema 1：AI 视频剧本

**核心理念**：机器可读优先，每个分镜是一个完整的"生成指令包"。

**关键设计**：
- 按 shot（3-10 秒视频片段）拆分，而非 scene
- 独立 `character_profiles` 字段，通过 `character_id` 外键引用，解决跨镜头角色一致性问题
- 每个 shot 输出可直接投喂视频模型的 `generation_prompt`（英文）

### 3.4 Schema 2：编剧工作剧本

**核心理念**：保留小说原著情感深度，提供丰富的"创作备注层"，留足修改空间。

**关键设计**：
- 描述字段字数放开（200-500 字），还原小说细节
- 对白保留 `subtext`（潜台词）和 `emotion`（情绪）
- AI 主动给出 `rewrite_notes` 改写建议
- 保留 `source_text_excerpt`（原文片段），供编剧对照

### 3.5 Schema 3：快速概览剧本

**核心理念**：极致精简，5 分钟读完整部剧的核心。

**关键设计**：
- 每场戏只保留 4 个字段：地点、出场角色、核心冲突、结果
- 故意砍掉对白和描述
- 顶层增加决策辅助字段：`market_comparable`、`adaptation_difficulty`、`hook`
- 五幕结构 `plot_arc`

### 3.6 共同设计原则

- **溯源性**：每个 episode 保留 `source_chapter` 字段，支持小说→剧本双向追溯
- **层次化**：`screenplay → episodes → scenes → dialogues` 四层嵌套
- **渐进增强**：大量字段可选，AI 初稿填核心字段，人工打磨时补充
- **Schema 版本号**：`schema_version` 字段保障工具升级时向后兼容

---

## 四、整体架构决策

### 4.1 Agent 设计

**最终方案**：**单 Agent + 多工具 + 多轮对话**

**讨论过的方案**：
- ❌ Multi-agent 并行生成（按集分配给多个 agent）—— 破坏剧本连贯性
- ✅ Multi-agent 用于预处理阶段（任务独立，可并行）
- ✅ Single-agent 用于生成阶段（任务有依赖，必须串行）

**为什么单 agent 用于生成**：

| 维度 | 并行 multi-agent | 串行 single-agent + 流式 |
|------|-----------------|-----------------------|
| 全部生成完成时间 | 10 分钟 | 40 分钟 |
| 用户看到第一集时间 | 10 分钟 | **1 分钟** |
| 剧本连贯性 | ❌ 差 | ✅ 好 |
| 风格一致性 | ❌ 差 | ✅ 好 |
| 用户修改后的延续 | ❌ 难 | ✅ 自然 |
| 开发复杂度 | 高 | 低 |

**核心原则**：用户体验取决于"看到第一集的速度"，不是"全部生成完的时间"。流式推送方案完胜。

### 4.2 技术栈

| 组件 | 选型 | 理由 |
|------|------|------|
| Web 框架 | FastAPI | 异步友好、Python 生态、文档生成完善 |
| 关系数据库 | PostgreSQL | 强关系查询、JSONB 字段、事务、生态成熟 |
| 向量数据库 | Chroma | 开发熟悉、轻量、易部署 |
| 任务队列 | Redis + Celery | 异步任务标配 |
| 缓存 | Redis | 复用任务队列 Redis |
| 对象存储 | S3 / OSS / MinIO | 原始小说、导出文件 |
| 实时通信 | WebSocket | 流式推送生成进度 |
| 部署方式 | Docker + docker-compose | 一键部署，方便用户自部署 |

### 4.3 整体架构图

```
┌─────────────────────────────────────────────┐
│ 前端（画布 + 对话框）                          │
└────────────┬────────────────────────────────┘
             │ WebSocket
┌────────────▼────────────────────────────────┐
│ FastAPI Gateway                             │
│  - REST: 上传、任务管理、剧本 CRUD            │
│  - WebSocket: 对话、进度推送                  │
└────┬─────────────────────────┬──────────────┘
     │                         │
┌────▼──────────┐    ┌─────────▼──────────────┐
│ Conversation  │    │ Celery Task Queue      │
│ Service       │    │  - 预处理任务            │
│ (实时对话)     │    │  - 剧本生成任务          │
└────┬──────────┘    └─────────┬──────────────┘
     │                         │
┌────▼─────────────────────────▼──────────────┐
│ Agent Core                                  │
│  ┌────────────────────────────────────┐    │
│  │ System Prompt Builder              │    │
│  │  + Schema + Skill + 摘要 + 角色档案  │    │
│  ├────────────────────────────────────┤    │
│  │ Tool Calling Loop                  │    │
│  └────┬───────────────────────────────┘    │
│       │                                    │
│  ┌────▼───────────────────────────────┐    │
│  │ Tools                              │    │
│  │  - chapter_get                     │    │
│  │  - chapter_search (向量检索)        │    │
│  │  - character_timeline              │    │
│  │  - foreshadowing_lookup            │    │
│  │  - text2screenplay                 │    │
│  │  - episode_patch                   │    │
│  │  - screenplay_validate             │    │
│  │  - skill_load                      │    │
│  └────────────────────────────────────┘    │
└────────────┬────────────────────────────────┘
             │
┌────────────▼────────────────────────────────┐
│ Storage Layer (Docker)                      │
│  - PostgreSQL                               │
│  - Chroma                                   │
│  - Redis                                    │
│  - Object Storage                           │
└─────────────────────────────────────────────┘
```

### 4.4 Docker 部署结构

```yaml
services:
  api          # FastAPI 主服务
  worker       # Celery worker
  postgres     # 关系数据
  chroma       # 向量库
  redis        # 任务队列 + 缓存
```

---

## 五、Agent 与工具设计

### 5.1 Skill 系统

**初始范围**：开发者内置，预留用户上传接口。

**计划内置 Skill**：
- `skill_urban_drama`（都市情感）
- `skill_xianxia`（仙侠）
- `skill_suspense`（悬疑）
- `skill_ancient_romance`（古装言情）
- `skill_ai_shorts`（AI 短剧分镜）

**Skill 文件结构**：

```
skills/
  └─ skill_xianxia/
      ├─ SKILL.md              # 给 agent 看的指令
      ├─ glossary.json         # 术语词典
      └─ examples.yaml         # few-shot 示例
```

**调用逻辑**：
1. 用户上传小说 → agent 题材识别
2. 推荐对应 skill
3. 用户确认 → skill 内容加入 system prompt 和工具上下文

### 5.2 工具集

#### Tool 1: `chapter_get` — 整章原文获取

```python
def chapter_get(chapter_num: int, mode: str = "full"):
    """
    Args:
        chapter_num: 章节号
        mode: "full" 完整 / "summary" 摘要 / "key_points" 关键情节
    
    自动判断章节长度：
    - < 6000 字：返回 full
    - 6000-15000 字：返回 full + 提示
    - > 15000 字：默认降级为 key_points
    """
```

#### Tool 2: `chapter_search` — 向量检索

```python
def chapter_search(query: str, top_k: int = 5, chapter_range: tuple = None):
    """
    用途：取证用（如查找特定诗词、特定描写）
    底层：Chroma 向量检索
    """
```

#### Tool 3: `character_timeline` — 角色弧光查询

```python
def character_timeline(character_name: str, chapter_range: tuple = None):
    """
    用途：保证人物前后一致
    数据来源：预处理时建好的角色弧光卡片
    """
```

#### Tool 4: `foreshadowing_lookup` — 伏笔索引查询

```python
def foreshadowing_lookup(chapter_num: int):
    """
    用途：保留原著伏笔精妙之处
    数据来源：预处理时 AI 全书扫描生成的伏笔索引
    """
```

#### Tool 5: `text2screenplay` — 生成剧本

```python
def text2screenplay(episode_num: int, source_chapters: List[int], schema_type: str):
    """
    核心生成工具
    """
```

#### Tool 6: `episode_patch` — 整集修改

```python
def episode_patch(episode_id: str, instruction: str):
    """
    用户级修改粒度 = 整集
    场景/对白修改由用户在画布手动完成
    """
```

#### Tool 7: `screenplay_validate` — Schema 校验

```python
def screenplay_validate(content: dict, schema_type: str):
    """
    防止 AI 输出格式漂移
    """
```

#### Tool 8: `skill_load` — 动态加载 skill

### 5.3 Agent 工作流示例

以"生成第 5 集"为例，agent 内部决策链：

```
[Agent 接到任务]
"生成第 5 集，对应第 3-4 回"

[Step 1] 获取摘要了解概况
   → chapter_get(3, mode="summary")
   → chapter_get(4, mode="summary")
   
[Step 2] 获取原文细节
   → chapter_get(3, mode="full")
   → chapter_get(4, mode="full")

[Step 3] 确认人物连贯性
   → character_timeline("林黛玉", chapter_range=(1, 4))
   → character_timeline("贾宝玉", chapter_range=(1, 4))

[Step 4] 检查伏笔
   → foreshadowing_lookup(3)
   → foreshadowing_lookup(4)

[Step 5] 按需补充细节
   → chapter_search("通灵宝玉的来历", chapter_range=(1, 4))

[Step 6] 综合所有信息，生成剧本 YAML
```

---

## 六、上下文与 RAG 设计

### 6.1 核心问题

**100 万字小说 ≈ 150 万 token，远超任何模型上下文窗口**。必须设计高效的上下文策略。

### 6.2 检索方案：分层混合检索

**关键决策**：以"标签定位"为主，向量检索为辅。

| 信息类型 | 检索方式 | 数据库 |
|---------|---------|--------|
| 章节正文 | 按章节号定位 | PostgreSQL |
| 章节摘要 | 按章节号定位 | PostgreSQL |
| 角色弧光 | 按角色名查询 | PostgreSQL |
| 伏笔索引 | 按章节号查询 | PostgreSQL |
| 任意自然语言查询 | 向量检索 | Chroma |

### 6.3 为什么不能纯 RAG

**剧本生成场景下纯 RAG 的三大风险**：

1. **丢失"伏笔-呼应"关系**：判词预言所有人命运，RAG 切片检索会漏
2. **丢失"人物弧光"**：性格渐变信息按段落切散后无法保留
3. **丢失"作者文风"**：浑然一体的语言风格被切片打碎

### 6.4 为什么不能纯标签定位

- 用户："让对白模仿原著黛玉那种尖刻劲" → 必须向量检索
- 用户："让剧本出现原著的诗词" → 必须向量检索

### 6.5 Chroma 切片策略：语义切片

**预处理时用 AI 做一次"场景标记"**：

```
原文：第3回
  ↓ AI 标记
[场景1] 黛玉到贾府门外
[场景2] 黛玉进荣禧堂见贾母
[场景3] 黛玉与众姐妹相见
[场景4] 黛玉初见宝玉
[场景5] 宝玉摔玉
  ↓
每个"场景"作为一个 chunk，向量化入库
```

**优势**：
- 每个 chunk 是完整语义单元
- 检索结果可直接用
- chunk 数量可控（红楼梦 80 回约 400-600 chunk）

### 6.6 Agent 常驻上下文

| 内容 | 大小 |
|------|------|
| Schema 定义 | ~2k token |
| Skill 内容（按需） | ~3k token |
| 全书摘要 | ~500 token |
| 主要角色档案 | ~1k token |
| 当前剧本"目录"（仅标题） | ~2k token |
| **常驻总量** | **~8-9k token** |

无论小说多大，常驻 context 都是 8-9k。原文按需通过工具获取。

### 6.7 预处理 Pipeline（Multi-Agent 并行）

```
[用户上传 70 万字红楼梦]
       ↓
[Task 创建，状态：preprocessing]
       ↓
┌──────────────────────────────────────┐
│ 预处理 Worker（并行执行）              │
│                                      │
│  Orchestrator Agent                  │
│   ├─ Summarizer × N（章节摘要并行）   │
│   ├─ Character Analyzer              │
│   ├─ Foreshadowing Indexer           │
│   └─ Scene Segmenter（语义切片）      │
│                                      │
└──────────────────────────────────────┘
       ↓
[Task 状态：ready_for_planning]
```

**预处理失败策略**：单章失败重试 3 次，仍失败则跳过并显式告知用户。

**预处理成本估算**（红楼梦 70 万字）：

| 步骤 | 成本估算 |
|------|---------|
| 章节摘要（80 章并行） | ¥30 |
| 全书摘要 + 角色弧光 | ¥50 |
| 伏笔索引 | ¥20 |
| 语义切片 | ¥30 |
| 向量化 | ¥5 |
| **总计** | **约 ¥135** |

---

## 七、数据库设计

### 7.1 PostgreSQL 表结构

```
novels (小说)
  ├─ id
  ├─ title, author
  ├─ original_text_url      -- 原文存对象存储
  ├─ summary                -- 全书摘要
  ├─ character_arcs         -- JSONB，所有角色弧光
  ├─ foreshadowing          -- JSONB，伏笔索引
  ├─ status                 -- preprocessing/ready/failed
  └─ created_at

chapters (章节)
  ├─ id
  ├─ novel_id (FK)
  ├─ chapter_num
  ├─ title
  ├─ content                -- 章节完整原文
  ├─ summary                -- 章节摘要
  ├─ key_events             -- JSONB
  ├─ preprocessing_status
  └─ retry_count

scenes_in_novel (RAG 切片表)
  ├─ id
  ├─ chapter_id (FK)
  ├─ scene_index
  ├─ content
  ├─ vector_id              -- Chroma 里的 ID
  └─ characters             -- JSONB

characters (角色)
  ├─ id
  ├─ novel_id (FK)
  ├─ name
  ├─ role                   -- 主角/配角
  ├─ arc_description
  └─ timeline               -- JSONB

screenplays (剧本)
  ├─ id
  ├─ novel_id (FK)
  ├─ schema_type            -- ai_video/screenwriter/overview
  ├─ adaptation_plan        -- JSONB，集→章映射方案
  ├─ status
  └─ created_at

episodes (剧本集)
  ├─ id
  ├─ screenplay_id (FK)
  ├─ episode_num
  ├─ title
  ├─ source_chapters        -- INT[]
  ├─ content                -- JSONB，完整集内容
  ├─ status                 -- pending/generating/done
  └─ generated_at

episode_versions (版本管理)
  ├─ id
  ├─ episode_id (FK)
  ├─ version
  ├─ content                -- JSONB
  ├─ modified_by            -- user/ai
  └─ modified_at

tasks (异步任务)
  ├─ id
  ├─ type                   -- preprocess/generate_episode
  ├─ novel_id / episode_id
  ├─ status                 -- pending/running/done/failed
  ├─ progress               -- 0-100
  ├─ error_message
  └─ retry_count

conversations (对话历史)
  ├─ id
  ├─ screenplay_id (FK)
  ├─ messages               -- JSONB
  └─ updated_at

skills (技能包)
  ├─ id
  ├─ name
  ├─ description
  ├─ content                -- JSONB，包含 SKILL.md / glossary / examples
  ├─ created_by             -- 内置/用户名（预留扩展）
  └─ created_at
```

### 7.2 Chroma Collection 设计

```
collection: novel_{novel_id}_scenes
  - id: scene_id
  - embedding: vector
  - metadata: 
      - chapter_num: int
      - scene_index: int
      - characters: list[str]
  - document: scene 原文
```

---

## 八、生成流程设计

### 8.1 完整用户流程

```
[Step 1] 上传小说
   ↓
[Step 2] 异步预处理（3-5 分钟）
   - 章节拆分
   - 摘要生成（并行）
   - 角色弧光分析
   - 伏笔索引
   - 语义切片 + 向量化
   - WebSocket 推送进度
   ↓
[Step 3] 选择剧本类型
   - AI 视频版 / 编剧版 / 概览版
   ↓
[Step 4] 生成改编方案（强制确认环节）
   - Agent 分析全书戏剧结构
   - 提议集数和集→章映射
   - 例："建议改成 40 集，结构如下..."
   ↓
[Step 5] 用户确认/调整方案
   - 第一版仅支持调整集数（让 AI 重新分配）
   - 后续版本支持手动指定章节映射
   ↓
[Step 6] 按需生成
   - 用户触发"生成第 1 集"
   - Agent 1 分钟内出结果
   - 用户审阅、画布修改
   - 触发"批量生成剩余集数"
   ↓
[Step 7] 流式增量生成
   - 第 1 集生成完 → WebSocket 推送 → 前端立即显示
   - 第 2 集开始生成（用户已开始读第 1 集）
   - 持续推送直到全部完成
   ↓
[Step 8] 修改与导出
   - 用户对话修改（整集级）
   - 用户画布手动改（场景/对白级）
   - 导出 YAML（后续支持 PDF / DOCX / FDX）
```

### 8.2 修改权限模型

| 操作 | 执行方 |
|------|--------|
| 整集重写 / 整集风格调整 | Agent |
| 场景内对白修改 | 用户手动 |
| 单条台词修改 | 用户手动 |
| 添加/删除场景 | 用户手动 |

**画布即 source of truth**：Agent 每次工作时基于用户当前画布最新状态。用户的手动修改会被 Agent 看到，无需复杂的 lock 机制。

**Agent 修改时必须告知变更范围**：

```
用户：第2集的对白整体偏硬，调温柔点
Agent：好的，我修改了第2集所有场景的对白。
       主要变化：
       - 场景1：林黛玉的"有"改为"这里坐着人呢"
       - 场景2：贾宝玉的"我看没有"改为"介意我坐一下吗"
       ...
       [画布已更新，请查看]
```

### 8.3 流式生成的关键设计

**为什么流式优于并行**：

> 用户的体验是"看到第一集的速度"，不是"全部生成完的时间"

- 1 分钟后开始读第 1 集（不用等 40 分钟）
- 用户读完第 5 集时，后面 35 集早已生成完
- 上下文累积传递，剧本连贯性自然保证
- 用户在第 1 集调整的风格，自动应用到后续集

**任务状态持久化**：
- 用户关掉浏览器再回来，能看到上次进度
- Worker 挂了重启后，从已完成的最后一集继续
- 不要从头再来

---

## 九、关键技术决策回顾

### 9.1 已确定的决策清单

| 决策点 | 选择 | 关键理由 |
|--------|------|---------|
| 剧本格式 | 三套 Schema（AI 视频/编剧/概览） | 用户需求差异巨大 |
| Agent 架构 | 单 Agent + 多工具 | 任务有强依赖关系 |
| 预处理 | Multi-Agent 并行 | 任务独立，可并行加速 |
| 生成方式 | 单 Agent 串行 + 流式推送 | 保证连贯性 + 优化用户体感 |
| 小说体量上限 | 100 万字 | 覆盖红楼梦量级 |
| 修改粒度 | 整集由 Agent，场景/对白由用户 | 各自擅长领域 |
| 改编方案 | 强制确认环节 | 避免 80 回硬转 80 集的节奏崩溃 |
| 上下文策略 | 分层混合检索 | 单纯 RAG 或单纯标签都不行 |
| 切片策略 | 语义切片（非固定长度） | 保持场景完整性 |
| 向量库 | Chroma | 团队熟悉、轻量 |
| 关系库 | PostgreSQL + JSONB | 强关系 + 文档型字段 |
| 部署方式 | Docker + docker-compose | 方便用户自部署 |
| Skill 系统 | 内置 5 个 + 预留接口 | 快速启动 + 未来扩展 |
| 预处理失败 | 重试 3 次后跳过并告知用户 | 防止单点失败阻塞全流程 |
| 画布修改逻辑 | 用户覆盖优先，Agent 基于最新画布 | 简化状态管理 |

### 9.2 讨论中被否决的方案

| 否决方案 | 否决理由 |
|---------|---------|
| 80 回 → 80 集机械映射 | 节奏单位不同，影视改编通常 2:1 到 3:1 |
| 分集上传 | 破坏小说上下文连贯性，体验差 |
| 纯 RAG 检索 | 丢失伏笔、角色弧光、作者文风 |
| 纯标签定位 | 无法处理"模仿原著文风"等模糊需求 |
| Multi-Agent 并行生成剧本 | 剧本是强依赖序列，会破坏连贯性 |
| 按集分配给子 Agent | 风格漂移、转场断裂、用户修改难同步 |
| 复杂的字段锁定机制 | 用户覆盖优先足够简单可用 |

### 9.3 待回答的问题

以下问题在讨论中提出但尚未最终决策：

#### 关于 Schema
- AI 视频版的 `generation_prompt` 是否需要中英双语？
- 编剧版的 `rewrite_notes` 字段的边界感是否合适？
- 概览版的 `adaptation_difficulty` 让 AI 评估是否靠谱？

#### 关于流程
- Schema 选择时机：上传时选 vs 上传后先看概览再选？
- 角色弧光分析力度：仅主角 vs 含主要配角？

#### 关于商业化
- 导出格式：YAML / PDF / DOCX / FDX 优先级？
- 付费策略：100 万字一次生成成本 ¥100-200，需要额度系统？
- 多用户隔离：单用户 vs 多人协作？
- 小说版权与隐私：原文如何安全存储？

#### 关于实现细节
- 章节摘要细致度：200/500/1000 字？
- 跨集风格一致性：将用户偏好作为剧本级元数据持久化？
- Chroma 部署：同 compose 不同容器，方便扩容

---

## 十、待办事项

### 10.1 下一步设计任务

按优先级排序：

1. **Agent 的 System Prompt 模板设计** ⭐
   - 决定 agent 的核心行为
   - 三套 Schema 各自的 prompt 变体
   - Skill 注入机制

2. **Tool 接口的精确定义**
   - Python 函数签名
   - 输入/输出 JSON Schema
   - 错误处理约定

3. **预处理 Pipeline 的具体实现**
   - FastAPI 路由
   - Celery 任务定义
   - 失败重试逻辑

4. **数据库表的最终 DDL**
   - 所有约束、索引
   - 迁移脚本

5. **FastAPI 路由设计**
   - REST 接口契约
   - WebSocket 消息格式

6. **前端 UI 设计**
   - 画布交互细节
   - 对话框设计
   - 进度展示

7. **Docker 部署配置**
   - docker-compose.yml
   - 环境变量管理
   - 数据持久化方案

### 10.2 开发里程碑建议

**Milestone 1：MVP（单 Schema 跑通）**
- 选 1 套 Schema（建议编剧版）
- 单 agent + 基础工具
- PostgreSQL + Chroma 部署
- 支持上传、预处理、生成、导出
- 简易前端

**Milestone 2：三套 Schema 完整支持**
- 接入另外两套 Schema
- Schema 切换 UI
- 预处理性能优化

**Milestone 3：完整对话修改能力**
- 多轮对话 agent
- 画布编辑
- 版本管理

**Milestone 4：Skill 系统**
- 内置 5 个 skill
- Skill 加载机制
- 题材自动识别

**Milestone 5：生产可用**
- 异步任务断点续传
- 监控告警
- 多用户隔离
- 性能压测

---

## 附录：术语表

| 术语 | 说明 |
|------|------|
| Schema | YAML 数据结构规范，本项目共三套 |
| Episode | 剧本的一集（≠ 小说的一章） |
| Scene | 剧本中的一场戏 |
| Shot | AI 视频版中的一个分镜（3-10 秒） |
| Adaptation Plan | 改编方案，定义集→章映射 |
| Skill | 题材专属知识包（术语、模板、案例） |
| 角色弧光（Character Arc） | 角色在整剧中的性格变化曲线 |
| 伏笔索引 | 全书伏笔与呼应关系的映射 |
| 语义切片 | 按完整场景切片，区别于固定长度切片 |
| 流式增量生成 | 一集生成完立即推送，不等全部完成 |
| 画布（Canvas） | 用户编辑剧本的前端工作区 |

---

**文档维护**：本文档记录设计阶段的所有决策。后续如有变更，应在对应章节标注变更原因和日期。