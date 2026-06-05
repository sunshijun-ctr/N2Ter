// 骨架阶段的假数据，后续接入 REST/WS 后替换

import type { ChatMessage, Episode, Novel } from './types'

export const GENRES = [
  '古装权谋',
  '武侠',
  '仙侠玄幻',
  '都市情感',
  '悬疑推理',
  'AI 短剧分镜',
]

export const mockNovels: Novel[] = [
  {
    id: 'n_001',
    title: '红楼梦',
    author: '曹雪芹',
    status: 'ready_for_planning',
    genres: ['古装权谋'],
    wordCount: 730000,
  },
  {
    id: 'n_002',
    title: '你好，陌生人',
    author: '佚名',
    status: 'preprocessing',
    genres: ['都市情感'],
    wordCount: 120000,
  },
]

export const mockEpisodes: Episode[] = [
  { id: 'e1', episodeNum: 1, title: '初遇', sourceChapters: [1, 2], status: 'done' },
  { id: 'e2', episodeNum: 2, title: '试探', sourceChapters: [3], status: 'done' },
  { id: 'e3', episodeNum: 3, title: '暗涌', sourceChapters: [4, 5], status: 'generating' },
  { id: 'e4', episodeNum: 4, title: '——', sourceChapters: [6], status: 'pending' },
]

export const mockMessages: ChatMessage[] = [
  { id: 'm1', role: 'user', content: '把第 2 集的对白整体调温柔一点' },
  {
    id: 'm2',
    role: 'assistant',
    content: '好的，我已经把第 2 集所有场景的对白调整为更温柔的语气。\n主要变化：场景 1 林晚的台词更克制，场景 2 沈云洲的台词更礼貌。[画布已更新]',
    toolCalls: [
      { name: 'chapter_get', args: '3, mode="full"', durationMs: 156, status: 'success' },
      { name: 'character_timeline', args: '"林晚"', durationMs: 89, status: 'success' },
      { name: 'episode_patch', args: 'ep_2, ...', durationMs: 3200, status: 'success' },
    ],
  },
]
