# Schema 三：快速概览剧本

**版本**：v1.0  
**用途**：供制片、版权方、出版社、投资方快速判断小说改编可行性  
**核心理念**：极简结构，一目了然，5 分钟读完整部剧的核心

---

## 一、设计目标

这个 Schema 的用户**不是创作者，是决策者**。他们的痛点是：

- 小说太长，没时间读完
- 编剧剧本太散，看不清主线
- 需要快速回答"这个故事能不能改、值不值得投、有没有市场"

所以 Schema 必须**极致精简**。每场戏只保留最关键的信息：**地点 / 出场角色 / 核心冲突 / 结果**。读完一份概览剧本，决策者应该能在 5 分钟内回答以下问题：

1. 故事讲了什么？
2. 主要角色是谁、关系如何？
3. 戏剧冲突够不够强？
4. 改编工作量大不大？

---

## 二、总体结构

```yaml
schema_version: "overview-1.0"
schema_type: "overview"

# ===== 核心三问 =====
title: string
logline: string                # 一句话故事
hook: string                   # 卖点 / 抓人点

# ===== 决策辅助 =====
genre: string
estimated_episodes: integer    # 预估集数
target_audience: string        # 目标受众
market_comparable: string      # 类比作品（"类似《三十而已》+《漫长的季节》"）
adaptation_difficulty: string  # 改编难度评级：低/中/高 + 理由

# ===== 人物 =====
main_characters:               # 只列主要角色，3-5 个
  - name: string
    one_liner: string          # 一句话人设
    role: string

# ===== 情节主线 =====
plot_arc:
  setup: string                # 开端
  inciting_incident: string    # 触发事件
  rising_action: string        # 发展
  climax: string               # 高潮
  resolution: string           # 结局

# ===== 分集概览 =====
episodes:
  - episode_number: integer
    title: string
    source_chapter: string
    one_line_summary: string   # 一句话本集梗概
    key_scenes:                # 每集只列 3-5 个关键场景
      - ...
```

---

## 三、key_scenes（关键场景）—— 极简结构

```yaml
key_scenes:
  - location: "咖啡馆"
    characters: ["林晚", "沈云洲"]
    conflict: "陌生人有目的接近，女主防御"
    outcome: "女主离开，但收下了名片"
    weight: "高"               # 高/中/低 —— 在主线中的重要性
```

### 字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `location` | string | 是 | 地点，单个词或短语 |
| `characters` | array | 是 | 出场角色名 |
| `conflict` | string | 是 | 本场核心冲突，一句话 |
| `outcome` | string | 是 | 本场结果，一句话 |
| `weight` | enum | 否 | 主线权重，帮助决策者识别核心场景 |

**没有的字段**（故意不要）：
- ❌ 对白 —— 太占篇幅，决策者不关心
- ❌ 描述 —— 一句话冲突 + 结果已经够
- ❌ 镜头 —— 无关
- ❌ 情绪、潜台词 —— 无关
- ❌ 时间 —— 除非时间是戏剧元素，否则忽略

---

## 四、plot_arc（情节主线）—— 五幕结构

```yaml
plot_arc:
  setup: |
    林晚是上海一名独立建筑师，三年前一段失败的恋情让她封闭自己，
    过着规律但孤独的生活。
  
  inciting_incident: |
    陌生男子沈云洲在咖啡馆有意接近她，递出合作名片。
  
  rising_action: |
    林晚因项目压力被迫接受合作，两人在工作中逐渐熟悉，沈云洲
    展现出与外表不符的细腻，林晚的防御开始松动。
  
  climax: |
    林晚偶然发现沈云洲早就认识自己，并知道她父亲的秘密。
    信任崩塌，两人激烈争执。
  
  resolution: |
    沈云洲坦白自己的身份——他是林晚父亲生前好友的儿子，
    多年来一直在远处守护她。林晚最终选择原谅，两人重新开始。
```

**为什么用五幕结构**：这是好莱坞、网文、影视行业的通用语言。任何决策者看到这五个字段就能立刻判断"故事完不完整、节奏对不对"。

---

## 五、完整示例

