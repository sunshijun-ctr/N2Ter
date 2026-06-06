/** 后端 Pydantic 响应/请求形状（snake_case，与 backend/app/schemas 对齐） */

export interface ApiTimestamped {
  created_at: string
  updated_at: string
}

export interface ApiNovelRead extends ApiTimestamped {
  id: string
  title: string
  author?: string | null
  status: string
  user_selected_genres: string[]
  word_count?: number | null
  summary?: string | null
}

export type ApiNovelListItem = Omit<ApiNovelRead, 'summary'>

export interface ApiNovelCreate {
  title: string
  author?: string | null
  content: string
  genres: string[]
}

export interface ApiChapterRead extends ApiTimestamped {
  id: string
  novel_id: string
  chapter_num: number
  title: string
  content: string
  word_count: number
  summary?: string | null
  special_type?: string | null
  needs_sub_split: boolean
}

export interface ApiScreenplayRead extends ApiTimestamped {
  id: string
  novel_id: string
  title: string
  schema_type: string
  status: string
  adaptation_plan: Record<string, unknown>
}

export interface ApiScreenplayCreate {
  novel_id: string
  schema_type: string
  title?: string | null
  adaptation_plan?: Record<string, unknown>
}

export interface ApiAdaptationPlanRead {
  novel_id: string
  title: string
  episode_count: number
  chapters_per_episode: number
  episodes: Array<{
    episode_num: number
    title?: string
    source_chapters: number[]
    one_line_summary?: string
  }>
}

export interface ApiAdaptationPlanRequest {
  chapters_per_episode?: number
}

export interface ApiEpisodeRead extends ApiTimestamped {
  id: string
  screenplay_id: string
  episode_num: number
  title?: string | null
  source_chapters: number[]
  status: string
  content?: Record<string, unknown> | null
  error_message?: string | null
}

export interface ApiEpisodeUpdate {
  title?: string | null
  content?: Record<string, unknown> | null
  status?: string | null
}

export interface ApiTaskRead extends ApiTimestamped {
  id: string
  task_type: string
  novel_id?: string | null
  episode_id?: string | null
  celery_id?: string | null
  status: string
  progress: number
  error_message?: string | null
  retry_count: number
}

export interface ApiTaskRef {
  task_id: string
  status: string
  episode_id?: string
}

export interface ApiProgressEventRead {
  id: number
  novel_id: string
  event_type: string
  payload: Record<string, unknown>
  created_at: string
}

export interface ApiExportRead {
  id: string
  screenplay_id: string
  export_format: string
  status: string
  file_url?: string | null
  error_message?: string | null
  created_at: string
  expires_at?: string | null
}

export interface ApiExportCreate {
  export_format: string
}

export interface ApiConversationRead extends ApiTimestamped {
  id: string
  title: string
  context_type: string
  novel_id?: string | null
  screenplay_id?: string | null
}

export interface ApiMessageRead {
  id: string
  conversation_id: string
  role: string
  content?: string | null
  tool_calls?: Record<string, unknown>[] | null
  tool_results?: Record<string, unknown>[] | null
  token_usage?: Record<string, unknown> | null
  is_pinned: boolean
  is_compressed: boolean
}

export interface ApiSkillRead extends ApiTimestamped {
  id: string
  name: string
  description?: string | null
  content: Record<string, unknown>
  created_by: string
}
