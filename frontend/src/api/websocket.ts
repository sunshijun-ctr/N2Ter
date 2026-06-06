import type { WsClientMessage, WsServerMessage } from '@/lib/types'

/** WebSocket 连接封装（联调 backend /ws 时使用） */

export type WsHandlers = {
  onMessage?: (msg: WsServerMessage) => void
  onOpen?: () => void
  onClose?: () => void
  onError?: (err: Event) => void
}

export function connectConversationWs(convId: string, handlers: WsHandlers) {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const host = window.location.host
  const ws = new WebSocket(`${protocol}//${host}/ws/conversations/${convId}`)

  ws.onopen = () => handlers.onOpen?.()
  ws.onclose = () => handlers.onClose?.()
  ws.onerror = (e) => handlers.onError?.(e)
  ws.onmessage = (ev) => {
    try {
      handlers.onMessage?.(JSON.parse(ev.data) as WsServerMessage)
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
