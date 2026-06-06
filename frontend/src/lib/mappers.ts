import type {
  ApiAdaptationPlanRead,
  ApiChapterRead,
  ApiEpisodeRead,
  ApiExportRead,
  ApiMessageRead,
  ApiNovelListItem,
  ApiNovelRead,
  ApiProgressEventRead,
  ApiScreenplayRead,
  ApiTaskRead,
  ApiConversationRead,
} from './api-types'
import type {
  AdaptationPlan,
  AdaptationPlanItem,
  Conversation,
  Episode,
  EpisodeContent,
  EpisodeStatus,
  ExportFormat,
  ExportJob,
  ExportStatus,
  Message,
  MessageRole,
  Novel,
  NovelChapter,
  NovelStatus,
  OverviewData,
  OverviewEpisodeSummary,
  Scene,
  SceneDialogue,
  SchemaType,
  Screenplay,
  ScreenplayStatus,
  Task,
  TaskStatus,
  TaskType,
  ToolCall,
} from './types'

function mapTimestamps(dto: { created_at: string; updated_at: string }) {
  return { createdAt: dto.created_at, updatedAt: dto.updated_at }
}

export function mapChapter(dto: ApiChapterRead): NovelChapter {
  return {
    id: dto.id,
    chapterNum: dto.chapter_num,
    title: dto.title,
    content: dto.content,
    wordCount: dto.word_count,
    summary: dto.summary ?? undefined,
  }
}

export function mapNovel(dto: ApiNovelRead | ApiNovelListItem): Novel {
  return {
    id: dto.id,
    title: dto.title,
    author: dto.author ?? undefined,
    status: dto.status as NovelStatus,
    userSelectedGenres: dto.user_selected_genres ?? [],
    wordCount: dto.word_count ?? undefined,
    summary: 'summary' in dto ? dto.summary ?? undefined : undefined,
    ...mapTimestamps(dto),
  }
}

export function mapScreenplay(dto: ApiScreenplayRead): Screenplay {
  const plan = mapAdaptationPlanFromDict(dto.adaptation_plan)
  return {
    id: dto.id,
    novelId: dto.novel_id,
    title: dto.title,
    schemaType: dto.schema_type as SchemaType,
    status: dto.status as ScreenplayStatus,
    adaptationPlan: plan,
    ...mapTimestamps(dto),
  }
}

export function mapAdaptationPlan(dto: ApiAdaptationPlanRead, totalChapters?: number): AdaptationPlan {
  const items: AdaptationPlanItem[] = dto.episodes.map((ep) => ({
    episodeNum: ep.episode_num,
    title: ep.title ?? `第 ${ep.episode_num} 集`,
    sourceChapters: ep.source_chapters ?? [],
    oneLineSummary: ep.one_line_summary,
  }))
  const maxChapter = items.flatMap((i) => i.sourceChapters).reduce((m, n) => Math.max(m, n), 0)
  return {
    totalChapters: (totalChapters ?? maxChapter) || 1,
    episodeCount: dto.episode_count,
    items,
    reasoning: `全书建议 ${dto.episode_count} 集，约 ${dto.chapters_per_episode} 章/集。`,
  }
}

export function mapAdaptationPlanFromDict(raw: Record<string, unknown>): AdaptationPlan | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const episodes = (raw.episodes as ApiAdaptationPlanRead['episodes']) ?? []
  if (!Array.isArray(episodes)) return undefined
  const totalFromRaw = Number(raw.total_chapters ?? raw.totalChapters ?? 0)
  const maxChapter = episodes
    .flatMap((ep) => ep.source_chapters ?? [])
    .reduce((m, n) => Math.max(m, n), 0)
  return {
    totalChapters: totalFromRaw || maxChapter || episodes.length,
    episodeCount: Number(raw.episode_count ?? raw.episodeCount ?? episodes.length),
    items: episodes.map((ep) => ({
      episodeNum: Number(ep.episode_num),
      title: ep.title ?? `第 ${ep.episode_num} 集`,
      sourceChapters: ep.source_chapters ?? [],
      oneLineSummary: ep.one_line_summary,
    })),
    reasoning: typeof raw.reasoning === 'string' ? raw.reasoning : undefined,
  }
}

