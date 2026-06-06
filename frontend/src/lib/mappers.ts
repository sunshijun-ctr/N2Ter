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
  Shot,
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

function mapShot(raw: Record<string, unknown>, index: number): Shot {
  const dialoguesRaw = (raw.dialogue ?? raw.dialogues ?? []) as Record<string, unknown>[]
  const emotionsRaw = (raw.character_emotion ?? []) as Record<string, unknown>[]
  return {
    id: String(raw.shot_id ?? raw.id ?? `shot-${index}`),
    shotType: raw.shot_type ? String(raw.shot_type) : undefined,
    durationSeconds:
      typeof raw.duration_seconds === 'number' ? raw.duration_seconds : undefined,
    subject: raw.subject ? String(raw.subject) : undefined,
    subjectAction: raw.subject_action ? String(raw.subject_action) : undefined,
    cameraAngle: raw.camera_angle ? String(raw.camera_angle) : undefined,
    cameraMovement: raw.camera_movement ? String(raw.camera_movement) : undefined,
    lighting: raw.lighting ? String(raw.lighting) : undefined,
    background: raw.background ? String(raw.background) : undefined,
    generationPrompt: raw.generation_prompt ? String(raw.generation_prompt) : undefined,
    transition: raw.transition_to_next ? String(raw.transition_to_next) : undefined,
    dialogues: (Array.isArray(dialoguesRaw) ? dialoguesRaw : [])
      .map((d, i) => ({
        id: String(d.id ?? `shotdlg-${index}-${i}`),
        character: d.character_id
          ? String(d.character_id)
          : d.character
            ? String(d.character)
            : undefined,
        line: mapDialogueLine(d),
        voiceTone: d.voice_tone ? String(d.voice_tone) : undefined,
      }))
      .filter((d) => d.line),
    emotions: (Array.isArray(emotionsRaw) ? emotionsRaw : [])
      .map((e) => String(e.emotion ?? ''))
      .filter(Boolean),
    raw,
  }
}

/** 把（已编辑的）分镜回写为后端 JSON，合并原始 raw 中未编辑的字段。 */
function shotToJson(shot: Shot): Record<string, unknown> {
  const base: Record<string, unknown> = { ...(shot.raw ?? {}) }
  base.shot_id = shot.id
  if (shot.shotType !== undefined) base.shot_type = shot.shotType
  if (shot.durationSeconds !== undefined) base.duration_seconds = shot.durationSeconds
  if (shot.subject !== undefined) base.subject = shot.subject
  if (shot.subjectAction !== undefined) base.subject_action = shot.subjectAction
  if (shot.cameraAngle !== undefined) base.camera_angle = shot.cameraAngle
  if (shot.cameraMovement !== undefined) base.camera_movement = shot.cameraMovement
  if (shot.lighting !== undefined) base.lighting = shot.lighting
  if (shot.background !== undefined) base.background = shot.background
  if (shot.generationPrompt !== undefined) base.generation_prompt = shot.generationPrompt
  if (shot.transition !== undefined) base.transition_to_next = shot.transition
  const rawDlg = (Array.isArray(base.dialogue) ? base.dialogue : []) as Record<string, unknown>[]
  base.dialogue = shot.dialogues.map((d, i) => ({
    ...(rawDlg[i] ?? {}),
    line: d.line,
    ...(d.character !== undefined ? { character_id: d.character } : {}),
    ...(d.voiceTone !== undefined ? { voice_tone: d.voiceTone } : {}),
  }))
  delete base.dialogues
  const rawEmo = (Array.isArray(base.character_emotion)
    ? base.character_emotion
    : []) as Record<string, unknown>[]
  base.character_emotion = shot.emotions.map((e, i) => ({ ...(rawEmo[i] ?? {}), emotion: e }))
  return base
}

function mapScene(raw: Record<string, unknown>, index: number): Scene {
  // 编剧 agent 输出用单数 `dialogue`（{speaker,line,subtext}）；旧版/编辑器
  // 用复数 `dialogues`（{character,line,parenthetical}）。两者都要兼容。
  const dialoguesRaw =
    (raw.dialogues as Record<string, unknown>[]) ??
    (raw.dialogue as Record<string, unknown>[]) ??
    []
  const shotsRaw = (raw.shots as Record<string, unknown>[]) ?? []
  const hasShots = Array.isArray(shotsRaw) && shotsRaw.length > 0
  return {
    id: String(raw.id ?? raw.scene_id ?? `scene-${index}`),
    // 编剧 agent 把 slug line 放在 `setting`
    heading: String(raw.heading ?? raw.slug_line ?? raw.setting ?? ''),
    action: String(raw.action ?? raw.action_description ?? ''),
    dialogues: dialoguesRaw.map((d, i) => mapDialogue(d, i)),
    // 保留原始 JSON，使编辑回写时不丢 agent 字段
    // （objective/characters/rewrite_notes/source_text_excerpt 等）。
    raw,
    // AI 视频版：场景内是分镜。映射出来用于展示。
    ...(hasShots ? { shots: shotsRaw.map((s, i) => mapShot(s, i)) } : {}),
  }
}

