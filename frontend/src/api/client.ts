/**
 * REST API 客户端 — 与 backend/app/routes 对齐
 * 响应经 mappers 转为前端 camelCase 领域模型
 */

import type {
  ApiAdaptationPlanRead,
  ApiAdaptationPlanRequest,
  ApiEpisodeRead,
  ApiEpisodeUpdate,
  ApiExportCreate,
  ApiExportRead,
  ApiNovelCreate,
  ApiNovelListItem,
  ApiNovelRead,
  ApiProgressEventRead,
  ApiScreenplayCreate,
  ApiScreenplayRead,
  ApiTaskRead,
  ApiTaskRef,
  ApiChapterRead,
  ApiConversationRead,
  ApiMessageRead,
} from '@/lib/api-types'
import {
  mapAdaptationPlan,
  mapChapter,
  mapEpisode,
  mapExport,
  mapNovel,
  mapProgressEvent,
  mapScreenplay,
  mapTask,
  mapConversation,
  mapMessage,
} from '@/lib/mappers'
import type {
  AdaptationPlan,
  Episode,
  ExportFormat,
  ExportJob,
  Novel,
  NovelChapter,
  Screenplay,
  Task,
  Conversation,
  Message,
  SchemaType,
} from '@/lib/types'

const BASE = '/api'

export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new ApiError(text || `HTTP ${res.status}`, res.status)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const api = {
  novels: {
    list: async (): Promise<Novel[]> => {
      const data = await request<ApiNovelListItem[]>('/novels')
      return data.map(mapNovel)
    },
    get: async (id: string): Promise<Novel> => {
      const data = await request<ApiNovelRead>(`/novels/${id}`)
      return mapNovel(data)
    },
    create: async (payload: ApiNovelCreate): Promise<Novel> => {
      const data = await request<ApiNovelRead>('/novels', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      return mapNovel(data)
    },
    delete: (id: string) => request<void>(`/novels/${id}`, { method: 'DELETE' }),
    preprocess: async (id: string): Promise<ApiTaskRef> =>
      request<ApiTaskRef>(`/novels/${id}/preprocess`, { method: 'POST' }),
    progress: async (id: string) => {
      const data = await request<ApiProgressEventRead[]>(`/novels/${id}/progress`)
      return data.map(mapProgressEvent)
    },
    adaptationPlan: async (
      novelId: string,
      body?: ApiAdaptationPlanRequest,
    ): Promise<AdaptationPlan> => {
      const data = await request<ApiAdaptationPlanRead>(
        `/novels/${novelId}/adaptation-plan`,
        { method: 'POST', body: JSON.stringify(body ?? {}) },
      )
      return mapAdaptationPlan(data)
    },
    chapters: {
      list: async (novelId: string): Promise<NovelChapter[]> => {
        const data = await request<ApiChapterRead[]>(`/novels/${novelId}/chapters`)
        return data.map(mapChapter)
      },
      get: async (novelId: string, chapterNum: number): Promise<NovelChapter> => {
        const data = await request<ApiChapterRead>(`/novels/${novelId}/chapters/${chapterNum}`)
        return mapChapter(data)
      },
    },
  },

  screenplays: {
    listByNovel: async (novelId: string): Promise<Screenplay[]> => {
      const data = await request<ApiScreenplayRead[]>(`/novels/${novelId}/screenplays`)
      return data.map(mapScreenplay)
    },
    get: async (id: string): Promise<Screenplay> => {
      const data = await request<ApiScreenplayRead>(`/screenplays/${id}`)
      return mapScreenplay(data)
    },
    create: async (payload: {
      novelId: string
      schemaType: SchemaType
      title?: string
      adaptationPlan?: Record<string, unknown>
    }): Promise<Screenplay> => {
      const body: ApiScreenplayCreate = {
        novel_id: payload.novelId,
        schema_type: payload.schemaType,
        title: payload.title,
        adaptation_plan: payload.adaptationPlan,
      }
      const data = await request<ApiScreenplayRead>('/screenplays', {
        method: 'POST',
        body: JSON.stringify(body),
      })
      return mapScreenplay(data)
    },
  },

  episodes: {
    list: async (screenplayId: string): Promise<Episode[]> => {
      const data = await request<ApiEpisodeRead[]>(`/screenplays/${screenplayId}/episodes`)
      return data.map(mapEpisode)
    },
    get: async (id: string): Promise<Episode> => {
      const data = await request<ApiEpisodeRead>(`/episodes/${id}`)
      return mapEpisode(data)
    },
    update: async (id: string, body: ApiEpisodeUpdate): Promise<Episode> => {
      const data = await request<ApiEpisodeRead>(`/episodes/${id}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      })
      return mapEpisode(data)
    },
    generate: async (id: string): Promise<ApiTaskRef> =>
      request<ApiTaskRef>(`/episodes/${id}/generate`, { method: 'POST' }),
    reset: async (id: string): Promise<Episode> => {
      const data = await request<ApiEpisodeRead>(`/episodes/${id}/reset`, { method: 'POST' })
      return mapEpisode(data)
    },
    patch: async (id: string, instruction: string): Promise<Episode> => {
      const data = await request<ApiEpisodeRead>(`/episodes/${id}/patch`, {
        method: 'POST',
        body: JSON.stringify({ instruction }),
      })
      return mapEpisode(data)
    },
  },

  tasks: {
    get: async (id: string): Promise<Task> => {
      const data = await request<ApiTaskRead>(`/tasks/${id}`)
      return mapTask(data)
    },
    cancel: async (id: string): Promise<Task> => {
      const data = await request<ApiTaskRead>(`/tasks/${id}/cancel`, { method: 'POST' })
      return mapTask(data)
    },
  },

  exports: {
    create: async (screenplayId: string, format: ExportFormat): Promise<ExportJob> => {
      const body: ApiExportCreate = { export_format: format }
      const data = await request<ApiExportRead>(`/screenplays/${screenplayId}/export`, {
        method: 'POST',
        body: JSON.stringify(body),
      })
      return mapExport(data)
    },
    get: async (id: string): Promise<ExportJob> => {
      const data = await request<ApiExportRead>(`/exports/${id}`)
      return mapExport(data)
    },
    waitUntilReady: async (id: string, timeoutMs = 120_000): Promise<ExportJob> => {
      const deadline = Date.now() + timeoutMs
      for (;;) {
        const job = await api.exports.get(id)
        if (job.status === 'done' || job.status === 'failed') return job
        if (Date.now() > deadline) return job
        await new Promise((r) => setTimeout(r, 1500))
      }
    },
    downloadUrl: (id: string) => `${BASE}/exports/${id}/download`,
  },

  conversations: {
    list: async (): Promise<Conversation[]> => {
      const data = await request<ApiConversationRead[]>('/conversations')
      return data.map(mapConversation)
    },
    create: async (body: {
      novelId: string
      screenplayId?: string
      title?: string
      contextType?: string
    }): Promise<Conversation> => {
      const data = await request<ApiConversationRead>('/conversations', {
        method: 'POST',
        body: JSON.stringify({
          novel_id: body.novelId,
          screenplay_id: body.screenplayId,
          title: body.title,
          context_type: body.contextType ?? 'conversation',
        }),
      })
      return mapConversation(data)
    },
    messages: async (convId: string): Promise<Message[]> => {
      const data = await request<ApiMessageRead[]>(`/conversations/${convId}/messages`)
      return data.map(mapMessage)
    },
  },

  skills: {
    list: () => request<Array<{ id: string; name: string; path: string }>>('/skills'),
  },
}

export type { ApiNovelCreate }
