import { useState } from 'react'
import { SendHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ToolCallCard } from './ToolCallCard'
import { cn } from '@/lib/utils'
import { mockMessages } from '@/lib/mock'

export function ChatPanel() {
  const [input, setInput] = useState('')

  return (
    <div className="flex w-[380px] shrink-0 flex-col border-l bg-card">
      <div className="flex h-12 items-center border-b px-4 text-sm font-medium">
        对话修改
      </div>

      <div className="flex-1 space-y-4 overflow-auto p-4">
        {mockMessages.map((m) => (
          <div
            key={m.id}
            className={cn('flex flex-col gap-2', m.role === 'user' && 'items-end')}
          >
            {m.role === 'assistant' && m.toolCalls && (
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
      </div>

      <div className="border-t p-3">
        <div className="flex items-end gap-2 rounded-lg border bg-background p-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={2}
            placeholder="例如：把第 3 集的节奏放慢一些…"
            className="flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <Button size="icon" disabled={!input.trim()}>
            <SendHorizontal className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
