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
- scenes 内应包含场景目标、动作描述、出场人物、对白、改写说明和原文摘录。
- 不要输出 shot 级 AI 视频结构。