function parseOverviewEpisodesFromDoc(raw: Record<string, unknown>): OverviewEpisodeSummary[] {
  const docEpisodes = Array.isArray(raw.episodes) ? raw.episodes : []
  return docEpisodes
    .filter((ep): ep is Record<string, unknown> => ep != null && typeof ep === 'object')
    .map((ep, index) => ({
      episodeNum: Number(ep.episode_number ?? ep.episode_num ?? index + 1),
      title: String(ep.title ?? `第 ${index + 1} 集`),
      oneLineSummary: String(ep.one_line_summary ?? ep.summary ?? ''),
    }))
}

function mapOverviewEpisodesFromPlan(plan?: AdaptationPlan): OverviewEpisodeSummary[] {
  if (!plan?.items.length) return []
  return plan.items.map((item) => ({
    episodeNum: item.episodeNum,
    title: item.title,
    oneLineSummary: item.oneLineSummary ?? item.title,
  }))
}

/** 从 overview episode.content 或 screenplay.adaptation_plan 解析概览展示数据 */
export function mapOverviewDocument(
  doc: Record<string, unknown> | null | undefined,
  plan?: AdaptationPlan,
): OverviewData {
  const raw = doc ?? {}
  const docEpisodes = parseOverviewEpisodesFromDoc(raw)
  const planEpisodes = mapOverviewEpisodesFromPlan(plan)

  // 文档 episodes 为权威来源；仅当文档无列表时才用 adaptation_plan
  const resolvedEpisodes = docEpisodes.length > 0 ? docEpisodes : planEpisodes

  // 建议集数必须与分集大纲条数一致（勿单独采用 estimated_episodes / plan.episodeCount）
  const estimatedEpisodes =
    resolvedEpisodes.length > 0
      ? resolvedEpisodes.length
      : Math.max(
          Number(raw.estimated_episodes ?? 0),
          Number(plan?.episodeCount ?? 0),
          1,
        )

  return {
    logline: String(raw.logline ?? ''),
    marketComparable: String(raw.market_comparable ?? ''),
    adaptationDifficulty: String(raw.adaptation_difficulty ?? ''),
    estimatedEpisodes,
    episodes: resolvedEpisodes,
    isFallback: Boolean(raw.is_fallback),
  }
}

/** 概览版尚未生成时，用章节数估算（与 backend fallback 一致：max(chapters//2, 1)） */
export function buildOverviewFallback(
  novel: Novel,
  chapters: NovelChapter[],
): OverviewData {
  const estimated = Math.max(Math.ceil(chapters.length / 2), 1)
  const episodes = chapters.slice(0, estimated).map((ch) => ({
    episodeNum: ch.chapterNum,
    title: ch.title,
    oneLineSummary: ch.summary ?? ch.title,
  }))
  return {
    logline: novel.summary ?? '预处理完成后将自动生成 Logline',
    marketComparable: '待 AI 分析',
    adaptationDifficulty: chapters.length ? '待评估' : '需先完成预处理',
    estimatedEpisodes: episodes.length,
    episodes,
    isFallback: true,
  }
}

function mapScene(raw: Record<string, unknown>, index: number): Scene {
  const dialoguesRaw = (raw.dialogues as Record<string, unknown>[]) ?? []
  return {
    id: String(raw.id ?? `scene-${index}`),
    heading: String(raw.heading ?? raw.slug_line ?? ''),
    action: String(raw.action ?? raw.action_description ?? ''),
    dialogues: dialoguesRaw.map((d, i) => mapDialogue(d, i)),
  }
}

function mapDialogue(raw: Record<string, unknown>, index: number): SceneDialogue {
  return {
    id: String(raw.id ?? `dlg-${index}`),
    character: String(raw.character ?? raw.speaker ?? ''),
    line: String(raw.line ?? raw.text ?? ''),
    parenthetical: raw.parenthetical ? String(raw.parenthetical) : undefined,
  }
}

export function mapEpisodeContent(content: Record<string, unknown> | null | undefined): EpisodeContent {
  if (!content) return { scenes: [] }
  const scenesRaw = (content.scenes as Record<string, unknown>[]) ?? []
  return {
    ...content,
    scenes: scenesRaw.map((s, i) => mapScene(s, i)),
  }
}

/** 画布编辑格式 → 写入后端的 JSONB（保留 scenes 数组，合并原有 metadata） */
export function toEpisodeContentPayload(
  content: EpisodeContent,
  existing?: Record<string, unknown> | null,
): Record<string, unknown> {
  return {
    ...(existing ?? {}),
    scenes: (content.scenes ?? []).map((s, i) => ({
      id: s.id,
      scene_number: i + 1,
      heading: s.heading,
      slug_line: s.heading,
      action: s.action,
      action_description: s.action,
      dialogues: s.dialogues.map((d) => ({
        id: d.id,
        character: d.character,
        line: d.line,
        parenthetical: d.parenthetical,
      })),
    })),
  }
}

