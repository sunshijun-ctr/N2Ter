# Agent 主导剧本写作流程讨论稿

版本：v0.1  
目的：把当前“Service 拼上下文后一次性调用 LLM”的剧本生成方式，改造成“Agent 主导、ReAct 风格、多步查证与修订”的创作流程。

---

## 1. 当前问题

当前后端虽然有 `agents/` 目录和工具注册机制，但真实分集剧本生成主要由 `GenerationService.generate_episode()` 驱动：

1. 根据 episode 的 `source_chapters` 查数据库。
2. 拼接章节摘要、原文、上一集摘要、人物弧光、schema。
3. 一次性调用 LLM 生成剧本 JSON。
4. 失败后走 deterministic fallback。

这套方式有几个明显问题：

- Agent 不是主导者，只是薄包装。
- 工具调用不是强约束，模型不一定查库。
- RAG/数据库素材没有服务于明确的编剧判断。
- 生成过程缺少中间产物，如 beat sheet、场景计划、冲突设计、连续性检查。
- 没有“写完再审稿再修改”的循环。
- `episode_patch` 当前只是追加 `revision_notes`，不是真正 AI 改稿。

因此，当前系统更像“上下文增强的一次性生成”，而不是“编剧 agent 工作流”。

---

## 2. 目标形态

目标不是让 RAG 直接写剧本，而是让 Agent 像编剧助理一样工作：

1. 理解本集任务。
2. 主动查证原文、人物、伏笔、前后集连续性。
3. 形成本集改编策略。
4. 拆 beat。
5. 规划场景。
6. 写初稿。
7. 自检。
8. 修订。
9. 保存剧本、版本和完整 trace。

核心变化：

```text
旧模式：
Service -> collect fixed context -> LLM -> episode

新模式：
Agent -> Think -> Tool -> Observe -> Think -> Tool -> Observe -> Draft -> Critique -> Revise -> Persist
```

这里的数据库、RAG、工具都不是主角。主角是 Agent 的创作决策流程。

---

## 3. ReAct 风格原则

ReAct = Reason + Act。也就是 Agent 每一步都要在“思考”和“行动”之间切换。

在本项目里可以抽象为：

```text
Thought:
  我需要判断本集的核心戏剧目标和不能丢的原文信息。

Action:
  chapter_get(chapter_num=3, mode="summary")

Observation:
  第 3 章摘要、关键事件、人物出场信息。

Thought:
  本集包含人物关系转折，需要核对主角到此为止的状态。

Action:
  character_timeline(character_name="主角", chapter_range=[1, 4])

Observation:
  主角此前的关系状态、目标变化、已知信息。
```

但工程实现上，不建议完全让模型自由奔跑。更稳的方式是：

- 外层由代码定义阶段。
- 每个阶段内部允许 ReAct。
- 关键工具调用由代码强制执行。
- 可选工具调用由 Agent 自主决定。
- 每一步输出结构化 JSON。
- 全部中间过程写入 trace。

---

## 4. Agent 分层

第一期不一定要真的做多 Agent 进程，可以先用一个 `EpisodeWritingAgent`，内部模拟不同角色。

建议逻辑角色如下：

| 角色 | 作用 | 是否需要独立类 |
|---|---|---|
| Researcher | 查原文、人物、伏笔、前后集 | 可先作为阶段 |
| Planner | 形成本集改编策略和 beat sheet | 可先作为阶段 |
| Screenwriter | 根据计划写剧本初稿 | 可先作为阶段 |
| Continuity Critic | 检查人物、伏笔、前后集连续性 | 可先作为阶段 |
| Drama Critic | 检查节奏、冲突、场景功能 | 可先作为阶段 |
| Schema Critic | 检查结构格式 | 可用现有 validator |
| Rewriter | 根据 critique 修订 | 可先作为阶段 |

推荐第一期实现：

```text
EpisodeWritingAgent
  - research()
  - plan()
  - draft()
  - critique()
  - revise()
  - validate()
  - persist()
```

---

## 5. EpisodeWritingAgent 总流程

### 5.1 输入

```json
{
  "episode_id": "...",
  "screenplay_id": "...",
  "novel_id": "...",
  "episode_num": 5,
  "source_chapters": [9, 10],
  "schema_type": "screenwriter",
  "user_style_preferences": {},
  "generation_mode": "normal"
}
```

`generation_mode` 可选：

- `fast`：少量检查，快速生成。
- `normal`：完整研究 + 初稿 + 一轮审稿修订。
- `strict`：多轮 critique，适合正式导出前。

