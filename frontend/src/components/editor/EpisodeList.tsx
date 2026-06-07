import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { episodeDisplayTitle } from '@/lib/episode-title'
import { useAppStore } from '@/stores/useAppStore'
import { EpisodeStatusIcon } from './episode-status'

export function EpisodeList() {
  const { getEpisodes, activeEpisodeId, setActiveEpisode } = useAppStore()
  const episodes = getEpisodes()
  const scrollRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  const updateScrollEdges = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const maxScroll = el.scrollWidth - el.clientWidth
    setCanScrollLeft(el.scrollLeft > 2)
    setCanScrollRight(maxScroll > 2 && el.scrollLeft < maxScroll - 2)
  }, [])

  useEffect(() => {
    updateScrollEdges()
  }, [episodes.length, updateScrollEdges])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.addEventListener('scroll', updateScrollEdges, { passive: true })
    const observer = new ResizeObserver(updateScrollEdges)
    observer.observe(el)
    return () => {
      el.removeEventListener('scroll', updateScrollEdges)
      observer.disconnect()
    }
  }, [updateScrollEdges])

  useEffect(() => {
    const el = scrollRef.current
    if (!el || !activeEpisodeId) return
    const active = el.querySelector<HTMLElement>(`[data-episode-id="${activeEpisodeId}"]`)
    active?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
    const t = window.setTimeout(updateScrollEdges, 350)
    return () => window.clearTimeout(t)
  }, [activeEpisodeId, episodes.length, updateScrollEdges])

  function scrollEpisodes(direction: 'left' | 'right') {
    const el = scrollRef.current
    if (!el) return
    const step = Math.max(200, Math.round(el.clientWidth * 0.72))
    el.scrollBy({ left: direction === 'left' ? -step : step, behavior: 'smooth' })
  }

  if (episodes.length === 0) {
    return (
      <p className="px-3 py-2 text-center text-[11px] text-muted-foreground">
        完成改编方案后，分集会显示在这里
      </p>
    )
  }

  const doneCount = episodes.filter((e) => e.status === 'done').length

  return (
    <nav aria-label="分集导航" className="min-w-0">
      <div className="flex items-center gap-1.5 px-2 py-1 sm:gap-2 sm:px-3">
        <div
          className="flex shrink-0 items-baseline gap-0.5 rounded-md border border-border/40 bg-card/50 px-2 py-1 tabular-nums"
          title={`已完成 ${doneCount} / ${episodes.length} 集`}
        >
          <span className="text-xs font-semibold text-foreground">{doneCount}</span>
          <span className="text-[10px] text-muted-foreground">/{episodes.length}</span>
        </div>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 rounded-md"
          disabled={!canScrollLeft}
          onClick={() => scrollEpisodes('left')}
          aria-label="向左翻看分集"
          title="向左翻看"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        <div
          ref={scrollRef}
          className={cn(
            'editor-episode-scroll min-w-0 flex-1 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
            canScrollLeft && 'is-scroll-left',
            canScrollRight && 'is-scroll-right',
          )}
        >
          <div className="inline-flex min-w-min items-center gap-1 px-0.5">
            {episodes.map((ep) => {
              const active = ep.id === activeEpisodeId
              const displayTitle = episodeDisplayTitle(ep.title, ep.episodeNum)
              const label = `第 ${ep.episodeNum} 集 · ${displayTitle}`

              return (
                <button
                  key={ep.id}
                  type="button"
                  data-episode-id={ep.id}
                  title={label}
                  data-active={active}
                  onClick={() => setActiveEpisode(ep.id)}
                  className={cn(
                    'editor-episode-pill',
                    active ? 'text-foreground' : 'text-muted-foreground',
                  )}
                  aria-current={active ? 'page' : undefined}
                >
                  <EpisodeStatusIcon status={ep.status} />
                  <span className="min-w-0 truncate text-[11px] leading-none">
                    <span className="font-semibold tabular-nums">{ep.episodeNum}</span>
                    <span className="mx-0.5 text-muted-foreground/60">·</span>
                    <span className={cn(displayTitle === '未命名' && 'italic opacity-60')}>
                      {displayTitle}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 rounded-md"
          disabled={!canScrollRight}
          onClick={() => scrollEpisodes('right')}
          aria-label="向右翻看分集"
          title="向右翻看"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </nav>
  )
}