export function mapEpisode(dto: ApiEpisodeRead): Episode {
  return {
    id: dto.id,
    screenplayId: dto.screenplay_id,
    episodeNum: dto.episode_num,
    title: dto.title ?? `第 ${dto.episode_num} 集`,
    sourceChapters: dto.source_chapters ?? [],
    status: dto.status as EpisodeStatus,
    content: mapEpisodeContent(dto.content ?? null),
    ...mapTimestamps(dto),
  }
}

export function mapTask(dto: ApiTaskRead): Task {
  return {
    id: dto.id,
    taskType: dto.task_type as TaskType,
    novelId: dto.novel_id ?? undefined,
    episodeId: dto.episode_id ?? undefined,
    celeryId: dto.celery_id ?? undefined,
    status: dto.status as TaskStatus,
    progress: dto.progress,
    errorMessage: dto.error_message ?? undefined,
    retryCount: dto.retry_count,
    ...mapTimestamps(dto),
  }
}

export function mapExport(dto: ApiExportRead): ExportJob {
  return {
    id: dto.id,
    screenplayId: dto.screenplay_id,
    exportFormat: dto.export_format as ExportFormat,
    status: dto.status as ExportStatus,
    fileUrl: dto.file_url ?? undefined,
    createdAt: dto.created_at,
    expiresAt: dto.expires_at ?? undefined,
  }
}

export function mapConversation(dto: ApiConversationRead): Conversation {
  return {
    id: dto.id,
    title: dto.title,
    contextType: dto.context_type as Conversation['contextType'],
    status: 'active',
    novelId: dto.novel_id ?? undefined,
    screenplayId: dto.screenplay_id ?? undefined,
    ...mapTimestamps(dto),
  }
}

export function toAdaptationPlanPayload(
  plan: AdaptationPlan,
  novelId: string,
  title: string,
): Record<string, unknown> {
  const chaptersPerEpisode = Math.max(
    1,
    Math.ceil(plan.totalChapters / Math.max(1, plan.episodeCount)),
  )
  return {
    novel_id: novelId,
    title,
    episode_count: plan.episodeCount,
    chapters_per_episode: chaptersPerEpisode,
    episodes: plan.items.map((item) => ({
      episode_num: item.episodeNum,
      title: item.title,
      source_chapters: item.sourceChapters,
      one_line_summary: item.oneLineSummary,
    })),
  }
}

export function mapMessage(dto: ApiMessageRead): Message {
  const toolCalls: ToolCall[] | undefined = dto.tool_results?.length
    ? dto.tool_results.map((tr) => ({
        name: String((tr as Record<string, unknown>).tool ?? 'tool'),
        args: JSON.stringify(tr),
        status: 'success' as const,
      }))
    : dto.tool_calls?.length
      ? dto.tool_calls.map((tc) => ({
          name: String((tc as Record<string, unknown>).name ?? 'tool'),
          args: JSON.stringify(tc),
          status: 'success' as const,
        }))
      : undefined
  return {
    id: dto.id,
    conversationId: dto.conversation_id,
    role: dto.role as MessageRole,
    content: dto.content ?? undefined,
    toolCalls,
    toolResults: dto.tool_results ?? undefined,
    isPinned: dto.is_pinned,
    isCompressed: dto.is_compressed,
  }
}

export function mapProgressEvent(dto: ApiProgressEventRead) {
  return {
    id: dto.id,
    novelId: dto.novel_id,
    eventType: dto.event_type,
    payload: dto.payload,
    createdAt: dto.created_at,
  }
}

export function pickScreenplay(
  screenplays: Screenplay[],
  preferredSchema?: SchemaType | null,
): Screenplay | undefined {
  if (!screenplays.length) return undefined
  if (preferredSchema && preferredSchema !== 'overview') {
    return (
      screenplays.find((s) => s.schemaType === preferredSchema) ??
      screenplays.find((s) => s.schemaType === 'screenwriter') ??
      screenplays[0]
    )
  }
  return (
    screenplays.find((s) => s.schemaType === 'screenwriter') ??
    screenplays.find((s) => !s.isAutoGenerated) ??
    screenplays[0]
  )
}
