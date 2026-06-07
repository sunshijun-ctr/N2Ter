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
  // 建连是异步的：在 OPEN 之前 send 会被丢弃。缓冲这些消息，open 后补发，
  // 否则用户发的第一条（建连未完成时）会石沉大海，agent 永不回复。
  const pending: WsClientMessage[] = []

  ws.onopen = () => {
    handlers.onOpen?.()
    while (pending.length) ws.send(JSON.stringify(pending.shift()))
  }
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
      else if (ws.readyState === WebSocket.CONNECTING) pending.push(msg)
      // CLOSING/CLOSED: drop (caller will reconnect on next send)
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
