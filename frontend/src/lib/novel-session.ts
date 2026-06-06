import type { SchemaType } from './types'

export interface NovelSession {
  selectedSchema: SchemaType | null
  screenplayId: string | null
  activeEpisodeId: string | null
  planConfirmed: boolean
}

const SESSIONS_KEY = 'n2ter-novel-sessions'
const LAST_NOVEL_KEY = 'n2ter-last-novel-id'

type SessionStore = Record<string, NovelSession>

function readStore(): SessionStore {
  try {
    const raw = localStorage.getItem(SESSIONS_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as SessionStore
  } catch {
    return {}
  }
}

function writeStore(store: SessionStore) {
  try {
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(store))
  } catch {
    /* ignore */
  }
}

export function loadNovelSession(novelId: string): NovelSession | null {
  return readStore()[novelId] ?? null
}

export function saveNovelSession(novelId: string, patch: Partial<NovelSession>) {
  const store = readStore()
  const prev = store[novelId] ?? {
    selectedSchema: null,
    screenplayId: null,
    activeEpisodeId: null,
    planConfirmed: false,
  }
  store[novelId] = { ...prev, ...patch }
  writeStore(store)
}

export function clearNovelSession(novelId: string) {
  const store = readStore()
  delete store[novelId]
  writeStore(store)
}

export function getLastNovelId(): string | null {
  try {
    return localStorage.getItem(LAST_NOVEL_KEY)
  } catch {
    return null
  }
}

export function setLastNovelId(novelId: string) {
  try {
    localStorage.setItem(LAST_NOVEL_KEY, novelId)
  } catch {
    /* ignore */
  }
}
