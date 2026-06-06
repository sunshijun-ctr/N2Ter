# Agent 主导剧本写作流程讨论稿

版本：v0.5  
目的：把当前“Service 拼上下文后一次性调用 LLM”的剧本生成方式，改造成“单 Agent 主导、ReAct 风格、高效工具调用、连续写作、可追踪、可讨论”的剧本写作流程。

---

## 1. 当前判断

当前后端虽然有 `agents/` 目录和工具注册机制，但真实分集剧本生成主要由 `GenerationService.generate_episode()` 驱动：

1. 根据 episode 的 `source_chapters` 查数据库。
2. 拼接章节摘要、原文、上一集摘要、人物弧光、schema。
3. 一次性调用 LLM 生成剧本 JSON。
4. 失败后走 deterministic fallback。

这意味着现在的“剧本写作”不是 agent 主导，而是 service 主导。agent 更像一个薄包装，真正参与创作决策的程度很低。

目标是让 agent 成为剧本写作过程的主执行者：它需要理解任务、主动调用工具、收集必要信息、规划本集、写作、审稿、修订，并给出可追踪的执行轨迹。

---

## 2. 已确定决策

1. **第一版只做单 Agent**  
   效果不行再考虑多 Agent。当前不引入复杂 multi-agent 架构。

2. **偏 ReAct 风格，但必须高效**  
   Agent 可以思考、调用工具、观察结果、继续行动，但不能无限思考，也不能无限调用工具。

3. **ReAct 轮数先按 8 轮设计**  
   参考 ReAct 论文的节奏，第一版先以 8 个 ReAct step 为默认上限。

4. **单个工具限用 2-3 次**  
   大部分工具每次 episode run 内最多调用 2-3 次。特殊情况如 `chapter_get` 可按 source chapters 数量放宽，但也必须有上限。

5. **目前不做强编排**  
   先不把流程硬拆成代码级固定 pipeline。Agent 自己主导完成任务，但必须有预算、停止条件和工具调用策略。

6. **Agent 接管剧本生成任务**  
   第一阶段接管“剧本生成”，尤其是单集生成和整部剧连续生成。上传、预处理、导出等确定性流程暂不交给 agent。

7. **需要支持连续生成整部剧**  
   用户不应该每一集都手动点生成。理想体验是确认方案后，agent 像写作业一样连续写：写完一集填一集，再继续下一集。

8. **连续生成不是一个超长上下文会话**  
   工程上应是多个串行 episode agent run。每一集独立运行，但共享结构化剧本记忆。

9. **连续生成期间不允许用户修改剧本**  
   为避免 memory 和实际 episode 内容不一致，整剧连续生成过程中锁定编辑。用户可以观看实时填充结果，但不能修改。全部生成完成或用户停止任务后，再开放修改。

10. **默认打开第 1 集并实时填充**  
    整剧连续生成启动后，前端默认打开第 1 集。每生成完一集，就实时填入对应 episode，用户可以看到进度和内容逐集出现。

11. **必须能高效调用工具完成任务**  
    工具不是摆设。Agent 写剧本前应该主动查原文、查人物、查伏笔、查上下集，但调用要有目的，不拖拉。

12. **Trace 只做当次可见，不长期保存**  
    Trace 主要用于当次生成时展示 agent 进度和工具轨迹，不作为长期核心资产。第一版可以存在任务运行态、缓存或 task metadata 中，任务结束后可不长期保留。

13. **Trace 不是完整私密思考链**  
    Trace 展示 agent 做了哪些步骤、调用了哪些工具、简短理由和结果摘要。不保存或展示完整 chain-of-thought，而是保存可审计的 `reason_summary`。

14. **Critique 目前只做一轮**  
    第一版只做：初稿 -> 一轮 critique -> 修订 -> validate。

15. **生成时不准改 adaptation plan**  
    生成阶段必须尊重既有分集方案。完全生成好之后，用户可以通过改稿或重新规划来调整。

16. **RAG 检索证据目前不必展示给用户**  
    内部可用，但前端不强制展示 source evidence。后续如果要做透明化再加。

