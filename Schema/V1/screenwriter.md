# Schema 二：编剧工作剧本

**版本**：v1.0  
**用途**：供人类编剧二次创作打磨，对标 Final Draft、Celtx 等专业剧本软件  
**核心理念**：保留小说原著情感深度，提供丰富的"创作备注层"，留足修改空间

---

## 一、设计目标

人类编剧二改剧本时最痛的地方是：**AI 初稿太干**。场景描述只有一句话，对白没有情绪层次，潜台词全丢失。编剧拿到初稿等于重写。

本 Schema 反其道而行：**字段丰富、描写详尽、保留原著心理活动**。让编剧拿到初稿后，是在"修改和精简"而不是"从零写起"。

**核心原则**：
- 描述字段字数放开（200-500 字），还原小说细节
- 对白保留 `subtext`（潜台词）和 `emotion`（情绪），不直接进入最终剧本但供编剧参考
- 增加 `rewrite_notes` 字段，AI 主动标记"此处可能需要改写"的建议
- 兼容好莱坞标准剧本格式（Scene Heading / Action / Character / Dialogue / Parenthetical / Transition）

---

## 二、总体结构

```yaml
schema_version: "screenwriter-1.0"
schema_type: "screenwriter"
title: string
genre: string
logline: string               # 一句话故事梗概，行业标准必备
synopsis: string              # 300字以内剧情简介
tone_reference: string        # 风格参考（"像《漫长的季节》的节奏感"）

character_list:
  - name: string
    role: string
    age: string
    description: string         # 详细人物小传，200字左右
    arc: string                 # 角色弧光（这个角色在整剧中如何变化）
    speech_pattern: string      # 说话方式特征
    
theme_keywords:               # 主题关键词，帮编剧抓核心
  - string

episodes:
  - episode_number: integer
    title: string
    source_chapter: string
    episode_summary: string     # 本集故事大纲
    key_conflict: string        # 本集核心冲突
    emotional_arc: string       # 本集情感曲线
    scenes:
      - ...
```

---

## 三、scenes（场景）—— 核心字段

```yaml
scenes:
  - scene_number: 1
    
    # ===== 场景头（对标 Scene Heading）=====
    slug_line: "内景 - 咖啡馆 - 日"   # 标准格式：内/外景 - 地点 - 时间
    location_detail: "上海，南京西路一家文艺咖啡馆，二楼靠窗角落"
    time_detail: "周三下午 3 点 17 分"
    
    # ===== 场景核心 =====
    scene_objective: "建立林晚的人物状态：表面冷静，内心疲惫"
    dramatic_question: "她为什么独自一人在这里？"
    
    # ===== 场景描述（对标 Action 段）=====
    action_description: |
      咖啡馆里人声鼎沸，但二楼这个角落却出奇地安静。
      
      林晚坐在靠窗的位置，面前摊着一沓建筑图纸。她的手指捏着一支铅笔，
      笔尖悬在纸上，却已经停了很久。窗外的阳光斜斜地切进来，落在她
      半边脸上，照出她眼下淡淡的青色。
      
      桌上的咖啡早就凉透了，杯壁凝结的水珠顺着杯身缓缓滑下，在桌面
      晕开一小片湿痕。她没有去擦。
      
      手机屏幕在桌角亮了一下又熄灭。她瞥了一眼，没有动。
    
    # ===== 出场角色 =====
    characters_present:
      - name: "林晚"
        state_at_entry: "已在场，沉浸在自己的世界里"
        state_at_exit: "被打扰后强装镇定"
      - name: "沈云洲"
        state_at_entry: "刚走上二楼，目光锁定林晚"
        state_at_exit: "得到他想要的信息，离开"
    
    # ===== 对白 =====
    dialogues:
      - sequence: 1
        character: "沈云洲"
        parenthetical: "走到桌边，声音平稳"
        line: "这位置有人吗？"
        emotion: "刻意装作随意"
        subtext: "他知道她是谁，这是计划好的接近"
        rewrite_notes: "可考虑让沈云洲先观察她几秒再开口，增加张力"
        
      - sequence: 2
        character: "林晚"
        parenthetical: "没有抬头"
        line: "有。"
        emotion: "条件反射式的拒绝"
        subtext: "不想和任何人交流"
        
      - sequence: 3
        character: "沈云洲"
        parenthetical: "拉开椅子坐下"
        line: "我看没有。"
        emotion: "不容置疑"
        subtext: "他要让她注意到自己"
        rewrite_notes: "这句台词偏强势，如想塑造温柔人设可改为'介意我坐一下吗'"
    
    # ===== 场景收尾 =====
    scene_climax: "林晚终于抬头，两人目光相接的瞬间"
    scene_resolution: "林晚收起图纸起身离开，沈云洲看着她的背影"
    
    # ===== 创作备注 =====
    director_notes: "建议用长镜头表现林晚的孤独感，对白部分可考虑用面部特写切换"
    rewrite_suggestions:
      - "原著中林晚有大段内心独白，剧本中可考虑用旁白或闪回呈现"
      - "沈云洲的接近动机在本场没有交代，编剧可决定是否埋伏笔"
    source_text_excerpt: "原文片段：林晚已经在这家咖啡馆坐了两个小时...（保留 100 字原文供参考）"
    
    transition: "切"
```

