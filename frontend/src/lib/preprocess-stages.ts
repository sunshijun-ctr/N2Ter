/** 预处理 UI 六阶段与 backend progress event_type 映射 */

export type StageUiState = 'pending' | 'running' | 'done' | 'failed'

export const PREPROCESS_STAGE_DEFS = [
  { name: '章节拆分', descKey: 'split' as const },
  { name: '章节处理', descKey: 'chapters' as const },
  { name: '全书分析', descKey: 'analysis' as const },
  { name: '向量化入库', descKey: 'vectorize' as const },
  { name: '题材二次确认', descKey: 'genre' as const },
  { name: '概览版生成', descKey: 'overview' as const },
] as const

export const PREPROCESS_STAGE_DESC: Record<string, string> = {
  split: '已拆分章节',
  chapters: '摘要 / 关键事件 / 语义切片',
  analysis: '全书摘要 · 角色弧光 · 伏笔索引',
  vectorize: 'BGE-M3 → Chroma',
  genre: 'AI 校验用户所选题材',
  overview: '自动产出全书改编报告',
}

/** event_type → 当前活跃阶段 index (0-based) */
const EVENT_ACTIVE_STAGE: Record<string, number> = {
  preprocess_started: 0,
  split_completed: 1,
  chapters_started: 1,
  chapter_done: 1,
  novel_summary_done: 2,
  characters_done: 2,
  foreshadowing_done: 2,
  vectorize_progress: 3,
  genre_verified: 4,
  overview_done: 5,
}

export function initialPreprocessStages(): StageUiState[] {
  return Array(PREPROCESS_STAGE_DEFS.length).fill('pending') as StageUiState[]
}

export function formatProgressDetail(eventType: string, payload: Record<string, unknown>): string {
  switch (eventType) {
    case 'split_completed':
      return `已拆分 ${payload.chapter_count ?? '?'} 章`
    case 'chapter_done':
      return `第 ${payload.chapter_num ?? '?'} 章完成${payload.progress != null ? ` · ${payload.progress}%` : ''}`
    case 'characters_done':
      return `识别 ${payload.character_count ?? '?'} 个角色`
    case 'foreshadowing_done':
      return `索引 ${payload.pair_count ?? '?'} 对伏笔`
    case 'vectorize_progress':
      return `向量化 ${payload.vectorized ?? payload.progress ?? '?'}%`
    case 'genre_verified':
      return payload.needs_confirmation ? '题材需二次确认' : '题材校验通过'
    case 'overview_done':
      return '概览版已生成'
    case 'preprocess_done':
      return `预处理完成 · ${payload.chapter_count ?? '?'} 章 / ${payload.scene_count ?? '?'} 场景`
    case 'preprocessing_failed':
      return String(payload.error ?? '预处理失败')
    default:
      return eventType
  }
}

export function applyProgressEvent(
  stages: StageUiState[],
  eventType: string,
): StageUiState[] {
  if (eventType === 'preprocess_done') {
    return stages.map(() => 'done' as StageUiState)
  }
  if (eventType === 'preprocessing_failed') {
    const next = [...stages]
    const runningIdx = next.findIndex((s) => s === 'running')
    const idx = runningIdx >= 0 ? runningIdx : 0
    next[idx] = 'failed'
    return next
  }

  const active = EVENT_ACTIVE_STAGE[eventType]
  if (active == null) return stages

  const next = [...stages]
  for (let i = 0; i < active; i++) next[i] = 'done'
  next[active] = 'running'
  return next
}

/** mock 模式：按 novel.status 映射静态阶段 */
export function stagesFromNovelStatus(status: string): StageUiState[] {
  switch (status) {
    case 'uploaded':
      return ['pending', 'pending', 'pending', 'pending', 'pending', 'pending']
    case 'preprocessing':
      return ['done', 'running', 'pending', 'pending', 'pending', 'pending']
    case 'ready_for_planning':
      return ['done', 'done', 'done', 'done', 'done', 'done']
    case 'preprocessing_failed':
      return ['done', 'done', 'failed', 'pending', 'pending', 'pending']
    default:
      return initialPreprocessStages()
  }
}