17. **对话 Agent 允许整集级修改**  
    场景级、对白级细改先交给用户在画布手动编辑。Agent 负责整集级修改，如节奏、人物动机、风格、结构、冲突强化。

18. **对话整集改稿用轻量 ChatAgent**  
    不需要复用完整生成 agent。可以做一个小的 ChatAgent，读取每一集的参数、当前 episode 内容、schema、相关上下文后执行整集级修改。

19. **生成失败由用户选择**
    失败时暂停任务，给用户选择：重试，使用 fallback，或停止。

20. **暂不做质量阈值**
    “质量分数”的标准暂时不清晰，不做低于某值自动重写。Critique 可以给问题列表，但不作为自动门禁。

21. **不同剧本类型需要不同 prompt**
    三类输出差异很大，不能用一个大 prompt 粗暴覆盖：
    - AI 视频版：供视频 AI 生成视频的剧本，重点是 shot 级分镜、镜头、画面、动作、`generation_prompt`
    - 编剧工作版：供人类编剧继续工作的剧本，重点是 scene、场景描述、对白、潜台词、改写说明
    - 概览版：极简结构、分集概览、市场判断、改编难度

22. **AI 视频版不是让本系统生成视频**
    “AI 视频版”指输出可喂给视频 AI 的剧本格式，不是让 agent 直接生成视频。

23. **概览版可以更简单，LLM 可直接完成**
    概览版不一定走完整 ReAct 写作流程。它更像快速结构化总结，可以由 LLM 基于预处理结果直接生成，必要时少量调用工具。

24. **screenplay_memory 先存 JSON**
    第一版不单独建复杂 memory 表，先放 JSON/JSONB，读取和更新都更直接。

25. **Prompt 采用 base + 类型叠加**
    三类 prompt 共用 `episode_agent_base.md`，再叠加 `episode_agent_ai_video.md` / `episode_agent_screenwriter.md` / `episode_agent_overview.md`。这样维护更便捷，共同规则只写一份。

26. **编剧工作版强制输出 `source_text_excerpt`**
    `source_text_excerpt` 对人类编剧回看原文、判断改编是否忠实很重要，因此编剧工作版强制输出。AI 视频版和概览版不强制。

27. **Fallback 只兜当前失败集**
    整剧连续生成中，如果某一集失败，用户选择 fallback 后，只对当前失败集使用 fallback 草稿。下一集继续由 Agent 正常生成，不进入连续 fallback。

28. **剧本生成完成后主写作 Agent 退场**
    整部剧生成完成后，EpisodeWritingAgent / ScreenplayWritingRunner 的任务结束。后续善后、微调、整集级修改交给轻量 ChatAgent。

29. **ChatAgent 改稿后需要更新 screenplay_memory**
    因为 ChatAgent 后续也会参考 `screenplay_memory` 来理解人物状态、结尾钩子、未解决悬念等参数，所以某一集被 ChatAgent 修改后，需要更新该集对应的 memory patch。

30. **大范围不满意时只支持整剧重生成**
    如果用户对很多集都不满意，不做“部分集重生成”。直接提供整剧重新生成能力。首次生成没有用户额外修改方向；整剧重生成时允许用户加入整体建议和修改方向。

31. **ChatAgent 直接输出 memory patch**
    ChatAgent 执行整集级改稿时，除了输出修改后的 episode content，也要直接输出该集对应的 memory patch，不再额外引入独立 memory updater。

32. **`episode_rewrite` 作为工具暴露给 ChatAgent**
    ChatAgent 通过 `episode_rewrite` 工具执行整集级改稿。工具负责保存 episode 新版本，并写入 ChatAgent 输出的 memory patch。

33. **整剧重生成创建新的分支版本**
    整剧重生成不覆盖旧 screenplay，而是创建新的 screenplay 分支版本。旧版本保留，方便用户比较和回退。

34. **Screenplay 分支结构由后端显式记录**
    新分支 screenplay 需要记录父版本、分支名、分支类型、重生成说明和 plan 来源，便于回溯和对比。