```yaml
schema_version: "overview-1.0"
schema_type: "overview"

title: "你好，陌生人"
logline: "一个封闭多年的女建筑师，在一个有目的接近她的陌生人面前，重新学会信任。"
hook: "看似浪漫邂逅，实则是一场跨越十年的守护。"

genre: "都市情感"
estimated_episodes: 24
target_audience: "25-40岁都市女性"
market_comparable: "节奏类似《不够善良的我们》，题材接近《以家人之名》"
adaptation_difficulty: "中 —— 原著心理描写较多，需补充戏剧化情节，但主线清晰"

main_characters:
  - name: "林晚"
    role: "女主角"
    one_liner: "28岁建筑师，外冷内热，有亲密关系障碍"
  - name: "沈云洲"
    role: "男主角"
    one_liner: "32岁企业家，林晚父亲故友之子，背负秘密接近她"
  - name: "顾清"
    role: "女配"
    one_liner: "林晚的闺蜜，故事中的'解压阀'"
  - name: "周明远"
    role: "男配"
    one_liner: "林晚前任，关键时刻搅局者"

plot_arc:
  setup: "林晚封闭独居，过着规律孤独的生活。"
  inciting_incident: "陌生男子沈云洲在咖啡馆有意接近她。"
  rising_action: "两人被迫合作，林晚防御松动。"
  climax: "林晚发现沈云洲早认识自己，信任崩塌。"
  resolution: "沈云洲坦白身份，两人重新开始。"

episodes:
  - episode_number: 1
    title: "陌生人的咖啡"
    source_chapter: "第一章 初遇"
    one_line_summary: "林晚在咖啡馆遇到沈云洲，短暂交集，埋下伏笔。"
    key_scenes:
      - location: "咖啡馆"
        characters: ["林晚", "沈云洲"]
        conflict: "陌生人有目的接近，女主防御"
        outcome: "女主离开，收下名片"
        weight: "高"
      - location: "林晚公寓"
        characters: ["林晚"]
        conflict: "独自在家反复看那张名片"
        outcome: "决定不联系"
        weight: "中"

  - episode_number: 2
    title: "命中注定的合作"
    source_chapter: "第二章 项目"
    one_line_summary: "林晚因项目危机被迫联系沈云洲，开启合作。"
    key_scenes:
      - location: "事务所"
        characters: ["林晚", "顾清"]
        conflict: "项目甲方临时撤资"
        outcome: "林晚被迫想起那张名片"
        weight: "高"
      - location: "沈云洲办公室"
        characters: ["林晚", "沈云洲"]
        conflict: "林晚低头求合作，沈云洲不动声色"
        outcome: "合作达成，林晚感到不安"
        weight: "高"

  - episode_number: 3
    title: "靠近"
    source_chapter: "第三章 共处"
    one_line_summary: "工作中两人逐渐熟悉，林晚发现沈云洲的细腻。"
    key_scenes:
      - location: "工地"
        characters: ["林晚", "沈云洲"]
        conflict: "现场出问题，沈云洲沉稳处理"
        outcome: "林晚第一次正眼看他"
        weight: "高"
```

---

## 六、与前两套 Schema 的差异

| 维度 | AI 视频版 | 编剧工作版 | 概览版 |
|------|----------|-----------|--------|
| 文件体积 | 大（每镜头一段 prompt） | 中（每场 200-500 字描述） | **极小**（每场 4 字段） |
| 阅读时间 | 不适合人读 | 30 分钟+ | **5 分钟** |
| 主要用户 | AI 模型 | 编剧 | 制片/投资方 |
| 是否含对白 | 是 | 是 | **否** |
| 是否含镜头 | 是 | 仅备注 | **否** |
| 顶层独有字段 | `visual_style` | `logline`+`tone_reference` | `market_comparable`+`adaptation_difficulty`+`hook` |

---

## 七、设计取舍

**为什么有 `market_comparable`（类比作品）**：这是影视投资圈的硬通货。任何项目立项时第一句话都是"这个项目类似 XX + XX"。让 AI 主动给出类比，决策者立刻有参照系。

**为什么有 `adaptation_difficulty`**：小说改编最大的不确定性是"工作量"。AI 在分析完全文后，最适合给出这个评级——心理描写多不多、人物多不多、时间线复不复杂，这些都是改编成本的来源。AI 给出"中-高"评级，制片方就知道需要多少编剧人月。

**为什么砍掉对白**：决策者读对白会把自己绕进去。他们要看的是骨架不是肉。一旦剧本里出现"我爱你"这种台词，决策者注意力就跑偏了。极简版必须无情砍掉。

**为什么保留 `weight`（场景权重）**：决策者快速翻阅时，可以只看"高权重"场景，进一步压缩阅读时间。

**为什么有 `hook` 但 Schema 一/二没有**：因为决策者看一个项目首先看的就是"有没有抓人点"。这是营销和宣发的核心。编剧不关心这个（他们要细节），AI 视频模型更不关心（它要画面）。三个 Schema 的"独有字段"恰恰反映了三种用户最在意的东西。

---

## 八、典型使用流程

```
小说作者 → 选择"概览版"输出
        ↓
    生成 YAML（30秒内完成）
        ↓
    导出为 PDF 一页纸提案
        ↓
    投递给版权方/制片公司
        ↓
    决策者 5 分钟读完，给出回复
```

整个流程从"小说写完"到"项目立项判断"，理论上可以在 1 小时内完成。这是本 Schema 存在的意义。
