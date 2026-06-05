# Schema 一：AI 视频剧本

**版本**：v1.0  
**用途**：供 Sora、Kling、Runway、可灵、即梦等 AI 视频/生图工具消费  
**核心理念**：机器可读优先，每个分镜是一个完整的"生成指令包"

---

## 一、设计目标

AI 视频工具的痛点是**提示词工程门槛高**。普通用户写出来的 prompt 往往缺少镜头语言、光线、运镜等专业描述，导致生成效果差。本 Schema 把这些专业字段结构化，让 AI 直接生成可投喂给视频模型的分镜数据。

**核心原则**：
- 镜头粒度（不是场景粒度）—— 每个 shot 对应一段 3-10 秒的视频片段
- 字段贴近视频模型 prompt 的真实结构（主体 + 动作 + 镜头 + 光线 + 风格）
- 角色一致性字段独立，保证跨镜头生成同一角色不"换脸"

---

## 二、总体结构

```yaml
schema_version: "ai-video-1.0"
schema_type: "ai_video"
title: string
genre: string
visual_style: string          # 全局视觉风格（写实/动漫/赛博朋克/水墨...）
aspect_ratio: string          # 16:9 / 9:16 / 1:1
total_duration_seconds: integer

character_profiles:           # 角色视觉档案（用于角色一致性）
  - id: string
    name: string
    appearance: string        # 详细外貌描述，用于跨镜头复用
    reference_prompt: string  # 标准化的角色 prompt 片段

episodes:
  - episode_number: integer
    title: string
    source_chapter: string
    scenes:
      - scene_number: integer
        location: string
        shots:                # 分镜列表 —— 核心
          - ...
```

---

## 三、shots（分镜）—— 核心字段

```yaml
shots:
  - shot_id: "ep1_sc1_sh1"
    duration_seconds: 5
    
    # ===== 镜头语言 =====
    shot_type: "中景"              # 特写/近景/中景/全景/远景/大远景
    camera_angle: "平视"           # 平视/俯视/仰视/鸟瞰/低角度
    camera_movement: "推近"        # 固定/推近/拉远/跟随/横摇/手持
    lens: "50mm"                   # 等效焦距，影响景深观感
    
    # ===== 画面构成 =====
    subject: "林晚"                # 主体（角色 ID 或物体）
    subject_action: "低头搅拌咖啡，眼神涣散"
    background: "咖啡馆角落，窗外阳光斜射进来，桌上散落着图纸"
    foreground: "凉透的咖啡杯特写"
    
    # ===== 视听氛围 =====
    lighting: "自然光，侧逆光，暖色调"
    color_grading: "低饱和，琥珀色滤镜"
    weather: "晴"                  # 可选
    time_of_day: "下午 3 点左右"
    
    # ===== 角色情绪与表演 =====
    character_emotion:
      - character_id: "char_01"
        emotion: "疲惫中带着隐忍"
        facial_expression: "眉头微蹙，嘴角下垂"
        body_language: "肩膀微微塌陷，手指无意识转动咖啡勺"
    
    # ===== 音频指令 =====
    dialogue:
      - character_id: "char_01"
        line: "这位置有人。"
        voice_tone: "平静而疏离，尾音略沉"
        volume: "低"               # 低/正常/高
        pace: "缓慢"               # 缓慢/正常/急促
    
    sound_effects: ["咖啡馆背景人声", "瓷器轻响"]
    background_music: "轻柔钢琴，G小调"
    
    # ===== 生成指令 =====
    generation_prompt: "A medium shot of an Asian woman in her late 20s sitting alone at a cafe corner, stirring coffee absent-mindedly, warm side-lighting, amber color grading, shallow depth of field, cinematic, 50mm lens"
    negative_prompt: "blurry, distorted face, extra fingers"
    
    transition_to_next: "硬切"     # 硬切/淡入淡出/叠化/划像
```

### 字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `shot_id` | string | 是 | 唯一标识，格式 `ep{X}_sc{Y}_sh{Z}` |
| `duration_seconds` | integer | 是 | 视频时长，建议 3-10 秒 |
| `shot_type` | enum | 是 | 镜头景别 |
| `camera_angle` | enum | 是 | 镜头角度 |
| `camera_movement` | enum | 是 | 运镜方式 |
| `lens` | string | 否 | 焦距，影响 AI 模型景深判断 |
| `subject` | string | 是 | 画面主体 |
| `subject_action` | string | 是 | 主体在做什么 |
| `background` | string | 是 | 背景描述 |
| `foreground` | string | 否 | 前景元素（增加层次感） |
| `lighting` | string | 是 | 光线方向、强度、色温 |
| `color_grading` | string | 是 | 调色风格 |
| `character_emotion` | array | 否 | 角色情绪表演细节 |
| `dialogue.voice_tone` | string | 否 | 语气，供 TTS 模型参考 |
| `dialogue.pace` | enum | 否 | 语速 |
| `generation_prompt` | string | 是 | 直接可投喂给视频模型的完整 prompt（英文） |
| `negative_prompt` | string | 否 | 反向提示词 |
| `transition_to_next` | enum | 否 | 与下一镜头的转场 |