35. **整剧重生成前允许调整 adaptation plan**
    用户可以在重生成前调整分集方案。新分支可以复用原 plan，也可以使用用户调整后的新 plan。

36. **前端使用双窗口并排对比分支**
    两个 screenplay 分支版本的比较方式采用并行双窗口：左侧一个版本，右侧一个版本，按 episode 对齐查看。

---

## 3. Agent 接管任务的时机

第一阶段，Agent 接管的时机是“剧本正式生成时”。

推荐主入口：

```text
POST /episodes/{episode_id}/generate
  单集生成，由 EpisodeWritingAgent 接管
```

推荐新增入口：

```text
POST /screenplays/{screenplay_id}/generate
  整部剧或剩余集连续生成，由 ScreenplayWritingRunner 调度多个 EpisodeWritingAgent run
```

完整产品流程应是：

```text
上传小说
  -> 预处理
  -> 生成/确认概览
  -> 创建或确认 adaptation plan
  -> 创建 screenplay episodes
  -> 用户点击“生成整部剧”或“生成剩余集”
  -> Agent 连续接管写作
```

不建议第一版让 agent 接管上传、预处理、导出等流程。这些流程确定性强，agent 接管收益不大，风险更高。

---

## 4. 连续生成整部剧

用户想要的体验不是每集手动点击生成，而是：

```text
用户确认剧本方案
  -> Agent 开始连续写
  -> 写完第 1 集，填入第 1 集
  -> 写完第 2 集，填入第 2 集
  -> 写完第 3 集，填入第 3 集
  -> ...
```

这非常适合本项目。剧本改编是连续创作，手动逐集点生成会割裂体验。

### 4.1 工程实现原则

连续生成不应该是一个 LLM 会话从第 1 集写到第 10 集。那会遇到上下文窗口膨胀、记忆漂移、错误累积和难以恢复的问题。

正确方式：

```text
ScreenplayWritingRunner
  -> Episode 1 Agent Run
     -> 保存 episode 1
     -> 更新 screenplay_memory
  -> Episode 2 Agent Run
     -> 读取 screenplay_memory + episode 2 source
     -> 保存 episode 2
     -> 更新 screenplay_memory
  -> Episode 3 Agent Run
     -> ...
```

用户体验上是连续写，工程上是串行的多个独立 agent run。

### 4.2 为什么必须串行

不建议并行生成多集，因为：

- 后一集需要知道前一集怎么收尾。
- 人物状态会随着已生成剧本变化。
- 并行生成容易风格漂移、转场断裂、伏笔重复或遗漏。
- 串行生成可以让 `screenplay_memory` 每集更新一次。

因此整剧连续生成应是：

```text
第 1 集完成 -> 更新记忆 -> 第 2 集开始 -> 更新记忆 -> 第 3 集开始
```

### 4.3 生成中锁定编辑

连续生成期间用户可以看，但不能改。

原因：

- 如果用户在第 2 集生成时修改第 1 集，memory 会立刻过期。
- 如果用户修改正在生成的集，agent 输出可能覆盖用户修改。
- 锁编辑可以让第一版状态管理简单、稳定。

交互建议：

```text
生成中：
  - 可查看已生成集
  - 可查看当前生成进度
  - 可停止任务
  - 不可编辑 episode 内容

生成完成或停止后：
  - 开放编辑
  - 可执行整集级 ChatAgent 改稿
  - 可手动修改场景和对白
```

---

## 5. 上下文与结构化记忆

LLM 上下文一定有限。超过窗口后只能截断、压缩或无法提交。

因此连续写作不能依赖“一个长对话一直记住所有内容”，而要依赖结构化记忆。

### 5.1 单集 Agent Run 的上下文

每一集生成时，Agent 应读取：

```text
全局上下文：
- 小说总摘要
- adaptation plan
- schema definition
- style preferences
- 人物弧光
- 伏笔索引

当前集上下文：
- 本集 source chapters 摘要
- 本集 source chapters 原文或关键原文
- 本集 episode plan
- 本集相关 RAG 检索

滚动连续性上下文：
- 上一集摘要
- 上一集结尾状态
- 已生成集累计短摘要
- 当前人物状态
- 未解决悬念
- 已使用的重要原文事件
```

