import type { ReactNode } from 'react'
import { CheckCircle2, Loader2, Circle, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { mockEpisodes } from '@/lib/mock'
import type { EpisodeStatus } from '@/lib/types'

const statusIcon: Record<EpisodeStatus, ReactNode> = {
  done: <CheckCircle2 className="h-4 w-4 text-primary" />,
  generating: <Loader2 className="h-4 w-4 animate-spin text-primary" />,
  pending: <Circle className="h-4 w-4 text-muted-foreground/40" />,
  failed: <XCircle className="h-4 w-4 text-destructive" />,
}

export function EpisodeList({
  activeId,
  onSelect,
}: {
  activeId: string
  onSelect: (id: string) => void
}) {
  return (
    <div className="flex w-56 shrink-0 flex-col border-r bg-card">
      <div className="flex h-12 items-center justify-between border-b px-4 text-sm font-medium">
        分集
        <span className="text-xs text-muted-foreground">{mockEpisodes.length}</span>
      </div>
      <ul className="flex-1 overflow-auto p-2">
        {mockEpisodes.map((ep) => (
          <li key={ep.id}>
            <button
              onClick={() => onSelect(ep.id)}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors',
                ep.id === activeId ? 'bg-accent text-accent-foreground' : 'hover:bg-secondary',
              )}
            >
              {statusIcon[ep.status]}
              <span className="flex-1 truncate">
                第 {ep.episodeNum} 集 · {ep.title}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
