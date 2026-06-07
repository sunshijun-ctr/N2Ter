import { create } from 'zustand'
import { api, ApiError } from '@/api/client'
import { connectConversationWs, connectNovelProgressWs } from '@/api/websocket'
import type {
  AdaptationPlan,
  AgentStep,
  ChatMessage,
  Episode,
  EpisodeContent,
  ExportFormat,
  ExportResult,
  Novel,
  OverviewData,
  Scene,
  SceneDialogue,
  SchemaType,
  Screenplay,
  Shot,
  ShotDialogue,
  ToolCall,
  WsServerMessage,
} from '@/lib/types'
import {
  mockAdaptationPlan,
  mockEpisodesByScreenplay,
  mockNovels,
  mockScreenplays,
  getScreenplayForNovel,
  getOverviewScreenplay,
} from '@/lib/mock'
import { buildAdaptationPlan } from '@/lib/adaptation'
import { newCanvasId } from '@/lib/utils'
import {
  clearNovelSession,
  getLastNovelId,
  loadNovelSession,
  saveNovelSession,
  setLastNovelId,
} from '@/lib/novel-session'
import {
  applyProgressEventState,
  createInitialProgressState,
  initialPreprocessStages,
  reduceProgressEvents,
  type StageUiState,
} from '@/lib/preprocess-stages'
import {
  resolveScreenplay,
  enrichEpisodesFromPlan,
  mapOverviewDocument,
  buildOverviewFallback,
  toAdaptationPlanPayload,
  toEpisodeContentPayload,
} from '@/lib/mappers'

let chatWsConn: ReturnType<typeof connectConversationWs> | null = null
let progressWsConn: ReturnType<typeof connectNovelProgressWs> | null = null
let progressWsNovelId: string | null = null

function cloneEpisodes(map: Record<string, Episode[]>): Record<string, Episode[]> {
  return JSON.parse(JSON.stringify(map)) as Record<string, Episode[]>
}

const initialNovel = mockNovels[0] ?? null
const initialScreenplay = initialNovel ? getScreenplayForNovel(initialNovel.id) : undefined
const initialEpisodes = initialScreenplay
  ? cloneEpisodes(mockEpisodesByScreenplay)[initialScreenplay.id] ?? []
  : []

interface AppState {
  novels: Novel[]
  currentNovel: Novel | null
  currentScreenplay: Screenplay | null
  episodesByScreenplay: Record<string, Episode[]>
  activeEpisodeId: string | null
  /** 生成时各集 agent 的实时执行步骤，按 episodeId 索引 */
  agentStepsByEpisode: Record<string, AgentStep[]>

  selectedSchema: SchemaType | null
  adaptationPlan: AdaptationPlan | null
  planConfirmed: boolean

  globalLoading: boolean
  globalError: string | null
  exportDialogOpen: boolean
  apiConnected: boolean

  preprocessStages: StageUiState[]
  preprocessDetail: string
  preprocessStageDetails: Partial<Record<number, string>>
  preprocessLastEventId: number
  preprocessChapterProgress: { done: number; total: number } | null
  preprocessWsConnected: boolean
  preprocessDone: boolean

  conversationId: string | null
  chatMessages: ChatMessage[]
  chatStreaming: string | null
  chatStreamingTools: ToolCall[]
  chatSending: boolean
  chatReady: boolean

  overviewData: OverviewData | null
  overviewLoading: boolean

  generatingAll: boolean

  hydrateFromApi: () => Promise<void>
  uploadAndPreprocess: (file: File, genres: string[]) => Promise<string | null>
  refreshNovel: (novelId: string) => Promise<void>
  deleteNovel: (novelId: string) => Promise<boolean>
  startPreprocessWs: () => Promise<void>
  stopPreprocessWs: () => void
  applyPreprocessProgressEvent: (
    eventType: string,
    payload: Record<string, unknown>,
    eventId?: number,
  ) => void

  setCurrentNovel: (n: Novel | null) => void
  switchNovel: (novelId: string, options?: { quiet?: boolean }) => Promise<void>
  setSelectedSchema: (s: SchemaType | null) => void
  setAdaptationPlan: (p: AdaptationPlan | null) => void
  confirmPlan: () => Promise<void>
  resetPlanFlow: () => void
  fetchAdaptationPlan: (chaptersPerEpisode?: number) => Promise<void>
  loadOverview: () => Promise<void>

  setActiveEpisode: (id: string) => void
  getActiveEpisode: () => Episode | undefined
  getEpisodes: () => Episode[]
  /** 顺序依赖检查：返回阻挡本集生成的最早未完成前序集号，无阻挡则 null */
  getEpisodeBlocker: (episodeId: string) => number | null

  updateScene: (episodeId: string, sceneId: string, patch: Partial<Scene>) => void
  updateDialogue: (
    episodeId: string,
    sceneId: string,
    dialogueId: string,
    patch: Partial<SceneDialogue>,
  ) => void
  updateEpisodeContent: (episodeId: string, content: EpisodeContent) => void
  addScene: (episodeId: string) => void
  removeScene: (episodeId: string, sceneId: string) => void
  addDialogue: (episodeId: string, sceneId: string) => void
  removeDialogue: (episodeId: string, sceneId: string, dialogueId: string) => void
  updateShot: (
    episodeId: string,
    sceneId: string,
    shotId: string,
    patch: Partial<Shot>,
  ) => void
  addShot: (episodeId: string, sceneId: string) => void
  removeShot: (episodeId: string, sceneId: string, shotId: string) => void
  updateShotDialogue: (
    episodeId: string,
    sceneId: string,
    shotId: string,
    dialogueId: string,
    patch: Partial<ShotDialogue>,
  ) => void
  addShotDialogue: (episodeId: string, sceneId: string, shotId: string) => void
  removeShotDialogue: (
    episodeId: string,
    sceneId: string,
    shotId: string,
    dialogueId: string,
  ) => void
  saveActiveEpisode: () => Promise<void>
  generateEpisode: (episodeId: string) => Promise<void>
  resetEpisode: (episodeId: string) => Promise<void>
  generateAllEpisodes: () => Promise<void>

