/** REST API 封装（联调 backend 时在此实现） */

const BASE = '/api'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || `HTTP ${res.status}`)
  }
  return res.json() as Promise<T>
}

export const api = {
  novels: {
    list: () => request<unknown[]>('/novels'),
    get: (id: string) => request<unknown>(`/novels/${id}`),
    create: (body: FormData | Record<string, unknown>) =>
      request<unknown>('/novels', {
        method: 'POST',
        body: body instanceof FormData ? body : JSON.stringify(body),
      }),
  },
  screenplays: {
    listByNovel: (novelId: string) => request<unknown[]>(`/novels/${novelId}/screenplays`),
    create: (body: Record<string, unknown>) =>
      request<unknown>('/screenplays', { method: 'POST', body: JSON.stringify(body) }),
  },
  episodes: {
    list: (screenplayId: string) => request<unknown[]>(`/screenplays/${screenplayId}/episodes`),
    update: (id: string, body: Record<string, unknown>) =>
      request<unknown>(`/episodes/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  },
  tasks: {
    get: (id: string) => request<unknown>(`/tasks/${id}`),
  },
  exports: {
    create: (screenplayId: string, format: string) =>
      request<unknown>(`/screenplays/${screenplayId}/export`, {
        method: 'POST',
        body: JSON.stringify({ export_format: format }),
      }),
  },
}