这样 agent 不是靠“没被截断的聊天历史”连续写，而是靠“可控、可压缩、可更新的剧本记忆”连续写。

### 5.2 screenplay_memory

第一版 `screenplay_memory` 先存 JSON/JSONB，不单独建复杂表。这样实时读取和更新都更方便。

示例：

```json
{
  "generated_episodes": [
    {
      "episode_num": 1,
      "summary": "",
      "ending_hook": "",
      "ending_state": "",
      "character_state_changes": [],
      "open_threads": [],
      "used_source_events": []
    }
  ],
  "global_style_notes": [],
  "current_character_states": [],
  "unresolved_foreshadowing": [],
  "continuity_constraints": [],
  "last_updated_episode": 1
}
```

每写完一集后，Agent 或 Runner 必须生成该集的 memory patch：

```json
{
  "episode_num": 2,
  "summary": "",
  "ending_hook": "",
  "character_state_changes": [],
  "new_open_threads": [],
  "resolved_threads": [],
  "used_source_events": [],
  "style_notes": []
}
```

### 5.3 用户修改后的记忆更新

第一版由于“生成中禁止编辑”，不需要处理生成中 memory 重算。

生成完成后，用户如果通过 ChatAgent 修改某一集：

1. ChatAgent 读取当前 episode、schema、用户修改方向和必要上下文。
2. ChatAgent 输出修改后的 episode。
3. 系统为该集生成新的 memory patch。
4. 更新 `screenplay_memory.generated_episodes` 中对应 episode 的摘要、结尾状态、人物变化、open threads 等信息。

这样后续继续使用 ChatAgent 修改其他集时，读到的是最新的剧本状态。

如果用户对很多集都不满意，不支持部分集重生成，直接走整剧重生成。

---

## 6. ReAct 的边界

ReAct = Reason + Act。它适合本项目，因为剧本写作不是一次性输出，而是需要不断“查证 -> 判断 -> 写作 -> 修正”。

但 ReAct 必须有边界：

```text
允许：
Agent 为了写好本集，主动调用 chapter_get / chapter_search / character_timeline / foreshadowing_lookup。

不允许：
Agent 在没有新信息收益的情况下反复搜索、反复思考、反复校验。
```

### 6.1 单次生成预算

第一版采用偏保守预算：

| 项目 | 第一版限制 |
|---|---|
| 最大 ReAct 轮数 | 8 轮 |
| 最大工具调用总数 | 12 次左右 |
| 单个工具最大调用次数 | 2-3 次 |
| `chapter_get(full)` 最大次数 | source chapters 数量，最多 3 次 |
| `chapter_search` 最大次数 | 3 次 |
| `character_timeline` 最大次数 | 3 次 |
| `foreshadowing_lookup` 最大次数 | source chapters 数量，最多 3 次 |
| critique 轮数 | 1 轮 |
| schema 修复轮数 | 1-2 轮 |

这里的原则是：宁可第一版少查一点，也不要让 agent 拖拉、绕圈、消耗过高。

### 6.2 停止条件

Agent 满足以下条件时应该停止工具调用，进入写作：

1. 已读取本集 source chapters 的必要信息。
2. 已掌握本集主要人物状态。
3. 已检查本集相关伏笔。
4. 已形成场景/beat 计划。
5. 最近两次工具调用没有提供新的关键事实。
6. 工具预算即将耗尽。

### 6.3 禁止行为

Agent 不应该：

- 为了“更保险”无限查库。
- 没有具体 query 就调用 `chapter_search`。
- 已经拿到完整章节后，又反复搜索同一章节的同一问题。
- 在生成阶段擅自改变 episode 的 `source_chapters`。
- 在生成阶段改变 adaptation plan。
- 输出与目标 schema 无关的字段。
- 把工具原始 JSON 直接暴露给普通用户。

---

## 7. 单 Agent 主导模式

第一版只需要一个核心 agent：

```text
EpisodeWritingAgent
```

