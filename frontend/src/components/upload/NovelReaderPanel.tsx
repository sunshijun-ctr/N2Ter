import { ChevronLeft, ChevronRight, PanelRightClose, PanelRightOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { NovelChapter } from '@/lib/types'

const READER_STORAGE_KEY = 'n2ter-upload-reader-collapsed'

export function getReaderCollapsedDefault() {
  try {
    return localStorage.getItem(READER_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function persistReaderCollapsed(collapsed: boolean) {
  try {
    localStorage.setItem(READER_STORAGE_KEY, collapsed ? '1' : '0')
  } catch {
    /* ignore */
  }
}

interface NovelReaderPanelProps {
  collapsed: boolean
  onCollapsedChange: (collapsed: boolean) => void
  title: string
  chapters: NovelChapter[]
  activeChapterNum: number
  onChapterChange: (chapterNum: number) => void
  loading?: boolean
  statusHint?: string
}

export function NovelReaderPanel({
  collapsed,
  onCollapsedChange,
  title,
  chapters,
  activeChapterNum,
  onChapterChange,
  loading,
  statusHint,
}: NovelReaderPanelProps) {
  const activeChapter = chapters.find((c) => c.chapterNum === activeChapterNum)
  const activeIndex = chapters.findIndex((c) => c.chapterNum === activeChapterNum)
  const hasContent = chapters.length > 0

  if (collapsed) {
    return (
      <div className="glass-panel flex w-12 shrink-0 flex-col items-center border-l py-3">
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10"
          onClick={() => onCollapsedChange(false)}
          aria-label="展开阅读面板"
          title="展开阅读"
        >
          <PanelRightOpen className="h-4 w-4" />
        </Button>
        {hasContent && (
          <span className="mt-3 text-[10px] font-medium text-muted-foreground [writing-mode:vertical-rl]">
            阅读
          </span>
        )}
      </div>
    )
  }

  return (
    <section className="flex min-h-0 min-w-0 flex-col border-l border-border/50 bg-card/40">
      <header className="glass-panel flex h-14 shrink-0 items-center gap-3 border-b border-border/50 px-4">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{title || '小说阅读'}</p>
          {statusHint && (
            <p className="truncate text-[11px] text-muted-foreground">{statusHint}</p>
          )}
        </div>
        {hasContent && (
          <span className="hidden shrink-0 rounded-full bg-secondary px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground sm:inline">
            {activeIndex + 1} / {chapters.length} 章
          </span>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0"
          onClick={() => onCollapsedChange(true)}
          aria-label="收起阅读面板"
          title="收起阅读"
        >
          <PanelRightClose className="h-4 w-4" />
        </Button>
      </header>

      {!hasContent ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 py-12 text-center">
          <div className="glass-panel rounded-2xl px-8 py-10">
            <p className="text-sm font-medium text-foreground/90">暂无章节内容</p>
            <p className="mt-2 max-w-xs text-xs leading-relaxed text-muted-foreground">
              选择本地 .txt 文件或完成上传后，可在此翻阅章节，等待预处理完成。
            </p>
          </div>
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[minmax(11rem,13rem)_minmax(0,1fr)]">
          <aside className="flex min-h-0 flex-col border-b border-border/40 md:border-b-0 md:border-r md:border-border/40">
            <div className="border-b border-border/40 px-3 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/80">
              目录
            </div>
            <ul className="max-h-40 flex-1 overflow-auto p-2 md:max-h-none">
              {chapters.map((ch) => {
                const active = ch.chapterNum === activeChapterNum
                return (
                  <li key={ch.id ?? ch.chapterNum} className="mb-0.5">
                    <button
                      type="button"
                      onClick={() => onChapterChange(ch.chapterNum)}
                      className={cn(
                        'w-full cursor-pointer rounded-lg px-2.5 py-2 text-left text-xs transition-colors duration-200',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        active
                          ? 'bg-accent/80 font-medium text-accent-foreground shadow-sm'
                          : 'text-muted-foreground hover:bg-secondary/70 hover:text-foreground',
                      )}
                    >
                      <span className="text-[11px] text-foreground/75">第 {ch.chapterNum} 章</span>
                      <span className="mt-0.5 line-clamp-2 block leading-snug">{ch.title}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </aside>

          <div className="flex min-h-0 min-w-0 flex-col">
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/40 px-4 py-2">
              <Button
                variant="outline"
                size="sm"
                disabled={activeIndex <= 0 || loading}
                onClick={() => onChapterChange(chapters[activeIndex - 1].chapterNum)}
              >
                <ChevronLeft className="h-4 w-4" />
                上一章
              </Button>
              <span className="truncate px-2 text-xs text-muted-foreground sm:hidden">
                {activeIndex + 1}/{chapters.length}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={activeIndex >= chapters.length - 1 || loading}
                onClick={() => onChapterChange(chapters[activeIndex + 1].chapterNum)}
              >
                下一章
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            <div className="manuscript-surface min-h-0 flex-1 overflow-auto">
              <div className="mx-auto w-full max-w-prose px-6 py-8 sm:px-8 sm:py-10">
                {loading ? (
                  <p className="text-center text-sm text-muted-foreground">加载章节…</p>
                ) : activeChapter ? (
                  <article>
                    <p className="mb-2 text-center text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
                      第 {activeChapter.chapterNum} 章
                    </p>
                    <h2 className="mb-6 text-center font-manuscript text-xl font-medium leading-snug tracking-tight sm:text-2xl">
                      {activeChapter.title}
                    </h2>
                    {activeChapter.summary && (
                      <p className="mb-6 rounded-xl border border-border/40 bg-background/60 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
                        {activeChapter.summary}
                      </p>
                    )}
                    <div className="font-manuscript text-[15px] leading-[1.85] text-foreground/92 whitespace-pre-wrap">
                      {activeChapter.content}
                    </div>
                    {activeChapter.wordCount != null && (
                      <p className="mt-8 text-center text-[11px] text-muted-foreground">
                        约 {activeChapter.wordCount.toLocaleString()} 字
                      </p>
                    )}
                  </article>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