### 字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `slug_line` | string | 是 | 标准场景头格式，可直接导出 Final Draft |
| `scene_objective` | string | 是 | 本场的戏剧目的（编剧术语：场景目标） |
| `dramatic_question` | string | 否 | 本场要解答的戏剧问题 |
| `action_description` | string | 是 | 场景描写，200-500 字，多段落 |
| `characters_present` | array | 是 | 出场角色 + 进入/退出状态 |
| `dialogues[].parenthetical` | string | 否 | 括号注，对标好莱坞剧本的 (whisper) |
| `dialogues[].emotion` | string | 否 | 情绪标注 |
| `dialogues[].subtext` | string | 否 | **潜台词，本 Schema 灵魂字段** |
| `dialogues[].rewrite_notes` | string | 否 | AI 主动给的改写建议 |
| `scene_climax` | string | 否 | 场景小高潮 |
| `director_notes` | string | 否 | 镜头/调度建议 |
| `rewrite_suggestions` | array | 否 | 整场的改写建议清单 |
| `source_text_excerpt` | string | 否 | 原著节选，供编剧对照 |

---

## 四、character_list（详细版）

```yaml
character_list:
  - name: "林晚"
    role: "女主角"
    age: "28岁"
    description: |
      建筑师，独立事务所合伙人。父亲早逝，母亲改嫁后她跟着外婆长大。
      因此对亲密关系有本能的防御。外表冷静理性，内里其实有强烈的
      情感需求，但她自己也不愿承认。三年前一段失败的恋情让她彻底
      封闭，但内心深处仍渴望被理解。
    arc: "从封闭到敞开 —— 从拒绝任何亲密关系，到学会再次信任一个人"
    speech_pattern: "短句多，语速慢，回避正面回答，常用'随便'、'都行'等模糊词"
```

---

## 五、与 Schema 一（AI 视频）的关键差异

| 维度 | AI 视频版 | 编剧工作版 |
|------|----------|-----------|
| 拆分粒度 | shot（3-10秒） | scene（一场戏） |
| 描述字数 | 简短，可机器解析 | 长段落，文学化 |
| 镜头字段 | 完整运镜参数 | 仅建议性 `director_notes` |
| 角色字段 | `appearance` 视觉描述 | `arc` 角色弧光 + `speech_pattern` |
| 对白字段 | `voice_tone`、`pace` 供 TTS | `subtext`、`emotion`、`rewrite_notes` 供编剧 |
| 是否保留原著 | 不保留 | `source_text_excerpt` 保留原文片段 |
| 输出 prompt | 是（`generation_prompt`） | 否 |

