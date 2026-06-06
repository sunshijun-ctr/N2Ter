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

export interface ChapterProgress {
  done: number
  total: number
}

export interface PreprocessProgressState {
  stages: StageUiState[]
  detail: string
  lastEventId: number
  done: boolean
  failed: boolean
  chapterProgress: ChapterProgress | null
  stageDetails: Partial<Record<number, string>>
}

export function initialPreprocessStages(): StageUiState[] {
  return Array(PREPROCESS_STAGE_DEFS.length).fill('pending') as StageUiState[]
}

export function createInitialProgressState(): PreprocessProgressState {
  return {
    stages: initialPreprocessStages(),
    detail: '',
    lastEventId: 0,
    done: false,
    failed: false,
    chapterProgress: null,
    stageDetails: {},
  }
}

function highestDoneIndex(stages: StageUiState[]): number {
  let idx = -1
  for (let i = 0; i < stages.length; i++) {
    if (stages[i] === 'done') idx = i
    else break
  }
  return idx
}

function advanceStages(stages: StageUiState[], activeIndex: number): StageUiState[] {
  const next = [...stages]
  const highestDone = highestDoneIndex(next)
  if (activeIndex < highestDone) return next

  for (let i = 0; i < activeIndex; i++) next[i] = 'done'
  next[activeIndex] = 'running'
  for (let i = activeIndex + 1; i < next.length; i++) {
    if (next[i] !== 'done') next[i] = 'pending'
  }
  return next
}

export function formatProgressDetail(
  eventType: string,
  payload: Record<string, unknown>,
  chapterProgress?: ChapterProgress | null,
): string {
  switch (eventType) {
    case 'split_completed':
      return `已拆分 ${payload.chapter_count ?? '?'} 章`
    case 'chapters_started':
      return `开始处理 ${payload.chapter_count ?? '?'} 章`
    case 'chapter_done':
      if (chapterProgress) {
        const pct = Math.round(
          (chapterProgress.done / Math.max(chapterProgress.total, 1)) * 100,
        )
        return `章节处理 ${chapterProgress.done}/${chapterProgress.total} 章（${pct}%）`
      }
      return `章节处理中${payload.progress != null ? ` · ${payload.progress}%` : ''}`
    case 'novel_summary_done':
      return '全书摘要已完成'
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
    case 'preprocess_started':
      return '预处理已开始'
    default:
      return ''
  }
}

export function applyProgressEventState(
  state: PreprocessProgressState,
  eventType: string,
  payload: Record<string, unknown> = {},
  eventId?: number,
): PreprocessProgressState {
  if (eventId != null && eventId <= state.lastEventId) return state

  const next: PreprocessProgressState = {
    ...state,
    stages: [...state.stages],
    stageDetails: { ...state.stageDetails },
    lastEventId: eventId != null ? Math.max(state.lastEventId, eventId) : state.lastEventId,
  }

  if (eventType === 'preprocess_done') {
    next.stages = next.stages.map(() => 'done')
    next.done = true
    next.detail = formatProgressDetail(eventType, payload, next.chapterProgress)
    return next
  }

  if (eventType === 'preprocessing_failed') {
    next.failed = true
    const runningIdx = next.stages.findIndex((s) => s === 'running')
    const idx = runningIdx >= 0 ? runningIdx : Math.max(0, highestDoneIndex(next.stages))
    next.stages[idx] = 'failed'
    next.detail = formatProgressDetail(eventType, payload, next.chapterProgress)
    return next
  }

  if (eventType === 'chapters_started') {
    const total = Number(payload.chapter_count) || 0
    next.chapterProgress = { done: 0, total }
  }

  if (eventType === 'chapter_done') {
    const total =
      next.chapterProgress?.total ||
      Number(payload.chapter_count) ||
      Number(payload.total) ||
      0
    const done = (next.chapterProgress?.done ?? 0) + 1
    next.chapterProgress = { done, total: total || done }
    next.stageDetails[1] = formatProgressDetail('chapter_done', payload, next.chapterProgress)
    const highestDone = highestDoneIndex(next.stages)
    if (highestDone < 1) {
      next.stages = advanceStages(next.stages, 1)
    }
    next.detail = formatProgressDetail('chapter_done', payload, next.chapterProgress)
    return next
  }

  if (eventType === 'split_completed') {
    next.stageDetails[0] = formatProgressDetail(eventType, payload)
  }
  if (eventType === 'characters_done') {
    next.stageDetails[2] = formatProgressDetail(eventType, payload)
  }
  if (eventType === 'foreshadowing_done' && !next.stageDetails[2]) {
    next.stageDetails[2] = formatProgressDetail(eventType, payload)
  }
  if (eventType === 'vectorize_progress') {
    next.stageDetails[3] = formatProgressDetail(eventType, payload)
  }
  if (eventType === 'genre_verified') {
    next.stageDetails[4] = formatProgressDetail(eventType, payload)
  }
  if (eventType === 'overview_done') {
    next.stageDetails[5] = formatProgressDetail(eventType, payload)
  }

  const active = EVENT_ACTIVE_STAGE[eventType]
  if (active != null) {
    next.stages = advanceStages(next.stages, active)
  }

  const detail = formatProgressDetail(eventType, payload, next.chapterProgress)
  if (detail) next.detail = detail
  return next
}

export function reduceProgressEvents(
  events: Array<{ id?: number; eventType: string; payload?: Record<string, unknown> }>,
): PreprocessProgressState {
  return events.reduce(
    (state, ev) =>
      applyProgressEventState(state, ev.eventType, ev.payload ?? {}, ev.id),
    createInitialProgressState(),
  )
}

/** @deprecated 使用 applyProgressEventState；保留给旧调用 */
export function applyProgressEvent(stages: StageUiState[], eventType: string): StageUiState[] {
  return applyProgressEventState(
    { ...createInitialProgressState(), stages },
    eventType,
  ).stages
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