它内部完成多个职责，但不拆成多个 agent：

1. 研究素材。
2. 制定本集写作计划。
3. 生成目标类型剧本。
4. 做一轮 critique。
5. 根据 critique 修订。
6. 校验 schema。
7. 输出 memory patch。
8. 返回最终 episode content 和 trace。

这样既能保持 agent 主导，又避免 multi-agent 带来的复杂性。

---

## 8. Agent 运行协议

### 8.1 单集生成输入

```json
{
  "task": "generate_episode",
  "episode_id": "...",
  "screenplay_id": "...",
  "novel_id": "...",
  "episode_num": 5,
  "source_chapters": [9, 10],
  "schema_type": "screenwriter",
  "adaptation_plan_locked": true,
  "style_preferences": {},
  "screenplay_memory": {},
  "budgets": {
    "max_react_steps": 8,
    "max_tool_calls": 12,
    "max_tool_calls_per_tool": 3,
    "max_critique_rounds": 1
  }
}
```

### 8.2 单集生成输出

```json
{
  "episode_content": {},
  "memory_patch": {},
  "trace_summary": [],
  "critique_summary": [],
  "warnings": [],
  "status": "done"
}
```

### 8.3 整剧连续生成输入

```json
{
  "task": "generate_screenplay",
  "screenplay_id": "...",
  "start_episode": 1,
  "end_episode": 10,
  "mode": "remaining_only",
  "lock_editing": true,
  "stop_on_failure": true
}
```

### 8.4 整剧连续生成输出

```json
{
  "status": "partial|done|failed|stopped",
  "generated_episode_nums": [1, 2, 3],
  "current_episode_num": 4,
  "failed_episode_num": null,
  "next_action": "continue|retry|fallback|stop|done"
}
```

---

## 9. 推荐的 Agent 内部流程

虽然“不做强编排”，但 prompt 中仍应给 agent 一个推荐工作顺序。它可以根据任务跳过不必要步骤，但最终必须完成写作目标。

推荐流程：

```text
1. Task Understanding
2. Research with Tools
3. Episode Plan
4. Draft
5. One-Round Critique
6. Revision
7. Schema Validation
8. Memory Patch
9. Final Answer
```

重点：这是 agent 的内部工作协议，不一定是代码里固定的多个 service 阶段。

---

## 10. Research 阶段

Research 的目标不是写剧本，而是获得足够可靠的创作依据。

### 10.1 必查信息

Agent 应优先获取：

- 本集 source chapters 摘要。
- 本集 source chapters 原文或关键原文。
- 上一集结尾摘要，如果已有上一集。
- 当前 screenplay 的 adaptation plan。
- 当前 schema definition。
- 当前 screenplay_memory。
- 本集相关人物状态。
- 本集相关伏笔。

### 10.2 可选检索

Agent 可按需调用：

- `chapter_search`：查具体意象、道具、台词、场景细节。
- `character_timeline`：核对人物状态。
- `foreshadowing_lookup`：核对伏笔。
- `chapter_get(key_events)`：快速补关键事件。

### 10.3 Research 输出

Agent 内部应该形成一个简洁的 research summary：

```json
{
  "must_keep_events": [],
  "character_states": [],
  "continuity_constraints": [],
  "foreshadowing_constraints": [],
  "adaptation_notes": [],
  "risks": []
}
```

---

## 11. Episode Plan

Plan 的作用是避免剧本变成章节复述。

Agent 应在写作前形成：

```json
{
  "episode_title": "",
  "dramatic_question": "",
  "opening_state": "",
  "ending_hook": "",
  "beat_sheet": [],
  "scene_plan": []
}
```

约束：

- 不允许改变 `source_chapters`。
- 不允许改变 adaptation plan。
- 可以在本集内部做影视化删减、合并、调序，但不能改变主线事实。

---

## 12. 三类剧本的 Prompt 分流

三类剧本不是同一个任务，必须分 prompt。

推荐结构：

```text
prompts/
  episode_agent_base.md
  episode_agent_ai_video.md
  episode_agent_screenwriter.md
  episode_agent_overview.md
```

