import { create } from 'zustand'
import type {
  AdaptationPlan,
  Episode,
  EpisodeContent,
  ExportFormat,
  Novel,
  Scene,
  SceneDialogue,
  SchemaType,
  Screenplay,
} from '@/lib/types'
import {
  mockAdaptationPlan,
  mockEpisodesByScreenplay,
  mockNovels,
  getScreenplayForNovel,
} from '@/lib/mock'
import { buildAdaptationPlan } from '@/lib/adaptation'
import { newCanvasId } from '@/lib/utils'

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

  setCurrentNovel: (n: Novel | null) => void
  switchNovel: (novelId: string) => Promise<void>
  setSelectedSchema: (s: SchemaType | null) => void
  setAdaptationPlan: (p: AdaptationPlan | null) => void
  confirmPlan: () => void
  resetPlanFlow: () => void

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

  setGlobalLoading: (v: boolean) => void
  setGlobalError: (msg: string | null) => void
  clearError: () => void
  setExportDialogOpen: (open: boolean) => void
  requestExport: (format: ExportFormat) => Promise<{ ok: boolean; message: string }>
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

  setCurrentNovel: (n) => set({ currentNovel: n }),

  switchNovel: async (novelId) => {
    const novel = get().novels.find((n) => n.id === novelId)
    if (!novel) {
      set({ globalError: '未找到该小说项目' })
      return
    }
    set({ globalLoading: true, globalError: null })
    await new Promise((r) => setTimeout(r, 400))
    const screenplay = getScreenplayForNovel(novelId) ?? null
    const episodes = screenplay ? get().episodesByScreenplay[screenplay.id] ?? [] : []
    const chapters = novel.wordCount ? Math.ceil(novel.wordCount / 9000) : 80
    set({
      currentNovel: novel,
      currentScreenplay: screenplay,
      activeEpisodeId: episodes[0]?.id ?? null,
      adaptationPlan: buildAdaptationPlan(chapters, Math.min(36, chapters), novel.title),
      selectedSchema: screenplay?.schemaType === 'overview' ? 'overview' : get().selectedSchema,
      globalLoading: false,
    })
  },

  setSelectedSchema: (s) => set({ selectedSchema: s }),
  setAdaptationPlan: (p) => set({ adaptationPlan: p, planConfirmed: false }),
  confirmPlan: () => set({ planConfirmed: true }),
  resetPlanFlow: () =>
    set({
      selectedSchema: null,
      adaptationPlan: get().currentNovel
        ? buildAdaptationPlan(80, 36, get().currentNovel!.title)
        : mockAdaptationPlan,
      planConfirmed: false,
    }),

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
      const episodes = state.episodesByScreenplay[screenplayId]
      if (!episodes) return state
      return {
        episodesByScreenplay: {
          ...state.episodesByScreenplay,
          [screenplayId]: episodes.map((ep) => {
            if (ep.id !== episodeId) return ep
            return {
              ...ep,
              content: {
                scenes: ep.content.scenes.map((s) =>
                  s.id === sceneId ? { ...s, ...patch } : s,
                ),
              },
            }
          }),
        },
      }
    })
  },

  updateDialogue: (episodeId, sceneId, dialogueId, patch) => {
    set((state) => {
      const screenplayId = state.currentScreenplay?.id
      if (!screenplayId) return state
      const episodes = state.episodesByScreenplay[screenplayId]
      if (!episodes) return state
      return {
        episodesByScreenplay: {
          ...state.episodesByScreenplay,
          [screenplayId]: episodes.map((ep) => {
            if (ep.id !== episodeId) return ep
            return {
              ...ep,
              content: {
                scenes: ep.content.scenes.map((s) => {
                  if (s.id !== sceneId) return s
                  return {
                    ...s,
                    dialogues: s.dialogues.map((d) =>
                      d.id === dialogueId ? { ...d, ...patch } : d,
                    ),
                  }
                }),
              },
            }
          }),
        },
      }
    })
  },

  updateEpisodeContent: (episodeId, content) => {
    set((state) => {
      const screenplayId = state.currentScreenplay?.id
      if (!screenplayId) return state
      const episodes = state.episodesByScreenplay[screenplayId]
      if (!episodes) return state
      return {
        episodesByScreenplay: {
          ...state.episodesByScreenplay,
          [screenplayId]: episodes.map((ep) =>
            ep.id === episodeId ? { ...ep, content } : ep,
          ),
        },
      }
    })
  },

  addScene: (episodeId) => {
    set((state) => {
      const screenplayId = state.currentScreenplay?.id
      if (!screenplayId) return state
      const episodes = state.episodesByScreenplay[screenplayId]
      if (!episodes) return state
      const newScene: Scene = {
        id: newCanvasId('scene'),
        heading: '',
        action: '',
        dialogues: [],
      }
      return {
        episodesByScreenplay: {
          ...state.episodesByScreenplay,
          [screenplayId]: episodes.map((ep) =>
            ep.id === episodeId
              ? { ...ep, content: { scenes: [...ep.content.scenes, newScene] } }
              : ep,
          ),
        },
      }
    })
  },

  removeScene: (episodeId, sceneId) => {
    set((state) => {
      const screenplayId = state.currentScreenplay?.id
      if (!screenplayId) return state
      const episodes = state.episodesByScreenplay[screenplayId]
      if (!episodes) return state
      return {
        episodesByScreenplay: {
          ...state.episodesByScreenplay,
          [screenplayId]: episodes.map((ep) =>
            ep.id === episodeId
              ? {
                  ...ep,
                  content: {
                    scenes: ep.content.scenes.filter((s) => s.id !== sceneId),
                  },
                }
              : ep,
          ),
        },
      }
    })
  },

  addDialogue: (episodeId, sceneId) => {
    set((state) => {
      const screenplayId = state.currentScreenplay?.id
      if (!screenplayId) return state
      const episodes = state.episodesByScreenplay[screenplayId]
      if (!episodes) return state
      const newDialogue: SceneDialogue = {
        id: newCanvasId('dlg'),
        character: '',
        line: '',
      }
      return {
        episodesByScreenplay: {
          ...state.episodesByScreenplay,
          [screenplayId]: episodes.map((ep) => {
            if (ep.id !== episodeId) return ep
            return {
              ...ep,
              content: {
                scenes: ep.content.scenes.map((s) =>
                  s.id === sceneId
                    ? { ...s, dialogues: [...s.dialogues, newDialogue] }
                    : s,
                ),
              },
            }
          }),
        },
      }
    })
  },

  removeDialogue: (episodeId, sceneId, dialogueId) => {
    set((state) => {
      const screenplayId = state.currentScreenplay?.id
      if (!screenplayId) return state
      const episodes = state.episodesByScreenplay[screenplayId]
      if (!episodes) return state
      return {
        episodesByScreenplay: {
          ...state.episodesByScreenplay,
          [screenplayId]: episodes.map((ep) => {
            if (ep.id !== episodeId) return ep
            return {
              ...ep,
              content: {
                scenes: ep.content.scenes.map((s) =>
                  s.id === sceneId
                    ? { ...s, dialogues: s.dialogues.filter((d) => d.id !== dialogueId) }
                    : s,
                ),
              },
            }
          }),
        },
      }
    })
  },

  setGlobalLoading: (v) => set({ globalLoading: v }),
  setGlobalError: (msg) => set({ globalError: msg }),
  clearError: () => set({ globalError: null }),
  setExportDialogOpen: (open) => set({ exportDialogOpen: open }),

  requestExport: async (format) => {
    const { currentScreenplay, currentNovel } = get()
    if (!currentScreenplay || !currentNovel) {
      return { ok: false, message: '请先选择小说项目' }
    }
    set({ globalLoading: true })
    await new Promise((r) => setTimeout(r, 1200))
    set({ globalLoading: false, exportDialogOpen: false })
    const label = format === 'yaml' ? 'YAML' : format === 'pdf' ? 'PDF' : 'ZIP 打包'
    return {
      ok: true,
      message: `《${currentNovel.title}》${label} 导出任务已创建（mock）`,
    }
  },
}))