---

## 四、character_profiles（角色档案）

```yaml
character_profiles:
  - id: "char_01"
    name: "林晚"
    appearance: "亚洲女性，28岁，长直黑发披肩，瓜子脸，单眼皮，气质冷清，身高 165cm，常穿米色风衣或黑色高领毛衣"
    reference_prompt: "Asian woman, late 20s, long straight black hair, almond-shaped single-eyelid eyes, oval face, calm aloof expression, beige trench coat"
    voice_profile: "中音偏低，语速偏慢，咬字清晰"
```

**为什么独立成顶层字段**：AI 视频模型最大的问题是"跨镜头角色一致性"——同一个角色在不同镜头里长得不一样。把角色档案抽离出来，每个 shot 通过 `character_id` 引用，生成时可以把 `reference_prompt` 拼接到每个 shot 的 prompt 里，强制保持视觉一致。

---

## 五、完整示例

```yaml
schema_version: "ai-video-1.0"
schema_type: "ai_video"
title: "你好，陌生人"
genre: "都市情感短剧"
visual_style: "电影感写实，王家卫风格"
aspect_ratio: "16:9"
total_duration_seconds: 180

character_profiles:
  - id: "char_01"
    name: "林晚"
    appearance: "亚洲女性，28岁，长直黑发，气质清冷"
    reference_prompt: "Asian woman, late 20s, long black hair, aloof expression"
    voice_profile: "中音偏低，语速缓慢"
  - id: "char_02"
    name: "沈云洲"
    appearance: "亚洲男性，32岁，短发，深色西装"
    reference_prompt: "Asian man, early 30s, short hair, dark business suit"
    voice_profile: "低沉稳重"

episodes:
  - episode_number: 1
    title: "陌生人的咖啡"
    source_chapter: "第一章 初遇"
    scenes:
      - scene_number: 1
        location: "上海某咖啡馆 / 内景"
        shots:
          - shot_id: "ep1_sc1_sh1"
            duration_seconds: 4
            shot_type: "全景"
            camera_angle: "平视"
            camera_movement: "缓慢推近"
            subject: "char_01"
            subject_action: "独自坐在角落，低头看图纸"
            background: "咖啡馆，午后人声嘈杂"
            lighting: "自然光，暖色调"
            color_grading: "低饱和，琥珀色"
            time_of_day: "下午"
            character_emotion:
              - character_id: "char_01"
                emotion: "专注但疲惫"
                facial_expression: "眉头微蹙"
                body_language: "前倾，单手撑额"
            sound_effects: ["咖啡馆背景人声"]
            background_music: "轻柔钢琴"
            generation_prompt: "A wide shot slowly pushing in on an Asian woman alone at a cafe corner, focused on blueprints, warm afternoon light, amber color grading, cinematic"
            transition_to_next: "硬切"

          - shot_id: "ep1_sc1_sh2"
            duration_seconds: 3
            shot_type: "特写"
            camera_angle: "平视"
            camera_movement: "固定"
            subject: "char_02"
            subject_action: "拉开椅子坐下，眼神扫过桌面"
            background: "虚化的咖啡馆"
            lighting: "侧光"
            color_grading: "低饱和，琥珀色"
            character_emotion:
              - character_id: "char_02"
                emotion: "从容自信"
                facial_expression: "嘴角微抿"
                body_language: "动作沉稳"
            dialogue:
              - character_id: "char_02"
                line: "我看没有。"
                voice_tone: "低沉，略带笑意"
                volume: "正常"
                pace: "缓慢"
            generation_prompt: "Close-up of an Asian man in dark suit sitting down at cafe table, calm confident expression, side lighting, shallow depth of field"
            transition_to_next: "硬切"
```

---

## 六、设计取舍

**为什么按 shot 拆分而不是按 scene**：AI 视频模型一次生成的极限就是 5-10 秒，按场景给 prompt 太粗，模型会自由发挥导致画面跳脱。按分镜给，每段 prompt 对应一个独立片段，可控性强。

**为什么有 `generation_prompt` 这个冗余字段**：上面所有结构化字段都是给人看的，最后还是要拼成一段自然语言 prompt 投喂给模型。让 AI 在生成时同时输出"结构化数据"+"成品 prompt"，用户拿到就能直接用，不用自己再拼。

**为什么角色用 ID 而不是名字**：跨镜头复用时，名字可能被翻译、被改名，ID 更稳定。而且引用 `character_profiles` 时 ID 是天然的外键。