Prompt 采用“base + 类型叠加”：

```text
final_prompt = episode_agent_base.md + episode_agent_{schema_type}.md
```

`episode_agent_base.md` 放共通规则：

- ReAct 工具调用规范。
- 预算和停止条件。
- 连续生成时如何读取 screenplay_memory。
- 不准改 adaptation plan。
- 不准编造重大情节。
- trace 输出要求。
- memory patch 输出要求。
- critique 只做一轮。

三个类型 prompt 放各自写作目标和输出格式。

### 12.1 AI 视频版 Prompt

AI 视频版指“输出可供视频 AI 生成视频的剧本”，不是让本系统 agent 直接生成视频。

重点：

- 输出 shot 级结构。
- 每个 shot 是可生成视频的最小单元。
- 明确 `shot_type`、`camera_movement`、`subject_action`、`lighting`。
- `generation_prompt` 要是画面生成提示，不是剧情概括。
- 对白如果存在，应挂在 shot 下。
- 输出字段必须匹配 AI 视频 schema。

Agent 关注点：

- 视觉连续性。
- 镜头可拍性。
- 动作明确。
- 人物/地点描述一致。
- 每个 shot 不要塞过多剧情。

### 12.2 编剧工作版 Prompt

重点：

- 输出 scene 级结构。
- 场景描述要服务戏剧冲突。
- 对白要有角色声音和潜台词。
- 强制保留 `source_text_excerpt`，用于人类编剧对照原文。
- 给出 `rewrite_notes`，说明为什么这样改编。
- 输出字段必须匹配编剧工作版 schema。

Agent 关注点：

- 人物动机。
- 场景目标。
- 冲突和转折。
- 对白质量。
- 原文情绪保留。
- 给人类编剧留下可修改空间。

### 12.3 概览版 Prompt

概览版可以更简单。它不是完整剧本写作任务，LLM 基于预处理结果通常就能完成。

重点：

- 不写完整剧本。
- 输出全剧或分集概览。
- 强调 logline、hook、plot arc、market comparable、adaptation difficulty。
- 每集只保留核心冲突和结果。
- 不写细对白。

实现建议：

- 可以先继续走 `OverviewService` 或轻量 `OverviewAgent`。
- 不必第一版强行纳入完整 `EpisodeWritingAgent` ReAct 流程。
- 需要工具时再少量调用，不追求复杂 agentic loop。

---

## 13. Draft、Critique、Revision

Draft 阶段输出目标 schema 的初稿。

Critique 当前只做一轮，不做质量分门槛，只输出问题列表：

```json
{
  "issues": [
    {
      "severity": "high",
      "type": "continuity",
      "target": "scene_3",
      "problem": "",
      "suggested_fix": ""
    }
  ],
  "summary": ""
}
```

Revision 阶段只根据一轮 critique 修订，不要重写一切：

```json
{
  "revised_episode": {},
  "revision_summary": [
    "压缩第 2 场说明性内容",
    "修正主角在第 4 场的已知信息",
    "增强结尾钩子"
  ],
  "remaining_warnings": []
}
```

---

## 14. Trace 设计

Trace 不是完整思考链。它应该是当次生成可见、可审计的工作轨迹。

第一版 trace 不长期保存。可以通过 WebSocket/SSE 推送给前端，也可以短期存在 task metadata 或缓存中。任务结束后，trace 可以只保留简短状态，不作为核心数据库资产。

### 14.1 可以展示给用户的内容

- Agent 当前阶段：研究、规划、写作、审稿、修订、校验。
- 调用了哪些工具。
- 为什么调用该工具的简短理由。
- 工具返回的摘要。
- 本集写作计划摘要。
- critique 摘要。
- revision 摘要。
- memory 更新摘要。
- 失败原因和可选下一步。

### 14.2 不建议展示的内容

- 完整 chain-of-thought。
- 过长工具原始 JSON。
- 大段原文检索结果。
- 模型内部犹豫和重复尝试。

### 14.3 Trace 结构