  ensureChatSession: () => Promise<void>
  disconnectChat: () => void
  sendChatMessage: (content: string) => Promise<void>
  refreshActiveEpisode: () => Promise<void>
  handleChatWsMessage: (msg: WsServerMessage) => void

  setGlobalLoading: (v: boolean) => void
  setGlobalError: (msg: string | null) => void
  clearError: () => void
  setExportDialogOpen: (open: boolean) => void
  requestExport: (format: ExportFormat) => Promise<ExportResult>
}

function formatApiErrorMessage(e: unknown, fallback: string): string {
  if (e instanceof ApiError) {
    try {
      const parsed = JSON.parse(e.message) as { detail?: unknown }
      if (typeof parsed.detail === 'string') return parsed.detail
      if (Array.isArray(parsed.detail)) return parsed.detail.map(String).join('；')
    } catch {
      /* plain text */
    }
    return e.message || fallback
  }
  return fallback
}

function patchEpisodes(
  state: AppState,
  screenplayId: string,
  episodeId: string,
  updater: (ep: Episode) => Episode,
): Partial<AppState> {
  const episodes = state.episodesByScreenplay[screenplayId]
  if (!episodes) return {}
  return {
    episodesByScreenplay: {
      ...state.episodesByScreenplay,
      [screenplayId]: episodes.map((ep) => (ep.id === episodeId ? updater(ep) : ep)),
    },
  }
}

