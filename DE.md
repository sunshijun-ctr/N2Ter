# AI 小说转剧本工具 — 设计讨论文档

**项目名称**：AI 小说转剧本工具  
**讨论日期**：2026 年 6 月  
**文档版本**：v1.2  
**文档目的**：记录项目从需求到架构的完整设计决策过程

**v1.1 更新**：补充检索策略、Embedding 选型、PDF 导出方案、概览版自动生成流程  
**v1.2 更新**：Prompt 文件管理、Skill 加载机制、Tool Base Schema、对话历史与压缩策略、FastAPI 路由设计、多用户预留、题材选择强制化

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
9. [工程实现规范](#九工程实现规范)
10. [关键技术决策回顾](#十关键技术决策回顾)
11. [待办事项](#十一待办事项)

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

### 6.7 向量检索策略

#### 6.7.1 总体方案

**MVP 阶段：向量检索 + Rerank（不引入 BM25）**

```
[Agent 触发 chapter_search 工具]
   ↓
[Step 1] Query 预处理
   - 短 query 自动扩展（如 "葬花" → "黛玉葬花的诗词和场景描写"）
   ↓
[Step 2] Embedding（带 Redis 缓存，永久）
   - 调 BGE-M3 API（默认）或 Qwen-Embedding API（可切换）
   ↓
[Step 3] 向量检索
   - Chroma 检索 top-20
   - 支持 metadata filter（章节范围、角色过滤等）
   ↓
[Step 4] Rerank
   - BGE-Reranker-v2-m3 重排
   - top-20 → top-5
   ↓
[Step 5] 返回 Agent
   - 含元数据：chapter_num、scene_index、relevance_score
```

#### 6.7.2 为什么不引入 BM25

虽然 "BM25 + 向量 + Rerank" 是通用 RAG 最佳实践，但在本项目场景下不需要：

- **chunk 规模小**：单本小说 400-600 chunk，向量检索准确度已足够
- **Query 来自 Agent 而非用户**：Agent query 经 LLM 推理已规范化，BM25 关键词匹配价值低
- **大部分检索走 SQL**：章节、角色、伏笔等结构化数据用 PostgreSQL 直接查
- **中文 BM25 复杂度高**：需引入分词器（jieba），增加维护成本

**例外预留**：仙侠/玄幻类小说有大量自创术语时，可后续引入 BM25。Chroma 0.5+ 原生支持 hybrid search，扩展成本低。

#### 6.7.3 Embedding 模型选型

| 模型 | 维度 | 中文能力 | 备注 |
|------|------|---------|------|
| **BGE-M3** ⭐ | 1024 | ⭐⭐⭐⭐⭐ | 第一期默认，支持长文本（8192 token），多向量输出 |
| **Qwen-Embedding-v3** | 1024-2048 | ⭐⭐⭐⭐⭐ | 备选，阿里云 DashScope，稳定性好 |

**实现要求**：Embedding 模型走环境变量配置，未来切换无需改代码。

#### 6.7.4 Rerank 模型

**选型**：BGE-Reranker-v2-m3

**理由**：
- 与 BGE-M3 同源，配合度高
- 中文表现业界顶尖
- 走 API 即可，无需自托管

**延迟成本**：+200-500ms / 次。可接受。

#### 6.7.5 Embedding 缓存策略

**永久缓存** —— 存 Redis。

**理由**：
- 小说原文不变 → chunk 不变 → embedding 不变
- Agent 的常见 query 大概率重复（"林黛玉的诗"会被反复检索）
- Embedding API 单次调用 ¥0.001-0.01，但累计起来不小
- Redis 存储开销极低（每条向量 4KB）

**缓存 key 设计**：

```
embed:bge-m3:{md5(query)}  →  vector
```

带模型名是为了未来切换模型时不冲突。

### 6.8 预处理 Pipeline（Multi-Agent 并行）

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
   - 摘要生成（并行，每章 500 字）
   - 角色弧光分析（主角 + 主要配角）
   - 伏笔索引
   - 语义切片 + 向量化（BGE-M3）
   - 自动生成「概览版剧本」(免费送，让用户立即看到价值)
   - WebSocket 推送进度
   ↓
[Step 3] 用户查看概览版
   - 全书改编报告：Logline、市场类比、改编难度、分集大纲
   - 用户在此决定：是否继续生成详细版？要哪种类型？
   ↓
[Step 4] 选择详细版剧本类型（可选）
   - AI 视频版 / 编剧版
   - 也可只要概览版直接导出走人
   ↓
[Step 5] 生成改编方案（强制确认环节）
   - Agent 分析全书戏剧结构
   - 提议集数和集→章映射
   ↓
[Step 6] 用户确认/调整方案
   - 第一版仅支持调整集数（让 AI 重新分配）
   ↓
[Step 7] 按需生成 + 流式增量推送
   - 用户触发"生成第 1 集"，1 分钟出结果
   - 用户审阅、画布修改
   - 触发"批量生成剩余集数"
   - 每生成完一集立即 WebSocket 推送
   ↓
[Step 8] 修改与导出
   - 用户对话修改（整集级）
   - 用户画布手动改（场景/对白级）
   - 导出：YAML / PDF / 打包 zip
```

**关键改进**：步骤 2 自动产出概览版，让用户上传后第一份产物就是"全书改编报告"。

- 概览版生成成本低（约 ¥5-10/本），值得免费送
- 用户决策更明智：看过概览再选详细版类型，选错概率小
- 部分用户可能只需要概览版，节省后续 token 消耗

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

### 8.4 导出方案

#### 8.4.1 支持的格式

| 格式 | 用途 | 备注 |
|------|------|------|
| **YAML** | 结构化数据，可被其他工具消费 | 默认导出 |
| **PDF** | 人类阅读 | 重点优化，非 Markdown 渲染 |
| **打包 zip** | 一次性导出全部 | YAML + PDF + 概览版 PDF |

#### 8.4.2 PDF 导出 —— 自定义剧本排版（核心要求）

**问题**：常见做法（Markdown → PDF）渲染出来有 `**`、`##` 残留，结构生硬，不像剧本。

**方案**：基于 Schema 自定义排版模板，三套 Schema 各自一套。

| Schema | PDF 风格 |
|--------|---------|
| **AI 视频版** | 分镜表格式，每个 shot 一张分镜卡片，含画面描述、镜头参数、对白 |
| **编剧版** | 标准好莱坞剧本格式（场景头 / 动作描述 / 角色名居中 / 括号注斜体 / 对白居中区域） |
| **概览版** | 提案书排版，类似商业 BP，含 Logline、人物表、情节弧、分集大纲 |

**编剧版排版规则示例**：

```
              你好，陌生人
           ─────────────
             第 1 集 · 初遇

  场景 1
  ────────
  内景 - 咖啡馆 - 日

      林晚坐在靠窗的位置，面前摊着一沓建筑图
      纸。窗外的阳光斜斜地切进来，落在她半
      边脸上...

                    沈云洲
                  （走到桌边）
              这位置有人吗？

                    林晚
                  （没有抬头）
                   有。
```

- **场景头**：左对齐、加粗、与正文有视觉分隔
- **动作描述**：左对齐，正常段落
- **角色名**：居中，加粗
- **括号注**：居中，斜体
- **对白**：居中区域（约页面中间 60%），不顶到两边

#### 8.4.3 技术选型

**PDF 渲染**：**WeasyPrint**

- HTML + CSS 写排版，所见即所得
- CSS 完整支持
- 中文字体支持完善
- Python 生态，与 FastAPI 配合好

**字体**：
- **思源宋体**（剧本主字体，正文 + 对白）
- **思源黑体**（标题 / 强调）
- 都是免费可商用，嵌入字体文件避免目标机器没字体

#### 8.4.4 文件结构

```
exporters/
  ├─ yaml_exporter.py
  ├─ pdf_screenwriter.py       # 编剧版 PDF
  ├─ pdf_ai_video.py           # AI 视频版 PDF
  ├─ pdf_overview.py           # 概览版 PDF
  ├─ zip_packager.py           # 打包导出
  ├─ templates/
  │   ├─ screenwriter.html     # Jinja2 模板
  │   ├─ ai_video.html
  │   └─ overview.html
  └─ static/
      ├─ fonts/
      │   ├─ SourceHanSerif.otf
      │   └─ SourceHanSans.otf
      └─ styles/
          ├─ screenwriter.css
          ├─ ai_video.css
          └─ overview.css
```

#### 8.4.5 打包导出

用户点击"打包导出"，后端打包成 zip：

```
你好_陌生人_2026-06-05.zip
  ├─ 概览版.pdf
  ├─ 编剧版.pdf             # 或 AI视频版.pdf
  ├─ 编剧版.yaml
  ├─ 概览版.yaml
  └─ README.txt             # 文件说明
```

适用场景：用户要交付给团队 / 投资方时一次性给齐。

---

## 九、工程实现规范

本章定义项目的工程实现细节，是后续编码的直接依据。

### 9.1 Prompt 文件管理

**核心原则**：Prompt 与代码分离，文本文件管理，支持热更新。

#### 9.1.1 文件结构

```
prompts/
  ├─ preprocessing_agent.md      # 预处理（章节摘要、角色分析、伏笔索引）
  ├─ planning_agent.md            # 改编方案规划（集→章映射）
  ├─ generation_agent.md          # 剧本生成核心
  ├─ conversation_agent.md        # 多轮对话修改
  └─ summarizer_agent.md          # 对话压缩用
```

**为什么拆 4 个**：
- 预处理与生成任务性质完全不同
- Planning 是结构性工作，Generation 是细节工作，分开后 prompt 更聚焦
- Conversation 涉及多轮修改逻辑，独立维护

#### 9.1.2 Prompt 内部结构（统一模板）

每个 prompt 文件都遵循以下结构：

```markdown
# {Agent Name} Prompt

## Role
角色定义

## Capabilities
可用的工具列表

## Workflow
执行步骤

## Output Format
输出格式要求

## Constraints
约束条件

## Variables（运行时注入）
- {{schema_definition}}
- {{novel_summary}}
- {{character_arcs}}
- ...
```

#### 9.1.3 加载机制

```python
class PromptLoader:
    def load(self, name: str, variables: dict) -> str:
        template = self._read_file(f"prompts/{name}.md")
        return Template(template).render(**variables)
```

- 使用 Jinja2 渲染变量占位符
- 支持热更新（修改文件无需重启服务）
- Git 版本控制友好

### 9.2 Skill 系统实现

#### 9.2.1 加载时机

**关键原则**：使用工具前先阅读 skill。

```
[Agent 收到任务]
   ↓
[Step 1] 从 novels.genre 读取用户上传时强制选择的题材
   ↓
[Step 2] 加载对应 skill（主题材决定主 skill）
   ↓
[Step 3] 读取 SKILL.md 拼接到 system prompt
   ↓
[Step 4] 加载配套资源（glossary.json / examples.yaml）
   ↓
[Step 5] 开始调用工具，执行任务
```

#### 9.2.2 题材选择机制

**上传时强制选题材（多选，1-3 个）**：

```
请选择小说题材（必选，1-3 个）：
☑ 古装权谋     ← 主要题材
☑ 武侠         ← 次要题材
☐ 仙侠玄幻
☐ 都市情感
☐ 悬疑推理
☐ AI 短剧分镜

每个选项配说明文字和样例书目，帮用户判断。
```

**为什么强制选**：
- 用户对自己作品最了解，AI 识别不如人选准
- 多选支持混合题材（《庆余年》：古装权谋 + 武侠）
- 主题材决定主 skill，次题材作为辅助提示

**预处理时 AI 二次确认**：

预处理过程中 AI 会做一次题材识别。**仅在 AI 判断与用户选择差异很大时**（置信度 > 80% 且不一致）才弹提示：

```
你选择的题材：仙侠玄幻
AI 分析后建议：都市情感（置信度 85%）

⚠ 题材选择会影响剧本质量。要修改吗？
[修改为 AI 建议] [保持我的选择]
```

差异不大时静默通过，避免打扰用户。

#### 9.2.3 Skill 文件结构

```
skills/
  ├─ skill_general/             # 默认通用 skill（兜底）
  ├─ skill_urban_drama/         # 都市情感
  ├─ skill_xianxia/             # 仙侠玄幻
  ├─ skill_ancient_power/       # 古装权谋
  ├─ skill_wuxia/               # 武侠
  ├─ skill_suspense/            # 悬疑推理
  └─ skill_ai_shorts/           # AI 短剧分镜

每个 skill 内部：
  ├─ SKILL.md                   # 给 agent 看的指令
  ├─ glossary.json              # 题材术语词典
  └─ examples.yaml              # few-shot 改编案例
```

### 9.3 Tool 基础架构

#### 9.3.1 Base Schema 设计

**核心原则**：所有工具继承统一基类，额外参数在 base 上扩展。

```python
# tools/base.py
class ToolStatus(str, Enum):
    SUCCESS = "success"
    FAILED = "failed"
    FALLBACK = "fallback"

class ToolResult(BaseModel):
    status: ToolStatus
    data: Any = None
    error: Optional[str] = None
    metadata: dict = {}
    retry_count: int = 0
    used_fallback: bool = False

class BaseToolInput(BaseModel):
    novel_id: str
    request_id: str

class BaseTool(ABC):
    name: str
    description: str
    max_retries: int = 3
    
    @abstractmethod
    async def execute(self, input_data: BaseToolInput) -> ToolResult:
        pass
    
    @abstractmethod
    async def fallback(self, input_data: BaseToolInput) -> ToolResult:
        """主逻辑失败时的降级方案"""
        pass
    
    async def run(self, input_data: BaseToolInput) -> ToolResult:
        """统一执行入口：重试 3 次失败后 fallback"""
        for attempt in range(self.max_retries):
            try:
                result = await self.execute(input_data)
                result.retry_count = attempt
                return result
            except Exception:
                await asyncio.sleep(2 ** attempt)  # 指数退避
        
        # 重试 3 次失败 → fallback
        result = await self.fallback(input_data)
        result.used_fallback = True
        return result
```

#### 9.3.2 错误处理与 Fallback 策略

**原则**：每个工具都有 fallback，永远返回有用的东西。

| 工具 | 主逻辑 | Fallback |
|------|--------|----------|
| `chapter_get` | 取完整章节 | 取章节摘要 → 取章节标题 |
| `chapter_search` | 向量检索 + Rerank | 仅向量检索（跳过 rerank） → 返回章节摘要 |
| `character_timeline` | 查角色完整时间线 | 查角色基本信息 |
| `foreshadowing_lookup` | 查伏笔索引 | 返回空数组（不影响主流程） |
| `text2screenplay` | 完整生成 | 简化 Schema 生成（减少字段） |
| `episode_patch` | 局部修改 | 返回原内容 + 错误提示，让用户重试 |
| `screenplay_validate` | 严格 Schema 校验 | 宽松校验（仅必填字段） |

#### 9.3.3 工具注册中心

```python
class ToolRegistry:
    def register(self, tool: BaseTool): ...
    def get(self, name: str) -> BaseTool: ...
    def list_for_agent(self) -> list[dict]:
        """生成给 LLM 的工具定义"""
        ...
```

启动时统一注册所有工具，agent 通过 registry 调用。

### 9.4 对话历史管理

#### 9.4.1 数据模型

```
conversations (对话会话)
  ├─ id                       UUID
  ├─ user_id                  -- 用户 ID（预留字段，第一期默认值）
  ├─ novel_id (FK)
  ├─ screenplay_id (FK)       -- 可空，未选 Schema 前
  ├─ title                    -- AI 自动生成或用户改
  ├─ context_type             -- preprocessing/planning/generation/conversation
  ├─ status                   -- active/archived
  └─ ...

messages (对话消息)
  ├─ id                       UUID
  ├─ conversation_id (FK)
  ├─ role                     -- user/assistant/tool
  ├─ content                  -- TEXT
  ├─ tool_calls               -- JSONB
  ├─ tool_results             -- JSONB
  ├─ token_usage              -- JSONB
  ├─ is_pinned                -- BOOL，关键决策点标记
  ├─ is_compressed            -- BOOL，已被压缩进摘要
  └─ ...

compressed_segments (压缩段)
  ├─ id
  ├─ conversation_id (FK)
  ├─ summary                  -- 中间对话摘要
  ├─ original_message_ids     -- 被压缩的消息 ID 列表
  └─ compressed_at
```

#### 9.4.2 多窗口多任务支持

同一小说下可有多个 conversation，对应不同任务：

```
红楼梦 编剧版
  ├─ conv_001: "整体风格调整"
  ├─ conv_002: "林黛玉对白优化"
  └─ conv_003: "前 10 集节奏问题"
```

用户切换标签页时，从数据库加载对应 conversation 的历史消息。

#### 9.4.3 对话压缩策略

**核心算法：Anchor + Compress（头尾保留 + 中间压缩 + 关键点固定）**

参数：
- **触发阈值**：60% × Claude Sonnet 200K context = **120K token**
- **保留头部**：3 轮（user + assistant 视为 1 轮）
- **保留尾部**：3 轮
- **关键点固定**：is_pinned = true 的消息无论位置一律保留

**关键决策点的识别**：

```python
PINNED_KEYWORDS = [
    "确认方案", "改编方案", "集数",
    "风格", "题材", "切换 Schema"
]

def is_pinned_message(msg: Message) -> bool:
    if msg.metadata.get("user_pinned"):
        return True
    if msg.role == "user" and any(kw in msg.content for kw in PINNED_KEYWORDS):
        return True
    return False
```

**压缩流程**：

```
1. 检查 token 是否达到 120K（60% × 200K）
2. 取出所有消息，分类为：head / middle / tail / pinned
3. 中间区域的非 pinned 消息 → 调 summarizer_agent 生成摘要
4. 持久化摘要到 compressed_segments 表
5. 中间消息标记 is_compressed = true（不删除，仅跳过）
6. 后续构建 context 时：head + pinned + 摘要 + tail
```

**压缩 Prompt**：

```
保留：
1. 用户做出的具体决策
2. agent 完成的修改
3. 已确认的偏好

不需要保留：
- 客套话、确认语
- 工具调用细节
- 已被后续对话覆盖的临时决定

输出：3-5 条要点
```

#### 9.4.4 会话标题自动生成

对话进行 3 轮后，调便宜的 LLM 生成标题：

```python
async def auto_title_conversation(conv_id: str):
    msgs = await db.get_messages(conv_id, limit=6)
    if len(msgs) >= 6 and not conversation.has_title:
        title = await llm.generate_title(msgs)
        await db.update_conversation_title(conv_id, title)
```

像 ChatGPT 那样，列表里显示"林黛玉对白优化"而不是"新对话"。

### 9.5 API 路由设计

#### 9.5.1 多用户隔离

**第一期实现**：每张表加 `user_id` 字段，第一期固定默认值。

**原因**：
- 加字段成本几乎为零
- 未来要加登录系统不用改表结构
- 暂不实现完整 OAuth，但路由参数预留 user_id

#### 9.5.2 REST 路由（资源管理）

```
# 小说管理
POST   /api/novels                          # 上传小说 + 选题材
GET    /api/novels/{novel_id}
GET    /api/novels
DELETE /api/novels/{novel_id}

# 剧本管理
POST   /api/screenplays                     # 创建剧本（选 Schema）
GET    /api/screenplays/{id}
GET    /api/novels/{novel_id}/screenplays

# 集管理
GET    /api/screenplays/{id}/episodes
GET    /api/episodes/{episode_id}
PUT    /api/episodes/{episode_id}           # 用户手动修改（画布编辑）

# 对话管理
POST   /api/conversations
GET    /api/conversations
GET    /api/conversations/{conv_id}/messages
DELETE /api/conversations/{conv_id}

# 任务管理
GET    /api/tasks/{task_id}
POST   /api/tasks/{task_id}/cancel

# 导出
POST   /api/screenplays/{id}/export
GET    /api/exports/{export_id}/download

# Skill 管理
GET    /api/skills
```

#### 9.5.3 WebSocket 路由（实时通信）

主要业务走 WebSocket：

```
WS /ws/conversations/{conv_id}
```

**消息类型**：

```
client → server:
  - {"type": "message", "content": "..."}
  - {"type": "stop"}                              # 中断 agent

server → client:
  - {"type": "message_start"}
  - {"type": "content_delta", "text": "..."}      # 流式文本
  - {"type": "tool_call", ...}                    # 工具调用通知
  - {"type": "tool_result", ...}                  # 工具结果
  - {"type": "message_end"}
  - {"type": "episode_generated", "episode": {...}}
  - {"type": "task_progress", "progress": 45}
  - {"type": "error", "error": "..."}
```

#### 9.5.4 WebSocket 重连策略

用户网络断开重连时，恢复：
- ✅ 历史消息（必须）
- ✅ 正在执行的任务状态（必须，让用户看到 agent 还在工作）
- ❌ 部分流式输出（不做，用户刷新页面即可）

### 9.6 前端展示规范

#### 9.6.1 工具调用展示

**默认折叠**：

```
┌──────────────────────────────────────────┐
│ Claude                                   │
│                                          │
│ ▶ [工具调用 · 3 步]    ← 默认折叠         │
│                                          │
│ 我已经把第 5 集所有场景的对白调整为文雅风格。│
│ ...                                      │
└──────────────────────────────────────────┘
```

**展开后**：

```
▼ [工具调用 · 3 步]
  ├─ chapter_get(5, mode="full")  · 156ms · 成功
  ├─ character_timeline("林黛玉")  · 89ms · 成功
  └─ episode_patch(ep_5, ...)     · 3.2s · 成功
```

**不做全局开关**，保持 UI 简洁。

### 9.7 项目文件结构

```
backend/
├─ app/
│   ├─ main.py
│   ├─ routes/
│   │   ├─ novels.py
│   │   ├─ screenplays.py
│   │   ├─ episodes.py
│   │   ├─ conversations.py
│   │   ├─ tasks.py
│   │   ├─ exports.py
│   │   └─ websocket.py
│   ├─ agents/
│   │   ├─ base_agent.py
│   │   ├─ preprocessing_agent.py
│   │   ├─ planning_agent.py
│   │   ├─ generation_agent.py
│   │   └─ conversation_agent.py
│   ├─ tools/
│   │   ├─ base.py
│   │   ├─ chapter_get.py
│   │   ├─ chapter_search.py
│   │   ├─ character_timeline.py
│   │   ├─ foreshadowing_lookup.py
│   │   ├─ text2screenplay.py
│   │   ├─ episode_patch.py
│   │   ├─ screenplay_validate.py
│   │   └─ registry.py
│   ├─ services/
│   │   ├─ prompt_loader.py
│   │   ├─ skill_loader.py
│   │   ├─ embedding_service.py
│   │   ├─ rerank_service.py
│   │   ├─ llm_service.py
│   │   └─ conversation_compressor.py
│   ├─ models/                       # SQLAlchemy
│   ├─ schemas/                      # Pydantic
│   ├─ workers/                      # Celery
│   └─ exporters/
├─ prompts/
│   ├─ preprocessing_agent.md
│   ├─ planning_agent.md
│   ├─ generation_agent.md
│   ├─ conversation_agent.md
│   └─ summarizer_agent.md
├─ skills/
│   ├─ skill_general/
│   ├─ skill_urban_drama/
│   ├─ skill_xianxia/
│   └─ ...
├─ alembic/
├─ tests/
├─ docker/
│   ├─ Dockerfile.api
│   ├─ Dockerfile.worker
│   └─ docker-compose.yml
└─ pyproject.toml
```

---

## 十、关键技术决策回顾

### 10.1 已确定的决策清单

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
| Embedding 模型 | BGE-M3（默认）+ Qwen-Embedding-v3（备选） | 国内最优、支持长文本、可配置切换 |
| 检索策略 | 向量检索 + Rerank（不引入 BM25） | chunk 规模小，Rerank 性价比高 |
| Rerank 模型 | BGE-Reranker-v2-m3 | 与 BGE-M3 同源，中文顶尖 |
| Embedding 缓存 | 永久缓存（Redis） | 小说不变，query 大概率重复 |
| 概览版生成时机 | 预处理完成时自动生成 | 用户上传即拿到价值产物 |
| Schema 选择时机 | 看完概览后再选详细版类型 | 决策更明智 |
| 章节摘要细致度 | 500 字 | 平衡 token 成本与上下文质量 |
| 角色弧光分析力度 | 主角 + 主要配角 | 平衡完整性与成本 |
| 跨集风格一致性 | 用户偏好持久化为剧本级元数据 | 后续集自动延续风格 |
| 导出格式 | YAML + PDF + 打包 zip | 满足结构化消费与人类阅读 |
| PDF 排版方案 | 自定义模板（非 Markdown 渲染） | 真正的剧本视觉体验 |
| PDF 技术选型 | WeasyPrint + 思源字体 | HTML+CSS 模板，所见即所得 |
| 关系库 | PostgreSQL + JSONB | 强关系 + 文档型字段 |
| 部署方式 | Docker + docker-compose | 方便用户自部署 |
| Skill 系统 | 内置 5 个 + 预留接口 | 快速启动 + 未来扩展 |
| 预处理失败 | 重试 3 次后跳过并告知用户 | 防止单点失败阻塞全流程 |
| 画布修改逻辑 | 用户覆盖优先，Agent 基于最新画布 | 简化状态管理 |
| Prompt 管理 | 单独文件管理（4 个 prompt） | 与代码分离，热更新 |
| Skill 加载时机 | 使用工具前阅读 | Claude Skills 设计哲学 |
| 题材选择 | 上传时强制选（多选 1-3 个） | 用户最了解自己作品，混合题材常见 |
| 题材二次确认 | AI 预处理时识别，差异大才提示 | 防止用户选错 |
| Tool 基础架构 | Base Schema + 扩展额外参数 | 减少重复代码 |
| 错误处理 | 重试 3 次 → fallback 降级 | 永远返回有用结果 |
| 多用户隔离 | 预留 user_id 字段（第一期默认值） | 几乎零成本预留扩展 |
| 对话历史存储 | 持久化到数据库 | 支持多窗口多任务 |
| 对话压缩策略 | Anchor + Compress | 头 3 尾 3 + 关键点固定 + 中间压缩 |
| 压缩触发阈值 | 60% × 200K = 120K token | Claude Sonnet 为基准 |
| 关键点保护 | is_pinned 标记，永不压缩 | 集数、风格、Schema 切换等关键决策 |
| 会话标题 | 3 轮后自动生成 | 类 ChatGPT 体验 |
| API 路由 | REST + WebSocket 双通道 | REST 管资源，WS 管实时通信 |
| WebSocket 重连 | 恢复历史 + 任务状态，不恢复流式输出 | 简化实现，体验已足够 |
| 工具调用展示 | 默认折叠，点击展开，无全局开关 | UI 简洁 |

### 10.2 讨论中被否决的方案

| 否决方案 | 否决理由 |
|---------|---------|
| 80 回 → 80 集机械映射 | 节奏单位不同，影视改编通常 2:1 到 3:1 |
| 分集上传 | 破坏小说上下文连贯性，体验差 |
| 纯 RAG 检索 | 丢失伏笔、角色弧光、作者文风 |
| 纯标签定位 | 无法处理"模仿原著文风"等模糊需求 |
| Multi-Agent 并行生成剧本 | 剧本是强依赖序列，会破坏连贯性 |
| 按集分配给子 Agent | 风格漂移、转场断裂、用户修改难同步 |
| 复杂的字段锁定机制 | 用户覆盖优先足够简单可用 |
| 上传时单选题材 | 混合题材小说（如庆余年）单选无法覆盖 |
| AI 自动识别题材（用户被动） | 用户对自己作品最了解，让 AI 猜不如让用户选 |
| 引入 BM25 | chunk 规模小，纯向量+Rerank 已足够 |
| 工具调用全局展开开关 | 增加 UI 复杂度，普通用户用不到 |
| 简单截断式对话压缩 | 丢失头部需求与关键决策 |

### 10.3 待回答的问题

#### 关于 Schema（已决策 ✅）
- ✅ AI 视频版的 `generation_prompt` 仅中文版
- ✅ 编剧版的 `rewrite_notes` 字段保留
- ✅ 概览版的 `adaptation_difficulty` 让 AI 评估

#### 关于流程（已决策 ✅）
- ✅ Schema 选择时机：上传后先看概览再选
- ✅ 角色弧光分析力度：主角 + 主要配角
- ✅ 章节摘要细致度：500 字
- ✅ 跨集风格一致性：用户偏好持久化为剧本级元数据
- ✅ 概览版生成：预处理完成时自动生成
- ✅ 题材选择：上传时强制选（多选 1-3 个）+ AI 二次确认

#### 关于 RAG 与检索（已决策 ✅）
- ✅ Embedding 模型：BGE-M3（默认，可配置）
- ✅ Rerank 第一期加入：BGE-Reranker-v2-m3
- ✅ 不引入 BM25（chunk 规模小不需要）
- ✅ Embedding 缓存：永久（Redis）

#### 关于导出（已决策 ✅）
- ✅ 导出格式：YAML + PDF + 打包 zip
- ✅ PDF 排版：自定义模板（WeasyPrint + 思源字体）
- ✅ 三套 Schema 各自对应一套 PDF 模板

#### 关于工程实现（已决策 ✅）
- ✅ Prompt 单独文件管理（4 个 prompt）
- ✅ Skill 使用工具前阅读
- ✅ Tool 用 Base Schema + 扩展
- ✅ 错误处理：重试 3 次 → fallback
- ✅ 多用户：预留 user_id 字段
- ✅ 对话历史持久化数据库
- ✅ 对话压缩：Anchor + Compress，60% 触发，头3尾3，关键点 pinned
- ✅ WebSocket 重连：恢复历史+任务状态
- ✅ 工具调用：折叠显示，无全局开关

#### 关于商业化（暂不考虑，留待后续）
- 付费策略：100 万字一次生成成本 ¥100-200，需要额度系统？
- 多用户隔离：完整 OAuth？协作模式？
- 小说版权与隐私：原文如何安全存储？

---

## 十一、待办事项

### 11.1 下一步设计任务

按优先级排序，已完成项打 ✅：

1. ✅ **Schema 设计完成**（v1.0）
2. ✅ **架构与技术栈定型**（v1.0）
3. ✅ **RAG 与检索策略定型**（v1.1）
4. ✅ **导出方案定型**（v1.1）
5. ✅ **工程实现规范定型**（v1.2，含 Prompt/Skill/Tool/对话/路由）
6. **预处理 Pipeline 的具体实现** ⭐ ← 下一步
   - 章节拆分规则
   - 多 agent 并行编排
   - Celery 任务定义
   - 失败重试与跳过逻辑
7. **Agent System Prompt 模板编写**
   - 4 个 prompt 文件具体内容
8. **数据库 DDL 最终版**
   - 所有约束、索引
   - Alembic 迁移脚本
9. **前端 UI 设计**（用户后续提供）
10. **Docker 部署配置**

### 11.2 开发里程碑建议

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
| BGE-M3 | 智源研究院开源的多语言 embedding 模型，本项目默认 |
| Rerank | 检索后重排，提升 top-K 相关性 |
| WeasyPrint | HTML/CSS 转 PDF 的 Python 库，本项目用于自定义 PDF 排版 |
| 思源字体 | Adobe 与 Google 合作的开源中文字体（思源宋体/黑体） |
| Anchor + Compress | 对话压缩策略：头尾保留 + 中间压缩 + 关键点固定 |
| is_pinned | 关键决策点标记，压缩时永不丢弃 |
| Fallback | 工具主逻辑失败后的降级方案，确保返回有用结果 |
| ToolResult | 所有工具的统一返回格式（status / data / metadata） |
| context_type | 对话类型标记（preprocessing / planning / generation / conversation） |

---

**文档维护**：本文档记录设计阶段的所有决策。后续如有变更，应在对应章节标注变更原因和日期。