```json
{
  "steps": [
    {
      "step_index": 1,
      "phase": "research",
      "reason_summary": "需要确认第 9-10 章的关键事件",
      "action": "chapter_get",
      "action_args": {"chapter_num": 9, "mode": "summary"},
      "observation_summary": "获得第 9 章摘要和关键事件",
      "status": "success"
    }
  ]
}
```

---

## 15. RAG 的位置

RAG 目前不需要作为用户可见卖点，也不必强制展示证据。

它在内部的定位是：

```text
RAG = 证据检索器
Agent = 编剧决策者
```

更有价值的是定向检索，而不是泛泛相似检索：

- 查某个道具第一次出现。
- 查某句关键台词。
- 查人物关系变化。
- 查一个意象在原文中的上下文。
- 查伏笔和回收。
- 查某场景原文里的动作细节。

后续可考虑给 `chapter_search` 增加 `intent` 字段：

```json
{
  "query": "玉佩第一次出现",
  "intent": "prop_origin",
  "chapter_range": [1, 10],
  "top_k": 5
}
```

---

## 16. 对话 Agent 改稿边界

对话 Agent 第一版只负责整集级修改。实现上可以做轻量 `ConversationRewriteAgent` / `ChatAgent`，不必复用完整生成 agent。

它需要能读取：

- 当前 screenplay 参数。
- 当前 episode 内容。
- 当前 episode 的 schema type。
- 本集 source chapters。
- screenplay_memory。
- 必要时读取相邻集摘要。

ChatAgent 修改某一集后，需要同步更新该集在 `screenplay_memory` 中的记录。它不接管整剧连续生成，但要保证后续改稿读取到的连续性状态是新的。

ChatAgent 的输出应包含：

```json
{
  "episode_content": {},
  "memory_patch": {},
  "revision_summary": [],
  "warnings": []
}
```

适合 Agent 执行：

- 把第 5 集节奏加快。
- 强化主角动机。
- 让这一集更悬疑。
- 减少旁白，增加冲突。
- 调整整集风格。
- 重写本集结尾钩子。

不适合 Agent 第一版执行：

- 改某一句对白。
- 调整某个词。
- 单场内细碎动作修改。
- 画布上用户能直接完成的微调。

对于细粒度修改，Agent 可以给建议，用户在画布中手动改。

如果用户对很多集都不满意，不走 ChatAgent 逐集修，也不支持部分集重生成。应使用“整剧重生成”，并允许用户提供整体修改方向。

---

## 17. 生成失败策略

失败时不自动 fallback。

返回给用户三个选择：

1. **重试 Agent 生成**  
   适合临时 LLM 失败、JSON 修复失败、工具短暂失败。

2. **使用 fallback 草稿**  
   适合用户想先看到一个可编辑版本。

3. **停止当前任务**  
   适合用户想先检查前面已生成的内容。

失败响应应包含：

```json
{
  "status": "failed",
  "reason": "",
  "retry_available": true,
  "fallback_available": true,
  "stop_available": true
}
```

整剧连续生成时，如果某一集失败：

```text
暂停在失败集
  -> 用户选择重试当前集
  -> 或 fallback 当前集后继续
  -> 或停止整剧生成
```

注意：fallback 只作用于当前失败集。当前集 fallback 成功后，下一集仍然回到 Agent 生成路径。

---

## 18. 工具调整建议

当前已有：

- `chapter_get`
- `chapter_search`
- `character_timeline`
- `foreshadowing_lookup`
- `text2screenplay`
- `episode_patch`
- `screenplay_validate`

建议新增或改造：

### 18.1 `screenplay_plan_get`

获取当前 screenplay 的 adaptation plan。  
用途：让 agent 知道全剧分集设计，但生成时不准改。  
第一版建议必须读取。

### 18.2 `screenplay_memory_get`

获取当前 screenplay 的结构化记忆。  
用途：连续生成时承接前文。

### 18.3 `screenplay_memory_update`

写入本集生成后的 memory patch。  
用途：为下一集提供连续性上下文。

### 18.4 `episode_get`

获取已生成 episode 内容。  
用途：对话改稿、上下集连续性检查。