export const useAppStore = create<AppState>((set, get) => ({
  novels: mockNovels,
  currentNovel: initialNovel,
  currentScreenplay: initialScreenplay ?? null,
  episodesByScreenplay: cloneEpisodes(mockEpisodesByScreenplay),
  activeEpisodeId: initialEpisodes[0]?.id ?? null,
  agentStepsByEpisode: {},

  selectedSchema: null,
  adaptationPlan: initialScreenplay?.adaptationPlan ?? mockAdaptationPlan,
  planConfirmed: false,

  globalLoading: false,
  globalError: null,
  exportDialogOpen: false,
  apiConnected: false,

  preprocessStages: initialPreprocessStages(),
  preprocessDetail: '',
  preprocessStageDetails: {},
  preprocessLastEventId: 0,
  preprocessChapterProgress: null,
  preprocessWsConnected: false,
  preprocessDone: false,

  conversationId: null,
  chatMessages: [],
  chatStreaming: null,
  chatStreamingTools: [],
  chatSending: false,
  chatReady: false,

  overviewData: null,
  overviewLoading: false,

  generatingAll: false,

  hydrateFromApi: async () => {
    try {
      const novels = await api.novels.list()
      set({ apiConnected: true, novels })
      if (!novels.length) {
        set({
          currentNovel: null,
          currentScreenplay: null,
          activeEpisodeId: null,
        })
        return
      }
      const currentId = get().currentNovel?.id
      const lastId = getLastNovelId()
      const validId = [currentId, lastId, novels[0].id].find(
        (id) => id && novels.some((n) => n.id === id),
      )!
      await get().switchNovel(validId)
    } catch {
      set({ apiConnected: false })
    }
  },

  uploadAndPreprocess: async (file, genres) => {
    set({ globalLoading: true, globalError: null })
    try {
      const content = await file.text()
      const title = file.name.replace(/\.(txt|docx)$/i, '') || '未命名小说'
      const novel = await api.novels.create({ title, content, genres })
      set((state) => ({
        apiConnected: true,
        novels: [novel, ...state.novels.filter((n) => n.id !== novel.id)],
        currentNovel: novel,
        currentScreenplay: null,
        activeEpisodeId: null,
        planConfirmed: false,
        preprocessStages: initialPreprocessStages(),
        preprocessDetail: '已上传，启动预处理…',
        preprocessStageDetails: {},
        preprocessLastEventId: 0,
        preprocessChapterProgress: null,
        preprocessDone: false,
      }))
      await api.novels.preprocess(novel.id)
      set((state) => ({
        currentNovel: state.currentNovel
          ? { ...state.currentNovel, status: 'preprocessing' }
          : null,
        globalLoading: false,
      }))
      return novel.id
    } catch (e) {
      set({
        globalError: e instanceof ApiError ? e.message : '上传失败',
        globalLoading: false,
      })
      return null
    }
  },

  refreshNovel: async (novelId) => {
    if (!get().apiConnected) return
    try {
      const novel = await api.novels.get(novelId)
      set((state) => ({
        currentNovel: state.currentNovel?.id === novelId ? novel : state.currentNovel,
        novels: state.novels.map((n) => (n.id === novelId ? novel : n)),
      }))
    } catch (e) {
      set({ globalError: e instanceof ApiError ? e.message : '刷新小说状态失败' })
    }
  },

  deleteNovel: async (novelId) => {
    if (!get().novels.some((n) => n.id === novelId)) return false

    if (get().apiConnected) {
      try {
        await api.novels.delete(novelId)
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) {
          const serverNovels = await api.novels.list().catch(() => null)
          clearNovelSession(novelId)
          if (serverNovels) {
            if (!serverNovels.length) {
              set({
                novels: [],
                currentNovel: null,
                currentScreenplay: null,
                activeEpisodeId: null,
                selectedSchema: null,
                planConfirmed: false,
                adaptationPlan: mockAdaptationPlan,
                overviewData: null,
                episodesByScreenplay: {},
                conversationId: null,
                chatMessages: [],
                chatStreaming: null,
                chatStreamingTools: [],
                chatSending: false,
                chatReady: false,
                preprocessDone: false,
                globalError: null,
              })
              return true
            }
            set({ novels: serverNovels, globalError: null })
            if (!serverNovels.some((n) => n.id === get().currentNovel?.id)) {
              await get().switchNovel(serverNovels[0].id, { quiet: true })
            }
            return true
          }
        }
        set({ globalError: formatApiErrorMessage(e, '删除项目失败') })
        return false
      }
    }

    clearNovelSession(novelId)
    const remaining = get().novels.filter((n) => n.id !== novelId)
    const wasCurrent = get().currentNovel?.id === novelId

    if (wasCurrent) {
      get().stopPreprocessWs()
      get().disconnectChat()
    }

    if (!remaining.length) {
      set({
        novels: [],
        currentNovel: null,
        currentScreenplay: null,
        activeEpisodeId: null,
        selectedSchema: null,
        planConfirmed: false,
        adaptationPlan: mockAdaptationPlan,
        overviewData: null,
        episodesByScreenplay: {},
        conversationId: null,
        chatMessages: [],
        chatStreaming: null,
        chatStreamingTools: [],
        chatSending: false,
        chatReady: false,
        preprocessDone: false,
      })
      return true
    }

    set({ novels: remaining })
    if (wasCurrent) {
      await get().switchNovel(remaining[0].id, { quiet: true })
    }
    return true
  },

  startPreprocessWs: async () => {
    const novel = get().currentNovel
    if (!novel || !get().apiConnected) return
    if (progressWsConn && progressWsNovelId === novel.id) return

    get().stopPreprocessWs()

    let snapshot = createInitialProgressState()
    snapshot.detail = '加载进度…'
    try {
      const events = await api.novels.progress(novel.id)
      snapshot = reduceProgressEvents(
        events.map((ev) => ({
          id: ev.id,
          eventType: ev.eventType,
          payload: ev.payload,
        })),
      )
    } catch {
      snapshot.detail = '连接进度推送…'
    }

    set({
      preprocessStages: snapshot.stages,
      preprocessDetail: snapshot.detail || '等待预处理…',
      preprocessStageDetails: snapshot.stageDetails,
      preprocessLastEventId: snapshot.lastEventId,
      preprocessChapterProgress: snapshot.chapterProgress,
      preprocessDone: snapshot.done,
      currentNovel: snapshot.done
        ? novel.status !== 'ready_for_planning'
          ? { ...novel, status: 'ready_for_planning' }
          : novel
        : novel.status === 'uploaded'
          ? { ...novel, status: 'preprocessing' }
          : novel,
    })

    if (snapshot.done) {
      void get().refreshNovel(novel.id)
      return
    }

    progressWsNovelId = novel.id
    progressWsConn = connectNovelProgressWs(novel.id, {
      onOpen: () => set({ preprocessWsConnected: true }),
      onClose: () => {
        set({ preprocessWsConnected: false })
        progressWsNovelId = null
      },
      onProgress: (msg) => {
        get().applyPreprocessProgressEvent(msg.event_type, msg.payload ?? {}, msg.id)
      },
      onDone: () => {
        set((state) => ({
          preprocessDone: true,
          preprocessStages: state.preprocessStages.map(() => 'done' as StageUiState),
          preprocessDetail: '预处理完成',
          currentNovel: state.currentNovel
            ? { ...state.currentNovel, status: 'ready_for_planning' }
            : null,
        }))
        const novelId = get().currentNovel?.id
        if (novelId) void get().refreshNovel(novelId)
      },
    })
  },

  stopPreprocessWs: () => {
    progressWsConn?.close()
    progressWsConn = null
    progressWsNovelId = null
    set({ preprocessWsConnected: false })
  },

  applyPreprocessProgressEvent: (eventType, payload, eventId) => {
    set((state) => {
      const next = applyProgressEventState(
        {
          stages: state.preprocessStages,
          detail: state.preprocessDetail,
          lastEventId: state.preprocessLastEventId,
          done: state.preprocessDone,
          failed: false,
          chapterProgress: state.preprocessChapterProgress,
          stageDetails: state.preprocessStageDetails,
        },
        eventType,
        payload,
        eventId,
      )
      return {
        preprocessStages: next.stages,
        preprocessDetail: next.detail,
        preprocessStageDetails: next.stageDetails,
        preprocessLastEventId: next.lastEventId,
        preprocessChapterProgress: next.chapterProgress,
        preprocessDone: next.done || state.preprocessDone,
        currentNovel: state.currentNovel
          ? {
              ...state.currentNovel,
              status:
                next.done || eventType === 'preprocess_done'
                  ? 'ready_for_planning'
                  : eventType === 'preprocessing_failed'
                    ? 'preprocessing_failed'
                    : 'preprocessing',
            }
          : null,
      }
    })
  },

  setCurrentNovel: (n) => set({ currentNovel: n }),

  switchNovel: async (novelId, options) => {
    const quiet = options?.quiet ?? false
    get().stopPreprocessWs()
    get().disconnectChat()
    set({
      ...(quiet ? {} : { globalLoading: true }),
      globalError: null,
      conversationId: null,
      chatMessages: [],
      chatStreaming: null,
      chatStreamingTools: [],
      chatSending: false,
      chatReady: false,
    })
    try {
      if (get().apiConnected) {
        const novel = await api.novels.get(novelId)
        const session = loadNovelSession(novelId)
        const screenplays = await api.screenplays.listByNovel(novelId)
        const screenplay = resolveScreenplay(screenplays, session, session?.selectedSchema) ?? null
        let episodes: Episode[] = []
        if (screenplay) {
          episodes = await api.episodes.list(screenplay.id)
        }
        let plan = screenplay?.adaptationPlan ?? null
        if (!plan) {
          try {
            plan = await api.novels.adaptationPlan(novelId)
          } catch {
            plan = buildAdaptationPlan(
              novel.wordCount ? Math.ceil(novel.wordCount / 9000) : 80,
              36,
              novel.title,
            )
          }
        }
        episodes = enrichEpisodesFromPlan(episodes, plan)
        const activeEpisodeId =
          session?.activeEpisodeId && episodes.some((e) => e.id === session.activeEpisodeId)
            ? session.activeEpisodeId
            : episodes[0]?.id ?? null
        const restoredSchema = screenplay?.schemaType ?? session?.selectedSchema ?? null
        const planConfirmed = session?.planConfirmed ?? Boolean(screenplay)
        set((state) => ({
          currentNovel: novel,
          currentScreenplay: screenplay,
          selectedSchema: restoredSchema,
          planConfirmed,
          activeEpisodeId,
          adaptationPlan: plan,
          episodesByScreenplay: screenplay
            ? { ...state.episodesByScreenplay, [screenplay.id]: episodes }
            : state.episodesByScreenplay,
          globalLoading: false,
        }))
        saveNovelSession(novelId, {
          selectedSchema: restoredSchema,
          screenplayId: screenplay?.id ?? null,
          activeEpisodeId,
          planConfirmed,
        })
        setLastNovelId(novelId)
        return
      }

      const novel = get().novels.find((n) => n.id === novelId)
      if (!novel) {
        set({ globalError: '未找到该小说项目', globalLoading: false })
        return
      }
      await new Promise((r) => setTimeout(r, 300))
      const session = loadNovelSession(novelId)
      const novelScreenplays = mockScreenplays.filter((s) => s.novelId === novelId)
      const screenplay =
        resolveScreenplay(novelScreenplays, session, session?.selectedSchema) ??
        getScreenplayForNovel(novelId) ??
        null
      const episodes = screenplay ? get().episodesByScreenplay[screenplay.id] ?? [] : []
      const activeEpisodeId =
        session?.activeEpisodeId && episodes.some((e) => e.id === session.activeEpisodeId)
          ? session.activeEpisodeId
          : episodes[0]?.id ?? null
      const restoredSchema = screenplay?.schemaType ?? session?.selectedSchema ?? null
      const chapters = novel.wordCount ? Math.ceil(novel.wordCount / 9000) : 80
      set({
        currentNovel: novel,
        currentScreenplay: screenplay,
        selectedSchema: restoredSchema,
        planConfirmed: session?.planConfirmed ?? Boolean(screenplay),
        activeEpisodeId,
        adaptationPlan: buildAdaptationPlan(chapters, Math.min(36, chapters), novel.title),
        globalLoading: false,
      })
      saveNovelSession(novelId, {
        selectedSchema: restoredSchema,
        screenplayId: screenplay?.id ?? null,
        activeEpisodeId,
        planConfirmed: session?.planConfirmed ?? Boolean(screenplay),
      })
      setLastNovelId(novelId)
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : '加载项目失败'
      set({ globalError: msg, globalLoading: false })
    }
  },

  setSelectedSchema: (s) => {
    set({ selectedSchema: s })
    const novel = get().currentNovel
    if (novel) saveNovelSession(novel.id, { selectedSchema: s })
  },
  setAdaptationPlan: (p) => set({ adaptationPlan: p, planConfirmed: false }),
  confirmPlan: async () => {
    const { currentNovel, selectedSchema, adaptationPlan, apiConnected } = get()
    if (!selectedSchema || selectedSchema === 'overview') {
      set({ planConfirmed: true })
      return
    }
    if (!apiConnected || !currentNovel || !adaptationPlan) {
      set({ planConfirmed: true })
      return
    }
    set({ globalLoading: true, globalError: null })
    try {
      const payload = toAdaptationPlanPayload(
        adaptationPlan,
        currentNovel.id,
        currentNovel.title,
      )
      const existingScreenplays = await api.screenplays.listByNovel(currentNovel.id)
      const existing = existingScreenplays.find(
        (s) => s.schemaType === selectedSchema && !s.isAutoGenerated,
      )
      const screenplay =
        existing ??
        (await api.screenplays.create({
          novelId: currentNovel.id,
          schemaType: selectedSchema,
          title: `${currentNovel.title} · 剧本`,
          adaptationPlan: payload,
        }))
      const planResolved = screenplay.adaptationPlan ?? adaptationPlan
      const episodes = enrichEpisodesFromPlan(
        await api.episodes.list(screenplay.id),
        planResolved,
      )
      set((state) => ({
        planConfirmed: true,
        currentScreenplay: screenplay,
        adaptationPlan: planResolved,
        episodesByScreenplay: {
          ...state.episodesByScreenplay,
          [screenplay.id]: episodes,
        },
        activeEpisodeId: episodes[0]?.id ?? null,
        globalLoading: false,
      }))
      saveNovelSession(currentNovel.id, {
        selectedSchema,
        screenplayId: screenplay.id,
        activeEpisodeId: episodes[0]?.id ?? null,
        planConfirmed: true,
      })
      setLastNovelId(currentNovel.id)
    } catch (e) {
      set({
        globalError: e instanceof ApiError ? e.message : '创建剧本失败',
        globalLoading: false,
      })
      throw e
    }
  },
  resetPlanFlow: () => {
    const novel = get().currentNovel
    if (novel) clearNovelSession(novel.id)
    set({
      selectedSchema: null,
      adaptationPlan: novel
        ? buildAdaptationPlan(80, 36, novel.title)
        : mockAdaptationPlan,
      planConfirmed: false,
    })
  },

  fetchAdaptationPlan: async (chaptersPerEpisode = 2) => {
    const novel = get().currentNovel
    if (!novel) return
    if (get().apiConnected) {
      try {
        const plan = await api.novels.adaptationPlan(novel.id, { chapters_per_episode: chaptersPerEpisode })
        set({ adaptationPlan: plan })
        return
      } catch (e) {
        set({ globalError: e instanceof ApiError ? e.message : '获取改编方案失败' })
      }
    }
    const chapters = novel.wordCount ? Math.ceil(novel.wordCount / 9000) : 80
    const epCount = Math.max(1, Math.ceil(chapters / chaptersPerEpisode))
    set({ adaptationPlan: buildAdaptationPlan(chapters, epCount, novel.title) })
  },

  loadOverview: async () => {
    const novel = get().currentNovel
    if (!novel) {
      set({ overviewData: null })
      return
    }
    set({ overviewLoading: true })
    try {
      if (get().apiConnected) {
        const screenplays = await api.screenplays.listByNovel(novel.id)
        const overviewSp = screenplays.find((s) => s.schemaType === 'overview')
        if (overviewSp) {
          const episodes = await api.episodes.list(overviewSp.id)
          const doc = episodes[0]?.content as unknown as Record<string, unknown> | undefined
          set({
            overviewData: mapOverviewDocument(doc, overviewSp.adaptationPlan),
          })
          return
        }
        const chapters = await api.novels.chapters.list(novel.id)
        set({ overviewData: buildOverviewFallback(novel, chapters) })
        return
      }

      const overviewSp = getOverviewScreenplay(novel.id)
      if (overviewSp) {
        const episodes = get().episodesByScreenplay[overviewSp.id] ?? []
        const doc = episodes[0]?.content as Record<string, unknown> | undefined
        set({
          overviewData: mapOverviewDocument(doc, overviewSp.adaptationPlan),
        })
        return
      }
      set({
        overviewData: buildOverviewFallback(
          novel,
          [],
        ),
      })
    } catch (e) {
      set({ globalError: e instanceof ApiError ? e.message : '加载概览版失败' })
    } finally {
      set({ overviewLoading: false })
    }
  },

  setActiveEpisode: (id) => {
    set({ activeEpisodeId: id })
    const novel = get().currentNovel
    if (novel) saveNovelSession(novel.id, { activeEpisodeId: id })
  },

  getActiveEpisode: () => {
    const { activeEpisodeId, currentScreenplay, episodesByScreenplay } = get()
    if (!activeEpisodeId || !currentScreenplay) return undefined
    return episodesByScreenplay[currentScreenplay.id]?.find((e) => e.id === activeEpisodeId)
  },

  getEpisodes: () => {
    const { currentScreenplay, episodesByScreenplay } = get()
    if (!currentScreenplay) return []
    return episodesByScreenplay[currentScreenplay.id] ?? []
  },

  getEpisodeBlocker: (episodeId) => {
    const episodes = get().getEpisodes()
    const target = episodes.find((e) => e.id === episodeId)
    if (!target) return null
    // 剧集顺序依赖：每集依据前一集累积的剧情记忆（screenplay_memory）生成，
    // 因此所有更早的剧集必须已 done 才能生成本集。
    const blocker = episodes
      .filter((e) => e.episodeNum < target.episodeNum && e.status !== 'done')
      .sort((a, b) => a.episodeNum - b.episodeNum)[0]
    return blocker ? blocker.episodeNum : null
  },

  updateScene: (episodeId, sceneId, patch) => {
    set((state) => {
      const screenplayId = state.currentScreenplay?.id
      if (!screenplayId) return state
      return {
        ...state,
        ...patchEpisodes(state, screenplayId, episodeId, (ep) => ({
          ...ep,
          content: {
            scenes: (ep.content.scenes ?? []).map((s) => (s.id === sceneId ? { ...s, ...patch } : s)),
          },
        })),
      }
    })
  },

  updateDialogue: (episodeId, sceneId, dialogueId, patch) => {
    set((state) => {
      const screenplayId = state.currentScreenplay?.id
      if (!screenplayId) return state
      return {
        ...state,
        ...patchEpisodes(state, screenplayId, episodeId, (ep) => ({
          ...ep,
          content: {
            scenes: (ep.content.scenes ?? []).map((s) =>
              s.id !== sceneId
                ? s
                : {
                    ...s,
                    dialogues: s.dialogues.map((d) =>
                      d.id === dialogueId ? { ...d, ...patch } : d,
                    ),
                  },
            ),
          },
        })),
      }
    })
  },

  updateEpisodeContent: (episodeId, content) => {
    set((state) => {
      const screenplayId = state.currentScreenplay?.id
      if (!screenplayId) return state
      return {
        ...state,
        ...patchEpisodes(state, screenplayId, episodeId, (ep) => ({ ...ep, content })),
      }
    })
  },

  addScene: (episodeId) => {
    set((state) => {
      const screenplayId = state.currentScreenplay?.id
      if (!screenplayId) return state
      const schema =
        state.currentScreenplay?.schemaType ?? state.selectedSchema ?? 'screenwriter'
      const isAiVideo = schema === 'ai_video'
      const newScene: Scene = isAiVideo
        ? {
            id: newCanvasId('scene'),
            heading: '',
            action: '',
            dialogues: [],
            shots: [
              {
                id: newCanvasId('shot'),
                dialogues: [],
                emotions: [],
              },
            ],
            raw: {},
          }
        : {
            id: newCanvasId('scene'),
            heading: '',
            action: '',
            dialogues: [],
          }
      return {
        ...state,
        ...patchEpisodes(state, screenplayId, episodeId, (ep) => ({
          ...ep,
          content: { scenes: [...(ep.content.scenes ?? []), newScene] },
        })),
      }
    })
  },

  removeScene: (episodeId, sceneId) => {
    set((state) => {
      const screenplayId = state.currentScreenplay?.id
      if (!screenplayId) return state
      return {
        ...state,
        ...patchEpisodes(state, screenplayId, episodeId, (ep) => ({
          ...ep,
          content: { scenes: (ep.content.scenes ?? []).filter((s) => s.id !== sceneId) },
        })),
      }
    })
  },

  addDialogue: (episodeId, sceneId) => {
    set((state) => {
      const screenplayId = state.currentScreenplay?.id
      if (!screenplayId) return state
      const newDialogue: SceneDialogue = {
        id: `dlg_${Date.now().toString(36)}`,
        character: '',
        line: '',
      }
      return {
        ...state,
        ...patchEpisodes(state, screenplayId, episodeId, (ep) => ({
          ...ep,
          content: {
            scenes: (ep.content.scenes ?? []).map((s) =>
              s.id === sceneId ? { ...s, dialogues: [...s.dialogues, newDialogue] } : s,
            ),
          },
        })),
      }
    })
  },

  removeDialogue: (episodeId, sceneId, dialogueId) => {
    set((state) => {
      const screenplayId = state.currentScreenplay?.id
      if (!screenplayId) return state
      return {
        ...state,
        ...patchEpisodes(state, screenplayId, episodeId, (ep) => ({
          ...ep,
          content: {
            scenes: (ep.content.scenes ?? []).map((s) =>
              s.id === sceneId
                ? { ...s, dialogues: s.dialogues.filter((d) => d.id !== dialogueId) }
                : s,
            ),
          },
        })),
      }
    })
  },

  updateShot: (episodeId, sceneId, shotId, patch) => {
    set((state) => {
      const screenplayId = state.currentScreenplay?.id
      if (!screenplayId) return state
      return {
        ...state,
        ...patchEpisodes(state, screenplayId, episodeId, (ep) => ({
          ...ep,
          content: {
            scenes: (ep.content.scenes ?? []).map((s) =>
              s.id !== sceneId
                ? s
                : {
                    ...s,
                    shots: (s.shots ?? []).map((sh) =>
                      sh.id === shotId ? { ...sh, ...patch } : sh,
                    ),
                  },
            ),
          },
        })),
      }
    })
  },

  addShot: (episodeId, sceneId) => {
    set((state) => {
      const screenplayId = state.currentScreenplay?.id
      if (!screenplayId) return state
      const newShot: Shot = {
        id: newCanvasId('shot'),
        dialogues: [],
        emotions: [],
      }
      return {
        ...state,
        ...patchEpisodes(state, screenplayId, episodeId, (ep) => ({
          ...ep,
          content: {
            scenes: (ep.content.scenes ?? []).map((s) =>
              s.id === sceneId ? { ...s, shots: [...(s.shots ?? []), newShot] } : s,
            ),
          },
        })),
      }
    })
  },

  removeShot: (episodeId, sceneId, shotId) => {
    set((state) => {
      const screenplayId = state.currentScreenplay?.id
      if (!screenplayId) return state
      return {
        ...state,
        ...patchEpisodes(state, screenplayId, episodeId, (ep) => ({
          ...ep,
          content: {
            scenes: (ep.content.scenes ?? []).map((s) =>
              s.id === sceneId
                ? { ...s, shots: (s.shots ?? []).filter((sh) => sh.id !== shotId) }
                : s,
            ),
          },
        })),
      }
    })
  },

  updateShotDialogue: (episodeId, sceneId, shotId, dialogueId, patch) => {
    set((state) => {
      const screenplayId = state.currentScreenplay?.id
      if (!screenplayId) return state
      return {
        ...state,
        ...patchEpisodes(state, screenplayId, episodeId, (ep) => ({
          ...ep,
          content: {
            scenes: (ep.content.scenes ?? []).map((s) =>
              s.id !== sceneId
                ? s
                : {
                    ...s,
                    shots: (s.shots ?? []).map((sh) =>
                      sh.id !== shotId
                        ? sh
                        : {
                            ...sh,
                            dialogues: sh.dialogues.map((d) =>
                              d.id === dialogueId ? { ...d, ...patch } : d,
                            ),
                          },
                    ),
                  },
            ),
          },
        })),
      }
    })
  },

  addShotDialogue: (episodeId, sceneId, shotId) => {
    set((state) => {
      const screenplayId = state.currentScreenplay?.id
      if (!screenplayId) return state
      const newDialogue: ShotDialogue = {
        id: newCanvasId('shotdlg'),
        character: '',
        line: '',
      }
      return {
        ...state,
        ...patchEpisodes(state, screenplayId, episodeId, (ep) => ({
          ...ep,
          content: {
            scenes: (ep.content.scenes ?? []).map((s) =>
              s.id !== sceneId
                ? s
                : {
                    ...s,
                    shots: (s.shots ?? []).map((sh) =>
                      sh.id === shotId
                        ? { ...sh, dialogues: [...sh.dialogues, newDialogue] }
                        : sh,
                    ),
                  },
            ),
          },
        })),
      }
    })
  },

  removeShotDialogue: (episodeId, sceneId, shotId, dialogueId) => {
    set((state) => {
      const screenplayId = state.currentScreenplay?.id
      if (!screenplayId) return state
      return {
        ...state,
        ...patchEpisodes(state, screenplayId, episodeId, (ep) => ({
          ...ep,
          content: {
            scenes: (ep.content.scenes ?? []).map((s) =>
              s.id !== sceneId
                ? s
                : {
                    ...s,
                    shots: (s.shots ?? []).map((sh) =>
                      sh.id === shotId
                        ? {
                            ...sh,
                            dialogues: sh.dialogues.filter((d) => d.id !== dialogueId),
                          }
                        : sh,
                    ),
                  },
            ),
          },
        })),
      }
    })
  },

  saveActiveEpisode: async () => {
    const episode = get().getActiveEpisode()
    if (!episode || !get().apiConnected) return
    try {
      const payload = toEpisodeContentPayload(episode.content)
      const updated = await api.episodes.update(episode.id, { content: payload })
      const screenplayId = get().currentScreenplay?.id
      if (screenplayId) {
        set((state) => ({
          episodesByScreenplay: {
            ...state.episodesByScreenplay,
            [screenplayId]: (state.episodesByScreenplay[screenplayId] ?? []).map((e) =>
              e.id === updated.id ? updated : e,
            ),
          },
        }))
      }
      const novel = get().currentNovel
      const screenplay = get().currentScreenplay
      if (novel && screenplay) {
        saveNovelSession(novel.id, {
          screenplayId: screenplay.id,
          selectedSchema: screenplay.schemaType,
          activeEpisodeId: episode.id,
          planConfirmed: true,
        })
        setLastNovelId(novel.id)
      }
    } catch (e) {
      set({ globalError: e instanceof ApiError ? e.message : '保存集内容失败' })
    }
  },

  generateEpisode: async (episodeId) => {
    const screenplayId = get().currentScreenplay?.id
    if (!screenplayId || !get().apiConnected) return
    // Skip if this episode is already being generated (avoids a double request
    // when click-to-generate races the batch loop).
    const existing = (get().episodesByScreenplay[screenplayId] ?? []).find(
      (e) => e.id === episodeId,
    )
    if (existing?.status === 'generating') return
    // 剧集顺序依赖：前序集未生成完时不能启动本集，否则 agent 读到的剧情记忆
    // 缺少前一集，生成结果不连贯。
    const blockerNum = get().getEpisodeBlocker(episodeId)
    if (blockerNum !== null) {
      set({
        globalError: `第 ${existing?.episodeNum} 集需在第 ${blockerNum} 集生成完成后才能生成（剧集按顺序依赖前文）`,
      })
      return
    }

    const patchEpisode = (updater: (ep: Episode) => Episode) =>
      set((state) => ({
        episodesByScreenplay: {
          ...state.episodesByScreenplay,
          [screenplayId]: (state.episodesByScreenplay[screenplayId] ?? []).map((e) =>
            e.id === episodeId ? updater(e) : e,
          ),
        },
      }))

    patchEpisode((e) => ({ ...e, status: 'generating' }))
    // 实时展示 agent 执行过程：清空本集旧步骤，并订阅小说进度推送，过滤出本集的
    // agent_episode_step 事件。生成是同步阻塞请求，必须在 await 之前开好这条并发
    // 连接才能边生成边看到步骤。
    set((state) => ({
      agentStepsByEpisode: { ...state.agentStepsByEpisode, [episodeId]: [] },
    }))
    const novelId = get().currentNovel?.id
    let stepWs: { close: () => void } | null = null
    if (novelId) {
      // 基线：忽略 WS 重放的历史事件（含本集上一次生成的旧步骤）。
      let sinceId = 0
      try {
        const prior = await api.novels.progress(novelId)
        sinceId = prior.reduce((m, e) => Math.max(m, e.id), 0)
      } catch {
        sinceId = 0
      }
      stepWs = connectNovelProgressWs(novelId, {
        onProgress: (msg) => {
          if (msg.id <= sinceId || msg.event_type !== 'agent_episode_step') return
          const p = msg.payload as {
            episode_id?: string
            step_index?: number
            phase?: string
            label?: string
            tools?: string[]
          }
          if (p.episode_id !== episodeId) return
          set((state) => {
            const prev = state.agentStepsByEpisode[episodeId] ?? []
            const step: AgentStep = {
              stepIndex: Number(p.step_index ?? prev.length + 1),
              phase: String(p.phase ?? ''),
              label: String(p.label ?? ''),
              tools: Array.isArray(p.tools) ? p.tools : [],
            }
            return {
              agentStepsByEpisode: {
                ...state.agentStepsByEpisode,
                [episodeId]: [...prev, step],
              },
            }
          })
        },
      })
    }
    try {
      await api.episodes.generate(episodeId)
      // Backend may run generation async (Celery) or inline; poll the episode
      // until it leaves the `generating` state, then store the final content.
      const deadline = Date.now() + 5 * 60 * 1000
      let finalEpisode: Episode | null = null
      for (;;) {
        await new Promise((r) => setTimeout(r, 1500))
        const ep = await api.episodes.get(episodeId)
        if (ep.status !== 'generating' || Date.now() > deadline) {
          finalEpisode = ep
          break
        }
      }
      if (finalEpisode) {
        const ep = finalEpisode
        patchEpisode(() => ep)
        if (ep.status === 'failed') {
          set({
            globalError: ep.errorMessage
              ? `第 ${ep.episodeNum} 集生成失败：${ep.errorMessage}`
              : `第 ${ep.episodeNum} 集生成失败，请检查改编方案后重试`,
          })
        }
      }
    } catch (e) {
      patchEpisode((ep) => ({ ...ep, status: 'failed' }))
      set({ globalError: e instanceof ApiError ? e.message : '生成本集失败' })
    } finally {
      stepWs?.close()
    }
  },

  resetEpisode: async (episodeId) => {
    const screenplayId = get().currentScreenplay?.id
    if (!screenplayId || !get().apiConnected) return
    try {
      const ep = await api.episodes.reset(episodeId)
      // 复位后清掉这集残留的执行步骤，并写回后端返回的 pending 状态。
      set((state) => ({
        agentStepsByEpisode: { ...state.agentStepsByEpisode, [episodeId]: [] },
        episodesByScreenplay: {
          ...state.episodesByScreenplay,
          [screenplayId]: (state.episodesByScreenplay[screenplayId] ?? []).map((e) =>
            e.id === episodeId ? ep : e,
          ),
        },
      }))
    } catch (e) {
      set({ globalError: e instanceof ApiError ? e.message : '重置本集失败' })
    }
  },

  generateAllEpisodes: async () => {
    const screenplayId = get().currentScreenplay?.id
    if (!screenplayId || !get().apiConnected || get().generatingAll) return
    set({ generatingAll: true })
    try {
      // Snapshot the not-yet-generated episodes, then run sequentially to stay
      // within LLM rate limits.
      const pending = (get().episodesByScreenplay[screenplayId] ?? []).filter(
        (e) => e.status === 'pending' || e.status === 'failed',
      )
      for (const ep of pending) {
        await get().generateEpisode(ep.id)
        // 顺序依赖：本集未成功 done 时停止，避免后续集基于缺失的前文生成。
        const updated = (get().episodesByScreenplay[screenplayId] ?? []).find(
          (e) => e.id === ep.id,
        )
        if (updated?.status !== 'done') break
      }
    } finally {
      set({ generatingAll: false })
    }
  },

  setGlobalLoading: (v) => set({ globalLoading: v }),
  setGlobalError: (msg) => set({ globalError: msg }),
  clearError: () => set({ globalError: null }),
  setExportDialogOpen: (open) => set({ exportDialogOpen: open }),

  requestExport: async (format) => {
    const { currentScreenplay, currentNovel, apiConnected } = get()
    const label = format === 'yaml' ? 'YAML' : format === 'pdf' ? 'PDF' : 'ZIP'

    if (!currentNovel) {
      return { ok: false, message: '请先选择小说项目' }
    }
    if (!currentScreenplay) {
      return {
        ok: false,
        message: '尚未创建剧本：请先在「改编方案」确认方案，或完成预处理后再导出',
      }
    }

    if (apiConnected) {
      try {
        await get().saveActiveEpisode()
        let job = await api.exports.create(currentScreenplay.id, format)
        if (job.status === 'pending' || job.status === 'running') {
          job = await api.exports.waitUntilReady(job.id)
        }
        if (job.status === 'failed') {
          return {
            ok: false,
            message: job.errorMessage ?? `${label} 导出失败，请稍后重试`,
          }
        }
        if (job.status !== 'done') {
          return {
            ok: false,
            message: `${label} 导出超时：任务仍在排队，请确认 Celery worker 已启动后重试`,
          }
        }
        return {
          ok: true,
          message: `《${currentNovel.title}》${label} 已生成，点击下方链接下载`,
          downloadUrl: api.exports.downloadUrl(job.id),
          jobId: job.id,
        }
      } catch (e) {
        return { ok: false, message: e instanceof ApiError ? e.message : '导出失败' }
      }
    }

    await new Promise((r) => setTimeout(r, 800))
    return {
      ok: true,
      message: `《${currentNovel.title}》${label} 导出任务已创建（mock · 需连接后端）`,
    }
  },

  ensureChatSession: async () => {
    if (!get().apiConnected) {
      set({ chatReady: true })
      return
    }
    const { currentNovel, currentScreenplay, conversationId } = get()
    if (!currentNovel || !currentScreenplay) return

    let convId = conversationId
    if (!convId) {
      const conv = await api.conversations.create({
        novelId: currentNovel.id,
        screenplayId: currentScreenplay.id,
        title: `《${currentNovel.title}》编辑对话`,
      })
      convId = conv.id
      const history = await api.conversations.messages(convId)
      set({
        conversationId: convId,
        chatMessages: history
          .filter((m) => m.role === 'user' || m.role === 'assistant')
          .map((m) => ({
            id: m.id,
            role: m.role as 'user' | 'assistant',
            content: m.content ?? '',
            toolCalls: m.toolCalls,
          })),
      })
    }

    chatWsConn?.close()
    chatWsConn = connectConversationWs(convId, {
      onMessage: (msg) => get().handleChatWsMessage(msg),
      onOpen: () => set({ chatReady: true }),
      onClose: () => set({ chatReady: false }),
    })
  },

  disconnectChat: () => {
    chatWsConn?.close()
    chatWsConn = null
    set({ chatReady: false })
  },

  handleChatWsMessage: (msg) => {
    switch (msg.type) {
      case 'content_delta':
        set((s) => ({ chatStreaming: (s.chatStreaming ?? '') + msg.text }))
        break
      case 'tool_call':
        set((s) => ({
          chatStreamingTools: [
            ...s.chatStreamingTools,
            {
              name: msg.name ?? msg.tool ?? 'tool',
              args: msg.args ?? '',
              status: 'running',
            },
          ],
        }))
        break
      case 'message_end': {
        const { chatStreaming, chatStreamingTools } = get()
        if (chatStreaming) {
          set((s) => ({
            chatMessages: [
              ...s.chatMessages,
              {
                id: `asst_${Date.now()}`,
                role: 'assistant' as const,
                content: chatStreaming,
                toolCalls: chatStreamingTools.length
                  ? chatStreamingTools.map((t) => ({ ...t, status: 'success' as const }))
                  : undefined,
              },
            ],
            chatStreaming: null,
            chatStreamingTools: [],
            chatSending: false,
          }))
        } else {
          set({ chatSending: false })
        }
        void get().refreshActiveEpisode()
        break
      }
      case 'error':
        set({
          globalError: msg.error,
          chatSending: false,
          chatStreaming: null,
          chatStreamingTools: [],
        })
        break
    }
  },

  sendChatMessage: async (content) => {
    const trimmed = content.trim()
    if (!trimmed || get().chatSending) return
    set((s) => ({
      chatMessages: [
        ...s.chatMessages,
        { id: `user_${Date.now()}`, role: 'user', content: trimmed },
      ],
      chatSending: true,
      chatStreaming: null,
      chatStreamingTools: [],
    }))
    if (!get().apiConnected) {
      await new Promise((r) => setTimeout(r, 500))
      set((s) => ({
        chatMessages: [
          ...s.chatMessages,
          {
            id: `mock_${Date.now()}`,
            role: 'assistant',
            content: `（mock）已收到：${trimmed}`,
          },
        ],
        chatSending: false,
      }))
      return
    }
    try {
      await get().ensureChatSession()
      chatWsConn?.send({ type: 'message', content: trimmed })
    } catch (e) {
      set({
        globalError: e instanceof ApiError ? e.message : '发送消息失败',
        chatSending: false,
      })
    }
  },

  refreshActiveEpisode: async () => {
    const ep = get().getActiveEpisode()
    const screenplayId = get().currentScreenplay?.id
    if (!ep || !screenplayId || !get().apiConnected) return
    try {
      const updated = await api.episodes.get(ep.id)
      set((state) => ({
        episodesByScreenplay: {
          ...state.episodesByScreenplay,
          [screenplayId]: (state.episodesByScreenplay[screenplayId] ?? []).map((e) =>
            e.id === updated.id ? updated : e,
          ),
        },
      }))
    } catch {
      /* ignore refresh errors */
    }
  },
}))