function mapDialogueLine(raw: Record<string, unknown>): string {
  if (typeof raw.line === 'string' && raw.line.trim()) return raw.line
  if (typeof raw.text === 'string' && raw.text.trim()) return raw.text
  if (typeof raw.dialogue === 'string' && raw.dialogue.trim()) return raw.dialogue
  if (typeof raw.content === 'string' && raw.content.trim()) return raw.content
  if (Array.isArray(raw.lines)) {
    return raw.lines.map((l) => String(l).trim()).filter(Boolean).join('\n')
  }
  return String(raw.line ?? raw.text ?? '')
}

function mapDialogue(raw: Record<string, unknown>, index: number): SceneDialogue {
  return {
    id: String(raw.id ?? `dlg-${index}`),
    character: String(raw.character ?? raw.speaker ?? raw.name ?? ''),
    line: mapDialogueLine(raw),
    // 编剧 agent 用 `subtext`（潜台词）替代 parenthetical
    parenthetical: raw.parenthetical
      ? String(raw.parenthetical)
      : raw.subtext
        ? String(raw.subtext)
        : undefined,
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
    scenes: (content.scenes ?? []).map((s, i) => {
      // AI 视频版（分镜场景）：把编辑后的分镜合并回原始 JSON，保留未编辑字段。
      if (s.shots) {
        return { ...(s.raw ?? {}), id: s.id, shots: s.shots.map(shotToJson) }
      }
      // 合并原始 JSON，保留 agent 字段（objective/characters/rewrite_notes/
      // source_text_excerpt 等），并把编辑同时写回两套命名以兼容前后端。
      return {
        ...(s.raw ?? {}),
        id: s.id,
        scene_number: i + 1,
        heading: s.heading,
        slug_line: s.heading,
        setting: s.heading,
        action: s.action,
        action_description: s.action,
        dialogues: s.dialogues.map((d) => ({
          id: d.id,
          character: d.character,
          line: d.line,
          parenthetical: d.parenthetical,
        })),
        dialogue: s.dialogues.map((d) => ({
          speaker: d.character,
          line: d.line,
          subtext: d.parenthetical,
        })),
      }
    }),
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
    errorMessage: dto.error_message ?? undefined,
    ...mapTimestamps(dto),
  }
}

/** 当 episode.source_chapters 为空时，从改编方案回填 */
export function enrichEpisodesFromPlan(
  episodes: Episode[],
  plan?: AdaptationPlan | null,
): Episode[] {
  if (!plan?.items.length) return episodes
  return episodes.map((ep) => {
    if (ep.sourceChapters.length > 0) return ep
    const item = plan.items.find((i) => i.episodeNum === ep.episodeNum)
    return item?.sourceChapters.length
      ? { ...ep, sourceChapters: item.sourceChapters }
      : ep
  })
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
    errorMessage: dto.error_message ?? undefined,
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
  if (preferredSchema === 'overview') {
    return screenplays.find((s) => s.schemaType === 'overview') ?? screenplays[0]
  }
  if (preferredSchema) {
    const match = screenplays.find((s) => s.schemaType === preferredSchema)
    if (match) return match
    // 已明确选择某详细版类型时，不要悄悄回退到另一种（避免 AI 视频版刷新变编剧版）
    return undefined
  }
  return (
    screenplays.find((s) => s.schemaType === 'screenwriter') ??
    screenplays.find((s) => s.schemaType === 'ai_video') ??
    screenplays.find((s) => !s.isAutoGenerated) ??
    screenplays[0]
  )
}

export function resolveScreenplay(
  screenplays: Screenplay[],
  session: { screenplayId?: string | null; selectedSchema?: SchemaType | null } | null,
  fallbackSchema?: SchemaType | null,
): Screenplay | undefined {
  if (session?.screenplayId) {
    const byId = screenplays.find((s) => s.id === session.screenplayId)
    if (byId) return byId
  }
  const schema = session?.selectedSchema ?? fallbackSchema
  return pickScreenplay(screenplays, schema)
}