### 18.5 `episode_context`

获取当前集的上一集摘要、下一集计划、当前集状态。  
用途：避免本集开头和结尾断裂。

### 18.6 `episode_rewrite`

真正执行整集级重写。  
它应替代当前只追加 `revision_notes` 的 `episode_patch`。

第一版由轻量 ChatAgent 作为工具调用，而不是完整 EpisodeWritingAgent。  
工具负责保存 episode 新版本，并同步写入 ChatAgent 输出的 `memory_patch`。

### 18.7 `agent_trace_emit`

推送 agent 的当次可展示轨迹。  
不需要长期保存，可以通过 WebSocket/SSE 推给前端。

---

## 19. 最小可行实现

第一版最小目标：

```text
Single EpisodeWritingAgent
  - ReAct tool loop with 8-step budget
  - per-tool call limit 2-3
  - schema-specific prompt
  - screenplay_memory JSON input
  - one critique round
  - one revision round
  - validate
  - memory_patch output
  - save episode
  - update screenplay_memory JSON
  - emit trace during current run
```

替换单集路径：

```text
/episodes/{episode_id}/generate
  -> EpisodeWritingAgentRunner.run()
```

新增整剧路径：

```text
/screenplays/{screenplay_id}/generate
  -> ScreenplayWritingRunner.run_serial()
```

保留旧 `GenerationService`：

- 作为用户选择 fallback 时的草稿生成器。
- 不再作为默认主生成路径。

---

## 20. 前端交互建议

整剧连续生成时：

1. 默认打开第 1 集。
2. 顶部显示整体进度：第几集 / 共几集。
3. 当前正在生成的集显示 loading 状态。
4. 已生成集实时填入内容，可查看但不可编辑。
5. 右侧或底部展示 trace 简要进度。
6. 失败时暂停，并弹出：
   - 重试当前集
   - 使用 fallback 当前集
   - 停止生成
7. 全部生成完成后解除编辑锁。
8. 生成完成后，主写作 Agent 任务结束；后续修改入口切换为轻量 ChatAgent 和画布编辑。

---

## 21. Screenplay 分支版本设计

整剧重生成不覆盖原 screenplay，而是创建新的分支版本。

建议 `screenplays` 增加或保留以下字段：

```json
{
  "id": "...",
  "novel_id": "...",
  "parent_screenplay_id": "...",
  "branch_name": "更快节奏版",
  "branch_type": "initial|regenerated|manual_variant",
  "regeneration_instruction": "整体节奏更快，减少旁白，增强每集结尾钩子",
  "adaptation_plan": {},
  "plan_source": "copied|user_adjusted|agent_suggested",
  "screenplay_memory": {},
  "created_at": "...",
  "updated_at": "..."
}
```

字段说明：

- `parent_screenplay_id`：指向被重生成的原 screenplay。
- `branch_name`：用户可见的分支名。
- `branch_type`：区分初始版本、重生成版本、手动变体。
- `regeneration_instruction`：用户输入的整体修改方向。
- `plan_source`：标记新分支的 plan 来源。
- `screenplay_memory`：该分支自己的连续性记忆，和父版本隔离。

整剧重生成前，用户允许调整 adaptation plan。新分支生成时：

```text
原 screenplay
  -> 用户输入整体修改方向
  -> 可选：调整 adaptation plan
  -> 创建新 screenplay 分支
  -> 从第 1 集开始连续生成
```

---

## 22. 分支对比交互

前端使用双窗口并排比较两个 screenplay 分支版本。

建议交互：

```text
左侧：原版本
右侧：新分支
```

能力：

- 两边按 episode_num 对齐。
- 切换某一集时，两边同步跳转到同集。
- 可以分别查看标题、摘要、场景、对白。
- 可以高亮两版的 episode summary / scene 数量 / 结尾钩子的差异。
- 用户确认喜欢某个分支后，可继续在该分支上编辑或导出。

第一版不必做复杂 diff，只要并排查看即可。

---

## 23. 剩余待讨论问题

暂无。后续进入实现设计时再拆数据库迁移、API、前端交互细节。