### 5.2 输出

```json
{
  "episode_content": {},
  "trace_id": "...",
  "quality_report": {},
  "used_sources": [],
  "warnings": []
}
```

---

## 6. 阶段一：Research

目标：让 Agent 在写之前拥有足够可靠的素材。

### 强制收集

这些不交给模型决定，代码必须先查：

1. 本集 source chapters 的摘要。
2. 本集 source chapters 的完整原文或截断原文。
3. 上一集结尾摘要。
4. 下一集开头摘要，如果存在。
5. 全书摘要。
6. 人物弧光。
7. 本集章节相关伏笔。
8. 当前 screenplay 的 style preferences。
9. 当前 schema definition。

### Agent 自主检索

Agent 在研究阶段可以自主调用：

- `chapter_search`：查具体意象、诗句、道具、对白、场景细节。
- `character_timeline`：核对指定人物在本集前后的状态。
- `foreshadowing_lookup`：核对本集应保留或回收的伏笔。
- `chapter_get(mode="key_events")`：快速补章节关键事件。

### Research 输出

```json
{
  "episode_source_digest": "本集原文素材摘要",
  "must_keep_events": [],
  "optional_events": [],
  "can_compress_or_remove": [],
  "character_states": [],
  "relationship_states": [],
  "foreshadowing_items": [],
  "visual_motifs": [],
  "dialogue_candidates": [],
  "continuity_constraints": [],
  "source_evidence": [
    {
      "type": "chapter",
      "chapter_num": 9,
      "quote_or_summary": "...",
      "usage": "用于第 2 场"
    }
  ]
}
```

关键原则：Research 不写剧本，只整理证据和约束。

---

## 7. 阶段二：Plan

目标：把原文素材转化为影视剧的一集结构。

### Plan 要回答的问题

1. 本集的核心戏剧问题是什么？
2. 本集开场承接上一集什么情绪或悬念？
3. 本集结尾要把观众推向什么期待？
4. 哪些原文事件必须保留？
5. 哪些原文内容可以合并、删减、调序？
6. 本集人物关系发生了什么变化？
7. 每场戏承担什么功能？

### Plan 输出

```json
{
  "episode_title": "第 5 集标题",
  "episode_logline": "一句话说明本集",
  "dramatic_question": "观众看本集时持续关心的问题",
  "opening_state": "承接上一集的状态",
  "ending_hook": "本集结尾钩子",
  "adaptation_strategy": {
    "keep": [],
    "merge": [],
    "cut": [],
    "reorder": []
  },
  "beat_sheet": [
    {
      "beat_num": 1,
      "source_chapters": [9],
      "function": "开场钩子",
      "event": "...",
      "character_change": "...",
      "evidence_refs": []
    }
  ],
  "scene_plan": [
    {
      "scene_num": 1,
      "location": "...",
      "characters": [],
      "objective": "...",
      "conflict": "...",
      "turning_point": "...",
      "source_basis": [],
      "estimated_length": "short"
    }
  ]
}
```

Plan 阶段非常重要。它决定剧本不是“章节复述”，而是“影视化改编”。

---

## 8. 阶段三：Draft

目标：根据 `research + plan + schema` 写出本集初稿。

Draft Agent 不应该重新发明剧情。它必须围绕 `scene_plan` 写。

### Draft 输入

- research result
- plan result
- source text excerpts
- schema definition
- previous episode summary
- style preferences

### Draft 输出

输出目标 schema 的 episode JSON。

对 `screenwriter` schema：

- 保留 `source_chapter`
- 场景描述要有可拍性
- 对白要服务冲突
- `rewrite_notes` 说明改编意图
- `source_text_excerpt` 标明依据

对 `ai_video` schema：

- 场景继续拆成 shots
- 每个 shot 的动作、画面、光线、镜头明确
- `generation_prompt` 应基于画面，而不是抽象情绪

---

## 9. 阶段四：Critique

目标：不要相信第一稿。

Critique 至少分四类。

### 9.1 忠实度检查

检查：

- 有没有编造原文没有的重要事件。
- 有没有错误改变人物关系。
- 有没有错用道具、地点、身份。
- 有没有遗漏本集必须保留的事件。

输出：

```json
{
  "faithfulness_score": 0.86,
  "issues": [
    {
      "severity": "high",
      "scene_num": 3,
      "problem": "角色提前知道了后文秘密",
      "evidence": "...",
      "suggested_fix": "..."
    }
  ]
}
```

### 9.2 连续性检查

