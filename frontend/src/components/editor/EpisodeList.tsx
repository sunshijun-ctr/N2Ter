import { cn } from '@/lib/utils'
import { useAppStore } from '@/stores/useAppStore'
import { EpisodeStatusIcon } from './episode-status'

export function EpisodeList() {
  const { getEpisodes, activeEpisodeId, setActiveEpisode } = useAppStore()
  const episodes = getEpisodes()

  if (episodes.length === 0) {
    return (
      <p className="px-2 py-1 text-xs text-muted-foreground">
        完成改编方案后，分集会显示在这里
      </p>
    )
  }

  const doneCount = episodes.filter((e) => e.status === 'done').length

  return (
    <nav aria-label="分集导航" className="min-w-0">
      <div className="inline-flex min-w-min items-center gap-1.5">
        <span className="mr-1 hidden shrink-0 text-[11px] tabular-nums text-muted-foreground sm:inline">
          {doneCount}/{episodes.length} 集
        </span>
        {episodes.map((ep) => {
          const active = ep.id === activeEpisodeId
          return (
            <button
              key={ep.id}
              type="button"
              title={ep.title}
              onClick={() => setActiveEpisode(ep.id)}
              className={cn(
                'inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs transition-colors duration-200',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                active
                  ? 'bg-primary/10 font-semibold text-primary shadow-sm ring-1 ring-primary/15'
                  : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
              )}
              aria-current={active ? 'page' : undefined}
            >
              <EpisodeStatusIcon status={ep.status} />
              <span className="tabular-nums">第 {ep.episodeNum} 集</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
