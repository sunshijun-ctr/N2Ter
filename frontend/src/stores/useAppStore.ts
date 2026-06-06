import { create } from 'zustand'
import { api, ApiError } from '@/api/client'
import { connectConversationWs, connectNovelProgressWs } from '@/api/websocket'
import type {
  AdaptationPlan,
  ChatMessage,
  Episode,
  EpisodeContent,
  ExportFormat,
  Novel,
  Scene,
  SceneDialogue,
  SchemaType,
  Screenplay,
  ToolCall,
  WsServerMessage,
} from '@/lib/types'
import {
  mockAdaptationPlan,
  mockEpisodesByScreenplay,
  mockNovels,
  getScreenplayForNovel,
} from '@/lib/mock'
import { buildAdaptationPlan } from '@/lib/adaptation'
import {
  applyProgressEvent,
  formatProgressDetail,
  initialPreprocessStages,
  type StageUiState,
} from '@/lib/preprocess-stages'
import {
  pickScreenplay,
  toAdaptationPlanPayload,
  toEpisodeContentPayload,
} from '@/lib/mappers'

let chatWsConn: ReturnType<typeof connectConversationWs> | null = null
let progressWsConn: ReturnType<typeof connectNovelProgressWs> | null = null

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

  selectedSchema: SchemaType | null
  adaptationPlan: AdaptationPlan | null
  planConfirmed: boolean

  globalLoading: boolean
  globalError: string | null
  exportDialogOpen: boolean
  apiConnected: boolean

  preprocessStages: StageUiState[]
  preprocessDetail: string
  preprocessWsConnected: boolean
  preprocessDone: boolean

  conversationId: string | null
  chatMessages: ChatMessage[]
  chatStreaming: string | null
  chatStreamingTools: ToolCall[]
  chatSending: boolean
  chatReady: boolean

  hydrateFromApi: () => Promise<void>
  uploadAndPreprocess: (file: File, genres: string[]) => Promise<string | null>
  refreshNovel: (novelId: string) => Promise<void>
  startPreprocessWs: () => void
  stopPreprocessWs: () => void
  applyPreprocessProgressEvent: (eventType: string, payload: Record<string, unknown>) => void

  setCurrentNovel: (n: Novel | null) => void
  switchNovel: (novelId: string) => Promise<void>
  setSelectedSchema: (s: SchemaType | null) => void
  setAdaptationPlan: (p: AdaptationPlan | null) => void
  confirmPlan: () => Promise<void>
  resetPlanFlow: () => void
  fetchAdaptationPlan: (chaptersPerEpisode?: number) => Promise<void>

  setActiveEpisode: (id: string) => void
  getActiveEpisode: () => Episode | undefined
  getEpisodes: () => Episode[]

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
  saveActiveEpisode: () => Promise<void>

  ensureChatSession: () => Promise<void>
  disconnectChat: () => void
  sendChatMessage: (content: string) => Promise<void>
  refreshActiveEpisode: () => Promise<void>
  handleChatWsMessage: (msg: WsServerMessage) => void

  setGlobalLoading: (v: boolean) => void
  setGlobalError: (msg: string | null) => void
  clearError: () => void
  setExportDialogOpen: (open: boolean) => void
  requestExport: (format: ExportFormat) => Promise<{ ok: boolean; message: string }>
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

  selectedSchema: 'screenwriter',
  adaptationPlan: initialScreenplay?.adaptationPlan ?? mockAdaptationPlan,
  planConfirmed: false,

  globalLoading: false,
  globalError: null,
  exportDialogOpen: false,
  apiConnected: false,

  preprocessStages: initialPreprocessStages(),
  preprocessDetail: '',
  preprocessWsConnected: false,
  preprocessDone: false,

  conversationId: null,
  chatMessages: [],
  chatStreaming: null,
  chatStreamingTools: [],
  chatSending: false,
  chatReady: false,

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
      const validId = novels.some((n) => n.id === currentId) ? currentId! : novels[0].id
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

  startPreprocessWs: () => {
    const novel = get().currentNovel
    if (!novel || !get().apiConnected) return
    get().stopPreprocessWs()
    set({
      preprocessStages: initialPreprocessStages(),
      preprocessDetail: '连接进度推送…',
      preprocessDone: false,
    })
    progressWsConn = connectNovelProgressWs(novel.id, {
      onOpen: () => set({ preprocessWsConnected: true }),
      onClose: () => set({ preprocessWsConnected: false }),
      onProgress: (msg) => {
        get().applyPreprocessProgressEvent(msg.event_type, msg.payload ?? {})
      },
      onDone: () => {
        set({ preprocessDone: true })
        const novelId = get().currentNovel?.id
        if (novelId) void get().refreshNovel(novelId)
      },
    })
  },

  stopPreprocessWs: () => {
    progressWsConn?.close()
    progressWsConn = null
    set({ preprocessWsConnected: false })
  },

  applyPreprocessProgressEvent: (eventType, payload) => {
    set((state) => ({
      preprocessStages: applyProgressEvent(state.preprocessStages, eventType),
      preprocessDetail: formatProgressDetail(eventType, payload),
      currentNovel: state.currentNovel
        ? {
            ...state.currentNovel,
            status:
              eventType === 'preprocess_done'
                ? 'ready_for_planning'
                : eventType === 'preprocessing_failed'
                  ? 'preprocessing_failed'
                  : 'preprocessing',
          }
        : null,
    }))
  },

  setCurrentNovel: (n) => set({ currentNovel: n }),

  switchNovel: async (novelId) => {
    get().stopPreprocessWs()
    get().disconnectChat()
    set({
      globalLoading: true,
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
        const screenplays = await api.screenplays.listByNovel(novelId)
        const screenplay = pickScreenplay(screenplays, get().selectedSchema) ?? null
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
        set((state) => ({
          currentNovel: novel,
          currentScreenplay: screenplay,
          activeEpisodeId: episodes[0]?.id ?? null,
          adaptationPlan: plan,
          episodesByScreenplay: screenplay
            ? { ...state.episodesByScreenplay, [screenplay.id]: episodes }
            : state.episodesByScreenplay,
          globalLoading: false,
        }))
        return
      }

      const novel = get().novels.find((n) => n.id === novelId)
      if (!novel) {
        set({ globalError: '未找到该小说项目', globalLoading: false })
        return
      }
      await new Promise((r) => setTimeout(r, 300))
      const screenplay = getScreenplayForNovel(novelId) ?? null
      const episodes = screenplay ? get().episodesByScreenplay[screenplay.id] ?? [] : []
      const chapters = novel.wordCount ? Math.ceil(novel.wordCount / 9000) : 80
      set({
        currentNovel: novel,
        currentScreenplay: screenplay,
        activeEpisodeId: episodes[0]?.id ?? null,
        adaptationPlan: buildAdaptationPlan(chapters, Math.min(36, chapters), novel.title),
        globalLoading: false,
      })
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : '加载项目失败'
      set({ globalError: msg, globalLoading: false })
    }
  },

  setSelectedSchema: (s) => set({ selectedSchema: s }),
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
      const screenplay = await api.screenplays.create({
        novelId: currentNovel.id,
        schemaType: selectedSchema,
        title: `${currentNovel.title} · 剧本`,
        adaptationPlan: payload,
      })
      const episodes = await api.episodes.list(screenplay.id)
      set((state) => ({
        planConfirmed: true,
        currentScreenplay: screenplay,
        adaptationPlan: screenplay.adaptationPlan ?? adaptationPlan,
        episodesByScreenplay: {
          ...state.episodesByScreenplay,
          [screenplay.id]: episodes,
        },
        activeEpisodeId: episodes[0]?.id ?? null,
        globalLoading: false,
      }))
    } catch (e) {
      set({
        globalError: e instanceof ApiError ? e.message : '创建剧本失败',
        globalLoading: false,
      })
      throw e
    }
  },
  resetPlanFlow: () =>
    set({
      selectedSchema: null,
      adaptationPlan: get().currentNovel
        ? buildAdaptationPlan(80, 36, get().currentNovel!.title)
        : mockAdaptationPlan,
      planConfirmed: false,
    }),

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

  setActiveEpisode: (id) => set({ activeEpisodeId: id }),

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

  updateScene: (episodeId, sceneId, patch) => {
    set((state) => {
      const screenplayId = state.currentScreenplay?.id
      if (!screenplayId) return state
      return {
        ...state,
        ...patchEpisodes(state, screenplayId, episodeId, (ep) => ({
          ...ep,
          content: {
            scenes: ep.content.scenes.map((s) => (s.id === sceneId ? { ...s, ...patch } : s)),
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
            scenes: ep.content.scenes.map((s) =>
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
      const newScene: Scene = {
        id: `scene_${Date.now().toString(36)}`,
        heading: '',
        action: '',
        dialogues: [],
      }
      return {
        ...state,
        ...patchEpisodes(state, screenplayId, episodeId, (ep) => ({
          ...ep,
          content: { scenes: [...ep.content.scenes, newScene] },
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
          content: { scenes: ep.content.scenes.filter((s) => s.id !== sceneId) },
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
            scenes: ep.content.scenes.map((s) =>
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
            scenes: ep.content.scenes.map((s) =>
              s.id === sceneId
                ? { ...s, dialogues: s.dialogues.filter((d) => d.id !== dialogueId) }
                : s,
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
    } catch (e) {
      set({ globalError: e instanceof ApiError ? e.message : '保存集内容失败' })
    }
  },

  setGlobalLoading: (v) => set({ globalLoading: v }),
  setGlobalError: (msg) => set({ globalError: msg }),
  clearError: () => set({ globalError: null }),
  setExportDialogOpen: (open) => set({ exportDialogOpen: open }),

  requestExport: async (format) => {
    const { currentScreenplay, currentNovel, apiConnected } = get()
    if (!currentScreenplay || !currentNovel) {
      return { ok: false, message: '请先选择小说项目' }
    }
    set({ globalLoading: true })
    try {
      if (apiConnected) {
        const job = await api.exports.create(currentScreenplay.id, format)
        set({ globalLoading: false, exportDialogOpen: false })
        const label = format === 'yaml' ? 'YAML' : format === 'pdf' ? 'PDF' : 'ZIP'
        if (job.status === 'failed') {
          return { ok: false, message: `导出失败（${label}）` }
        }
        const hint = job.fileUrl ? ` 文件：${job.fileUrl}` : ''
        return { ok: true, message: `《${currentNovel.title}》${label} 导出完成。${hint}` }
      }
    } catch (e) {
      set({ globalLoading: false })
      return { ok: false, message: e instanceof ApiError ? e.message : '导出失败' }
    }
    await new Promise((r) => setTimeout(r, 800))
    set({ globalLoading: false, exportDialogOpen: false })
    const label = format === 'yaml' ? 'YAML' : format === 'pdf' ? 'PDF' : 'ZIP 打包'
    return { ok: true, message: `《${currentNovel.title}》${label} 导出任务已创建（mock）` }
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
