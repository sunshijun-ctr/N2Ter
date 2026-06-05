// 与后端 Design.md 对齐的核心类型（骨架阶段先放最小集）

export type SchemaType = 'ai_video' | 'screenwriter' | 'overview'

export type NovelStatus =
  | 'uploaded'
  | 'preprocessing'
  | 'ready_for_planning'
  | 'preprocessing_failed'

export type EpisodeStatus = 'pending' | 'generating' | 'done' | 'failed'

export interface Novel {
  id: string
  title: string
  author?: string
  status: NovelStatus
  genres: string[]
  wordCount?: number
}

export interface Episode {
  id: string
  episodeNum: number
  title: string
  sourceChapters: number[]
  status: EpisodeStatus
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'tool'
  content: string
  toolCalls?: ToolCall[]
}

export interface ToolCall {
  name: string
  args: string
  durationMs?: number
  status: 'success' | 'failed' | 'running'
}
