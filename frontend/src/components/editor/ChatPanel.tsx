import { useEffect, useState } from 'react'
import { MessageSquareText, SendHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ToolCallCard } from './ToolCallCard'
import { WorkspacePanel } from './WorkspacePanel'
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
    <WorkspacePanel
      width="md"
      title="对话修改"
      subtitle={
        activeEpisode
          ? `第 ${activeEpisode.episodeNum} 集 · ${activeEpisode.title}`
          : '选择分集后开始对话'
      }
      trailing={
        apiConnected ? (
          <span
            className="flex items-center gap-1.5 text-[10px] text-muted-foreground"
            title={chatReady ? '对话通道已连接' : '正在连接…'}
          >
            <span
              className={cn(
                'h-1.5 w-1.5 rounded-full',
                chatReady ? 'bg-primary' : 'animate-pulse bg-muted-foreground/40',
              )}
            />
            {chatReady ? '已连接' : '连接中'}
          </span>
        ) : null
      }
      bodyClassName="flex flex-col"
    >
      <div className="flex-1 space-y-4 overflow-auto p-4">
        {chatMessages.length === 0 && !chatStreaming && (
          <div className="flex flex-col items-center gap-3 px-2 py-10 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary">
              <MessageSquareText className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground/90">用自然语言改剧本</p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                例如：「把第 3 场对白改得更克制一些」——工具结果会自动同步到中间画布。
              </p>
            </div>
          </div>
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
                'max-w-[92%] whitespace-pre-wrap rounded-xl px-3.5 py-2.5 text-sm leading-relaxed shadow-sm',
                m.role === 'user'
                  ? 'bg-primary text-primary-foreground'
                  : 'border border-border/50 bg-background',
              )}
            >
              {m.content}
            </div>
          </div>
        ))}
        {chatStreaming && (
          <div className="flex flex-col gap-2">
            {chatStreamingTools.length > 0 && <ToolCallCard calls={chatStreamingTools} />}
            <div className="max-w-[92%] whitespace-pre-wrap rounded-xl border border-border/50 bg-background px-3.5 py-2.5 text-sm leading-relaxed shadow-sm">
              {chatStreaming}
              <span className="ml-0.5 inline-block animate-pulse text-primary">▍</span>
            </div>
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-border/60 bg-card/50 p-3">
        <div className="flex items-end gap-2 rounded-xl border border-border/60 bg-background p-2 shadow-sm transition-shadow focus-within:border-primary/30 focus-within:ring-2 focus-within:ring-ring/20">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            rows={2}
            disabled={chatSending}
            placeholder="描述你想怎么改…"
            className="min-h-[44px] flex-1 resize-none bg-transparent px-1 py-1.5 text-sm leading-relaxed outline-none placeholder:text-muted-foreground disabled:opacity-50"
          />
          <Button
            size="icon"
            className="shrink-0"
            disabled={!input.trim() || chatSending}
            onClick={() => void handleSend()}
            aria-label="发送消息"
          >
            <SendHorizontal className="h-4 w-4" />
          </Button>
        </div>
        <p className="mt-2 px-1 text-[10px] text-muted-foreground">
          Enter 发送 · Shift+Enter 换行
        </p>
      </div>
    </WorkspacePanel>
  )
}
