import { cn } from '@/lib/utils'
import { useAppStore } from '@/stores/useAppStore'
import { WorkspacePanel } from './WorkspacePanel'
import { EpisodeStatusBadge, EpisodeStatusIcon } from './episode-status'

export function EpisodeList() {
  const { getEpisodes, activeEpisodeId, setActiveEpisode } = useAppStore()
  const episodes = getEpisodes()

  if (episodes.length === 0) {
    return (
      <WorkspacePanel title="分集" subtitle="当前项目暂无数据" bodyClassName="p-4">
        <p className="text-xs leading-relaxed text-muted-foreground">
          完成改编方案并确认后，分集列表会出现在这里。
        </p>
      </WorkspacePanel>
    )
  }

  const doneCount = episodes.filter((e) => e.status === 'done').length

  return (
    <WorkspacePanel
      title="分集"
      subtitle={`${doneCount}/${episodes.length} 集已就绪`}
      trailing={
        <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
          {episodes.length}
        </span>
      }
      bodyClassName="p-2"
    >
      <ul className="space-y-0.5">
        {episodes.map((ep) => {
          const active = ep.id === activeEpisodeId
          return (
            <li key={ep.id}>
              <button
                type="button"
                onClick={() => setActiveEpisode(ep.id)}
                className={cn(
                  'group flex w-full cursor-pointer items-start gap-2.5 rounded-lg px-3 py-2.5 text-left transition-colors duration-200',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card',
                  active
                    ? 'border border-primary/15 bg-accent/80 shadow-sm'
                    : 'border border-transparent hover:bg-secondary/70',
                )}
              >
                <span
                  className={cn(
                    'mt-0.5 flex h-8 w-1 shrink-0 rounded-full transition-colors',
                    active ? 'bg-primary' : 'bg-transparent group-hover:bg-border',
                  )}
                  aria-hidden
                />
                <span className="mt-0.5 shrink-0">
                  <EpisodeStatusIcon status={ep.status} />
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      'block truncate text-sm font-medium leading-snug',
                      active ? 'text-foreground' : 'text-foreground/90',
                    )}
                  >
                    第 {ep.episodeNum} 集
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                    {ep.title}
                  </span>
                </span>
                <EpisodeStatusBadge status={ep.status} />
              </button>
            </li>
          )
        })}
      </ul>
    </WorkspacePanel>
  )
}