---

## 六、完整示例（节选）

```yaml
schema_version: "screenwriter-1.0"
schema_type: "screenwriter"
title: "你好，陌生人"
genre: "都市情感剧"
logline: "一个封闭多年的女建筑师，在一个有目的接近她的陌生人面前，重新学会信任。"
synopsis: |
  林晚是上海一家独立建筑事务所的合伙人，三年前一段失败的恋情让她
  彻底封闭。沈云洲带着一个秘密的目的接近她——他是林晚已故父亲生前
  好友的儿子，受父亲所托照看林晚多年，但她从不知情。两人从合作伙伴
  开始，逐渐走近，秘密也随之浮出水面...
tone_reference: "节奏接近《不够善良的我们》，质感参考《漫长的季节》"

theme_keywords:
  - "都市孤独"
  - "信任重建"
  - "原生家庭创伤"
  - "成年人的克制"

character_list:
  - name: "林晚"
    role: "女主角"
    age: "28岁"
    description: "建筑师，独立事务所合伙人，外冷内热，对亲密关系有防御"
    arc: "从封闭到敞开"
    speech_pattern: "短句、语速慢、常用模糊词"

episodes:
  - episode_number: 1
    title: "陌生人的咖啡"
    source_chapter: "第一章 初遇"
    episode_summary: "林晚在咖啡馆遇到陌生男子沈云洲，两人短暂交集后各自离开，但沈云洲的出现并非偶然。"
    key_conflict: "封闭 vs 入侵 —— 林晚的私人空间被一个陌生人闯入"
    emotional_arc: "从平静 → 被打扰的烦躁 → 短暂的好奇 → 强行压下情绪离开"
    
    scenes:
      - scene_number: 1
        slug_line: "内景 - 咖啡馆 - 日"
        location_detail: "上海南京西路一家文艺咖啡馆，二楼靠窗"
        time_detail: "周三下午 3 点 17 分"
        scene_objective: "建立林晚的人物状态"
        dramatic_question: "她为什么独自一人？"
        action_description: |
          咖啡馆里人声鼎沸，但二楼这个角落却出奇地安静。
          
          林晚坐在靠窗的位置，面前摊着一沓建筑图纸。她的手指捏着一支
          铅笔，笔尖悬在纸上，却已经停了很久。
          
          桌上的咖啡早就凉透了。手机屏幕在桌角亮了一下又熄灭。她瞥了
          一眼，没有动。
        characters_present:
          - name: "林晚"
            state_at_entry: "已在场"
            state_at_exit: "强装镇定后离开"
        dialogues:
          - sequence: 1
            character: "沈云洲"
            parenthetical: "走到桌边"
            line: "这位置有人吗？"
            emotion: "刻意随意"
            subtext: "他知道她是谁"
            rewrite_notes: "可让沈云洲先观察几秒再开口"
        director_notes: "建议用长镜头表现林晚的孤独感"
        source_text_excerpt: "原文片段：林晚已经在这家咖啡馆坐了两个小时..."
        transition: "切"
```

---

## 七、设计取舍

**为什么保留 `subtext` 和 `source_text_excerpt`**：编剧最珍贵的资源是"原著情感细节"。AI 直接把小说心理描写转成对白会丢失太多东西。Schema 把这些信息作为"备注层"保留，编剧二改时能看到 AI 是怎么想的、原文怎么写的，决策成本更低。最终导出剧本时，可以一键过滤掉这些字段。

**为什么有 `rewrite_notes`**：AI 知道自己哪里不够好。让 AI 主动标记"这句台词偏强势，如果你想塑造温柔人设可改为 X"，把 AI 从"输出者"变成"协作者"。

**为什么不写镜头**：编剧不写镜头。在影视工业里，镜头是导演的活。强行让编剧剧本带镜头字段是越权，专业编剧反而会反感。
