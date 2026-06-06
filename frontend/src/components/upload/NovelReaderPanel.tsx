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
      <div className="flex w-12 shrink-0 flex-col items-center border-l bg-card py-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onCollapsedChange(false)}
          aria-label="展开阅读面板"
          title="展开阅读"
        >
          <PanelRightOpen className="h-4 w-4" />
        </Button>
        {hasContent && (
          <span
            className="mt-4 origin-center rotate-90 whitespace-nowrap text-[10px] text-muted-foreground"
            style={{ writingMode: 'vertical-rl' }}
          >
            阅读
          </span>
        )}
      </div>
    )
  }

  return (
    <div className="flex min-w-0 flex-[1.2] flex-col border-l bg-card">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{title || '小说阅读'}</p>
          {statusHint && (
            <p className="truncate text-[10px] text-muted-foreground">{statusHint}</p>
          )}
        </div>
        {hasContent && (
          <span className="shrink-0 text-xs text-muted-foreground">
            {activeIndex + 1}/{chapters.length} 章
          </span>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onCollapsedChange(true)}
          aria-label="收起阅读面板"
          title="收起阅读"
        >
          <PanelRightClose className="h-4 w-4" />
        </Button>
      </div>

      {!hasContent ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
          <p>选择本地 .txt 文件或上传小说后</p>
          <p>可在此翻阅章节，等待预处理完成</p>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          <aside className="flex w-44 shrink-0 flex-col border-r">
            <div className="border-b px-3 py-2 text-xs font-medium text-muted-foreground">
              章节目录
            </div>
            <ul className="flex-1 overflow-auto p-1">
              {chapters.map((ch) => {
                const active = ch.chapterNum === activeChapterNum
                return (
                  <li key={ch.id ?? ch.chapterNum}>
                    <button
                      type="button"
                      onClick={() => onChapterChange(ch.chapterNum)}
                      className={cn(
                        'w-full rounded-md px-2 py-2 text-left text-xs transition-colors',
                        active
                          ? 'bg-accent text-accent-foreground'
                          : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
                      )}
                    >
                      <span className="font-medium text-foreground/80">
                        第 {ch.chapterNum} 章
                      </span>
                      <span className="mt-0.5 line-clamp-2 block">{ch.title}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </aside>

          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex shrink-0 items-center justify-between gap-2 border-b px-4 py-2">
              <Button
                variant="outline"
                size="sm"
                disabled={activeIndex <= 0 || loading}
                onClick={() => onChapterChange(chapters[activeIndex - 1].chapterNum)}
              >
                <ChevronLeft className="h-4 w-4" />
                上一章
              </Button>
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

            <div className="flex-1 overflow-auto px-6 py-5">
              {loading ? (
                <p className="text-center text-sm text-muted-foreground">加载章节…</p>
              ) : activeChapter ? (
                <article>
                  <h2 className="mb-4 text-center text-lg font-semibold leading-snug">
                    {activeChapter.title}
                  </h2>
                  {activeChapter.summary && (
                    <p className="mb-4 rounded-md bg-accent/40 px-3 py-2 text-xs text-muted-foreground">
                      {activeChapter.summary}
                    </p>
                  )}
                  <div className="whitespace-pre-wrap text-sm leading-[1.9] text-foreground/90">
                    {activeChapter.content}
                  </div>
                  {activeChapter.wordCount != null && (
                    <p className="mt-6 text-center text-xs text-muted-foreground">
                      约 {activeChapter.wordCount.toLocaleString()} 字
                    </p>
                  )}
                </article>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
