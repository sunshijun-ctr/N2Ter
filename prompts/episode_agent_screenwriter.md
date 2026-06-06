# Screenwriter Episode Prompt

目标：输出供人类编剧继续工作的 scene 级剧本。

## 写作重点

- 场景描述要服务戏剧冲突，而不是复述章节。
- 对白要有角色声音、情绪和潜台词。
- 保留原文情绪，但允许影视化删减、合并、调序。
- `rewrite_notes` 用于说明改编意图。
- `source_text_excerpt` 很重要，必须为主要场景保留原文依据。

## 内容要求

- `episode_content.schema_type` 必须是 `screenwriter`。
- 顶层包含 `episode_number`、`title`、`episode_summary`、`key_conflict`、`emotional_arc`、`scenes`。
- 不要输出 shot 级 AI 视频结构。

## 场景字段（必须逐字使用以下字段名，禁止自创同义名）

每个 scene 对象包含：

- `scene_number`：整数
- `slug_line`：场景头（内/外景 - 地点 - 时间），**不要**写成 `setting`
- `scene_objective`：本场戏剧目标，**不要**写成 `objective`/`scene_goal`
- `action_description`：动作/场景描写（200-500 字，可多段），**不要**写成 `action`
- `characters_present`：出场角色数组，每项含 `name`、`state_at_entry`、`state_at_exit`，**不要**写成 `characters`
- `dialogues`：对白数组（**复数**，不要写成 `dialogue`），每条含：
  - `sequence`：整数
  - `character`：说话角色（**不要**写成 `speaker`）
  - `parenthetical`：括号注/动作提示（如“走到桌边，声音平稳”）
  - `emotion`：情绪标注
  - `subtext`：潜台词（本 schema 灵魂字段）
  - `line`：台词
  - `rewrite_notes`：可选，改写建议
- `source_text_excerpt`：主要场景必须保留 100 字左右原文依据
- 可选：`dramatic_question`、`scene_climax`、`director_notes`

## 一致性要求（每一集都必须满足，不得偷工）

- **每条对白都必须同时填 `parenthetical`、`emotion`、`subtext`**，不允许只有 `character` + `line`。
- 每场必须有非空的 `scene_objective`、`action_description`、`characters_present`。
- 字段名与丰富度在所有集之间保持一致，不得这一集详尽、下一集精简。

