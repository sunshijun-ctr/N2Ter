import { useEffect, useState } from 'react'
import { SendHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ToolCallCard } from './ToolCallCard'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/stores/useAppStore'

export function ChatPanel() {
  const [input, setInput] = useState('')
  const activeEpisode = useAppStore((s) => s.getActiveEpisode())
  const {
    apiConnected,
    chatMessages,
    chatStreaming,
    chatStreamingTools,
    chatSending,
    chatReady,
    ensureChatSession,
    disconnectChat,
    sendChatMessage,
  } = useAppStore()

  useEffect(() => {
    if (apiConnected && activeEpisode) {
      void ensureChatSession()
    }
    return () => disconnectChat()
  }, [apiConnected, activeEpisode?.id, ensureChatSession, disconnectChat])

  async function handleSend() {
    const text = input.trim()
    if (!text || chatSending) return
    setInput('')
    await sendChatMessage(text)
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSend()
    }
  }

  return (
    <div className="flex w-[380px] shrink-0 flex-col border-l bg-card">
      <div className="flex h-12 items-center border-b px-4 text-sm font-medium">
        对话修改
        {activeEpisode && (
          <span className="ml-2 truncate text-xs font-normal text-muted-foreground">
            · 第 {activeEpisode.episodeNum} 集
          </span>
        )}
        {apiConnected && (
          <span
            className={cn(
              'ml-auto text-[10px]',
              chatReady ? 'text-primary' : 'text-muted-foreground',
            )}
          >
            {chatReady ? 'WS' : '…'}
          </span>
        )}
      </div>

      <div className="flex-1 space-y-4 overflow-auto p-4">
        {chatMessages.length === 0 && !chatStreaming && (
          <p className="text-center text-xs text-muted-foreground">
            通过对话修改当前集剧本；工具调用结果会自动刷新画布
          </p>
        )}
        {chatMessages.map((m) => (
          <div
            key={m.id}
            className={cn('flex flex-col gap-2', m.role === 'user' && 'items-end')}
          >
            {m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0 && (
              <ToolCallCard calls={m.toolCalls} />
            )}
            <div
              className={cn(
                'max-w-[90%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm',
                m.role === 'user'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary',
              )}
            >
              {m.content}
            </div>
          </div>
        ))}
        {chatStreaming && (
          <div className="flex flex-col gap-2">
            {chatStreamingTools.length > 0 && <ToolCallCard calls={chatStreamingTools} />}
            <div className="max-w-[90%] whitespace-pre-wrap rounded-lg bg-secondary px-3 py-2 text-sm">
              {chatStreaming}
              <span className="animate-pulse">▍</span>
            </div>
          </div>
        )}
      </div>

      <div className="border-t p-3">
        <div className="flex items-end gap-2 rounded-lg border bg-background p-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            rows={2}
            disabled={chatSending}
            placeholder="例如：把第 3 集的节奏放慢一些…"
            className="flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground disabled:opacity-50"
          />
          <Button size="icon" disabled={!input.trim() || chatSending} onClick={() => void handleSend()}>
            <SendHorizontal className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
