import { useState } from 'react'
import { ChevronRight, Wrench } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ToolCall } from '@/lib/types'

export function ToolCallCard({ calls }: { calls: ToolCall[] }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="rounded-md border bg-secondary/40 text-sm">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2 text-muted-foreground hover:text-foreground"
      >
        <Wrench className="h-3.5 w-3.5" />
        <span>工具调用 · {calls.length} 步</span>
        <ChevronRight
          className={cn('ml-auto h-4 w-4 transition-transform', open && 'rotate-90')}
        />
      </button>
      {open && (
        <ul className="flex flex-col gap-1 border-t px-3 py-2 font-mono text-xs">
          {calls.map((c, i) => (
            <li key={i} className="flex items-center gap-2">
              <span className="text-foreground">{c.name}</span>
              <span className="text-muted-foreground">({c.args})</span>
              {c.durationMs != null && (
                <span className="ml-auto text-muted-foreground">{c.durationMs}ms</span>
              )}
              <span className="text-primary">{c.status === 'success' ? '成功' : c.status}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
