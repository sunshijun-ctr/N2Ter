import type { NovelProgressWsMessage, WsClientMessage, WsServerMessage } from '@/lib/types'

/** WebSocket 连接封装（联调 backend /ws 时使用） */

export type WsHandlers = {
  onMessage?: (msg: WsServerMessage) => void
  onOpen?: () => void
  onClose?: () => void
  onError?: (err: Event) => void
}

export type NovelProgressHandlers = {
  onProgress?: (msg: Extract<NovelProgressWsMessage, { type: 'progress' }>) => void
  onDone?: () => void
  onOpen?: () => void
  onClose?: () => void
  onError?: (err: Event) => void
}

function wsUrl(path: string) {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}${path}`
}

function parseServerMessage(raw: unknown): WsServerMessage {
  const msg = raw as Record<string, unknown>
  if (msg.type === 'tool_call' && typeof msg.tool === 'string') {
    return {
      type: 'tool_call',
      name: msg.tool,
      args: typeof msg.args === 'string' ? msg.args : undefined,
    }
  }
  return raw as WsServerMessage
}

export function connectConversationWs(convId: string, handlers: WsHandlers) {
  const ws = new WebSocket(wsUrl(`/ws/conversations/${convId}`))

  ws.onopen = () => handlers.onOpen?.()
  ws.onclose = () => handlers.onClose?.()
  ws.onerror = (e) => handlers.onError?.(e)
  ws.onmessage = (ev) => {
    try {
      handlers.onMessage?.(parseServerMessage(JSON.parse(ev.data)))
    } catch {
      handlers.onMessage?.({ type: 'error', error: 'Invalid WS payload' })
    }
  }

  return {
    send: (msg: WsClientMessage) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg))
    },
    close: () => ws.close(),
  }
}

export function connectNovelProgressWs(novelId: string, handlers: NovelProgressHandlers) {
  const ws = new WebSocket(wsUrl(`/ws/novels/${novelId}/progress`))

  ws.onopen = () => handlers.onOpen?.()
  ws.onclose = () => handlers.onClose?.()
  ws.onerror = (e) => handlers.onError?.(e)
  ws.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data) as NovelProgressWsMessage
      if (msg.type === 'progress') handlers.onProgress?.(msg)
      else if (msg.type === 'done') handlers.onDone?.()
    } catch {
      handlers.onError?.(new Event('parse_error'))
    }
  }

  return { close: () => ws.close() }
}
