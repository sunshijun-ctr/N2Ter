import type { ChatMessage, SchemaOption } from './types'
import { buildAdaptationPlan } from './adaptation'

export const GENRES = [
  '古装权谋',
  '武侠',
  '仙侠玄幻',
  '都市情感',
  '悬疑推理',
]

export const SCHEMA_OPTIONS: SchemaOption[] = [
  {
    type: 'ai_video',
    label: 'AI 视频版',
    tagline: '分镜级 · 机器可读',
    description:
      '按 shot（3–10 秒）拆分，含运镜、光影、generation_prompt，可直接投喂 Sora、Kling 等视频模型。选中后自动加载 skill_ai_shorts。',
    audience: 'AI 视频创作者',
    highlights: ['分镜卡片', '角色一致 profile', '英文 generation_prompt'],
  },
  {
    type: 'screenwriter',
    label: '编剧工作版',
    tagline: '场景级 · 保留情感深度',
    description:
      '按 scene 拆分，含潜台词、改写建议、原文对照，留足二次创作空间。',
    audience: '专业编剧',
    highlights: ['subtext / rewrite_notes', 'source_text_excerpt', '好莱坞剧本排版导出'],
  },
  {
    type: 'overview',
    label: '只要概览版',
    tagline: '5 分钟读完 · 决策用',
    description: '不生成详细剧本，保留 Logline、改编难度、分集大纲，导出后直接交付。',
    audience: '制片 / 投资方',
    highlights: ['零额外 token', 'PDF 提案书', '快速判断改编价值'],
  },
]

export const mockAdaptationPlan = buildAdaptationPlan(80, 36)

export const mockMessages: ChatMessage[] = [
  { id: 'm1', role: 'user', content: '把第 2 集的对白整体调温柔一点' },
  {
    id: 'm2',
    role: 'assistant',
    content:
      '好的，我已经把第 2 集所有场景的对白调整为更温柔的语气。\n主要变化：场景 1 林晚的台词更克制，场景 2 沈云洲的台词更礼貌。[画布已更新]',
    toolCalls: [
      { name: 'chapter_get', args: '3, mode="full"', durationMs: 156, status: 'success' },
      { name: 'character_timeline', args: '"林晚"', durationMs: 89, status: 'success' },
      { name: 'episode_patch', args: 'ep_2, ...', durationMs: 3200, status: 'success' },
    ],
  },
]
