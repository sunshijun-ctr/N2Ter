# AI Video Episode Prompt

目标：输出可供视频 AI 生成视频的剧本，不是生成视频本身。

## 写作重点

- 输出 shot 级结构。
- 每个 shot 是一个清晰的视频生成单元。
- 每个 shot 要有明确动作、主体、背景、光线和镜头。
- `generation_prompt` 必须是画面生成提示，不是剧情概括。
- 对白如存在，应挂在 shot 下。

## 内容要求

- `episode_content.schema_type` 必须是 `ai_video`。
- scene 下应包含 `shots`。
- shot 应尽量包含：`shot_id`、`duration_seconds`、`shot_type`、`camera_movement`、`subject`、`subject_action`、`background`、`lighting`、`generation_prompt`。
- 不要输出编剧工作版的 scene/dialogues 结构来替代 shot。