检查：

- 上一集结尾到本集开头是否自然。
- 本集结尾是否能接下一集。
- 人物状态是否连续。
- 伏笔是否被误删或误回收。

### 9.3 戏剧性检查

检查：

- 每场戏是否有目标、冲突、转折。
- 是否有只复述信息但没有戏剧功能的场景。
- 开场是否足够快。
- 结尾是否有钩子。
- 对白是否只是解释剧情。

### 9.4 Schema 检查

使用现有 `screenplay_validate`。

---

## 10. 阶段五：Revise

目标：根据 critique 修订，不是重写一切。

Revise 输入：

- draft
- critique reports
- research evidence
- plan

Revise 输出：

```json
{
  "revised_episode": {},
  "revision_summary": [
    "修正第 3 场角色已知信息错误",
    "压缩第 5 场说明性对白",
    "增强结尾钩子"
  ],
  "remaining_risks": []
}
```

建议第一期只做一轮：

```text
draft -> critique -> revise -> validate
```

后续 strict 模式再做多轮。

---

## 11. 工具设计调整

当前工具大体够做第一期，但需要补强。

### 已有工具

- `chapter_get`
- `chapter_search`
- `character_timeline`
- `foreshadowing_lookup`
- `text2screenplay`
- `episode_patch`
- `screenplay_validate`

### 建议新增工具

#### `episode_get`

获取已生成集的内容。

```json
{
  "episode_id": "...",
  "mode": "summary|full"
}
```

用途：查上一集、当前集、用户要修改的集。

#### `episode_context`

获取某集的前后文。

```json
{
  "episode_id": "...",
  "include_previous": true,
  "include_next_plan": true
}
```

用途：连续性检查。

#### `screenplay_plan_get`

获取整个改编方案。

用途：避免 agent 只看单集，破坏全剧节奏。

#### `source_evidence_pack`

一次性返回本集写作需要的强制上下文。

用途：减少 Agent 每次都手动调用十几个基础工具。

#### `episode_rewrite`

真正根据当前 episode content、用户指令、证据包重写剧本。

替代当前只追加 `revision_notes` 的 `episode_patch`。

---

## 12. Trace 设计

如果要讨论和调试 Agent，必须保存它为什么这样写。

建议新增 `agent_runs` 和 `agent_steps`，或先用 JSONB 存在 task metadata。

### agent_run

```json
{
  "id": "...",
  "task_type": "episode_generation",
  "target_episode_id": "...",
  "status": "done",
  "model": "...",
  "mode": "normal",
  "created_at": "...",
  "final_quality": {}
}
```

### agent_step

```json
{
  "run_id": "...",
  "step_index": 3,
  "phase": "research",
  "thought_summary": "需要核对主角是否知道秘密",
  "action": "character_timeline",
  "action_args": {},
  "observation_summary": "...",
  "output": {}
}
```

注意：不一定要保存完整私有 chain-of-thought。可以保存 `thought_summary`，也就是可审计的简要理由。

---

## 13. 与 RAG 的关系

这个流程下，RAG 的位置很明确：

RAG 不是写作者。  
RAG 是证据检索器。  
Agent 才是编剧决策者。

普通向量检索价值有限，因为“相似”不等于“剧情上该用”。更有价值的是定向检索：

- 查某个道具第一次出现。
- 查某句关键台词。
- 查人物关系变化。
- 查一个意象在原文中的上下文。
- 查伏笔和回收。
- 查某场景原文里的动作细节。

因此 `chapter_search` 最好不要只暴露自由 query，还可以提供更语义化的检索意图：

```json
{
  "query": "玉佩第一次出现",
  "intent": "prop_origin",
  "chapter_range": [1, 10],
  "top_k": 5
}
```

---

## 14. Conversation Agent 改稿流程

当前对话 agent 不应该只是聊天。它应该成为改稿入口。

### 用户说：“把第 5 集节奏加快”

流程：

1. 定位 episode。
2. 获取当前 episode 内容。
3. 获取本集 source evidence pack。
4. 判断这是整集级修改，适合 agent 执行。
5. 生成修改计划。
6. 执行 episode_rewrite。
7. validate。
8. 保存新版本。
9. 向用户说明改了什么。

### 用户说：“这句台词换得文雅一点”

流程：

1. 如果上下文能定位具体 scene/dialogue，则可以小范围改。
2. 如果定位不清，先追问。
3. 如果产品决策仍是“细粒度由画布编辑”，则 agent 给出建议，不直接改。

### Conversation Context 必须补充

WebSocket 当前只传了 `novel_id` 和 `screenplay_id`，缺少：

- `episode_id`
- `scene_id`
- `selected_text`
- `cursor_context`
- `current_schema_type`

否则对话 agent 很难准确落点。

---

## 15. 推荐落地顺序

### Milestone A：让分集生成由 Agent Pipeline 接管

新增：

- `EpisodeWritingAgent`
- `EpisodeWritingPipeline`
- `source_evidence_pack`
- `agent trace`

替换：

- `/episodes/{episode_id}/generate` 从 `GenerationService.generate_episode()` 改为调用 pipeline。

保留：

- 原 `GenerationService` 作为 fallback。

### Milestone B：加入 Plan/Draft/Critique/Revise 中间产物

先实现一轮：

```text
research -> plan -> draft -> critique -> revise -> validate -> persist
```

### Milestone C：改造对话改稿

新增：

- `episode_get`
- `episode_rewrite`
- WebSocket 传当前编辑上下文

改造：

- `episode_patch` 不再只是追加 notes。

### Milestone D：质量评分与可视化 trace

前端展示：

- 本集使用了哪些原文证据。
- Agent 做了哪些检查。
- 有哪些风险警告。
- 为什么删改某些原文事件。

---

## 16. 第一版工程伪代码

```python
class EpisodeWritingPipeline:
    async def run(self, episode_id: UUID, mode: str = "normal") -> EpisodeWritingResult:
        run = await trace.start("episode_generation", episode_id)

        episode, screenplay, novel = await self.load_entities(episode_id)

        evidence_pack = await self.collect_required_context(
            novel=novel,
            screenplay=screenplay,
            episode=episode,
        )
        await trace.step(run, "research.collect_required", evidence_pack)

        research = await self.agent.research(evidence_pack)
        await trace.step(run, "research.agent", research)

        plan = await self.agent.plan(evidence_pack, research)
        await trace.step(run, "plan", plan)

        draft = await self.agent.draft(evidence_pack, research, plan)
        await trace.step(run, "draft", draft)

        critiques = await self.agent.critique(evidence_pack, research, plan, draft)
        await trace.step(run, "critique", critiques)

        revised = await self.agent.revise(evidence_pack, research, plan, draft, critiques)
        await trace.step(run, "revise", revised)

        validation = await screenplay_validate(revised, screenplay.schema_type)
        await trace.step(run, "validate", validation)

        if not validation.ok:
            revised = await self.agent.fix_schema(revised, validation)

        await self.persist_episode(episode, revised)
        await trace.finish(run, status="done")

        return EpisodeWritingResult(
            episode_content=revised,
            trace_id=run.id,
            quality_report=critiques,
        )
```

---

## 17. 需要讨论的关键决策

1. 第一版是否只做单 Agent 多阶段，还是直接多 Agent？
2. ReAct 的自由度多大？是每阶段允许自主调用工具，还是代码完全编排？
3. trace 要保存到数据库表，还是先存在 task metadata？
4. critique 做一轮还是多轮？
5. 生成时是否允许改动 adaptation plan？
6. RAG 检索结果是否必须附 source evidence 到最终剧本？
7. 对话 agent 是否允许做场景/对白级修改，还是仍保持整集级？
8. 生成失败时是回退旧 `GenerationService`，还是返回“需要人工确认”？
9. 是否需要质量阈值，比如低于 0.7 自动再修订？
10. Agent 的 prompt 是一个大 prompt，还是每个阶段独立 prompt？

---

## 18. 暂定建议

我的建议：

1. **第一期用单 Agent 多阶段**，不要过早上真正 multi-agent。
2. **外层代码编排，内层 ReAct**，保证流程稳定，又保留 agent 主动性。
3. **强制上下文收集不要交给 LLM 自觉**，代码先准备 evidence pack。
4. **至少保留 Plan/Draft/Critique/Revise 四个中间产物**。
5. **RAG 只作为证据工具**，不要期待它直接提升文学质量。
6. **episode_patch 必须重做**，否则对话改稿不会真正成立。
7. **trace 是一等公民**，否则无法讨论 agent 为什么写成这样。

---

## 19. 最小可行版本

如果只做最小改造，建议先实现：

```text
source_evidence_pack
EpisodeWritingPipeline
  1. collect evidence
  2. generate plan
  3. generate draft
  4. critique draft
  5. revise draft
  6. validate and save
```

这一步完成后，系统就会从“上下文增强生成器”变成真正的“agentic 编剧流水线”。

