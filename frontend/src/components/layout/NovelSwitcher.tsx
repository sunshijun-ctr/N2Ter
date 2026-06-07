import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDown, Library, Plus, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { LoadingSpinner } from '@/components/ui/loading'
import { useAppStore } from '@/stores/useAppStore'
import type { NovelStatus } from '@/lib/types'

const statusLabel: Record<NovelStatus, string> = {
  uploaded: '已上传',
  preprocessing: '预处理中',
  ready_for_planning: '可规划',
  preprocessing_failed: '失败',
}

const statusTone: Record<NovelStatus, string> = {
  uploaded: 'bg-secondary text-secondary-foreground',
  preprocessing: 'bg-highlight/15 text-highlight',
  ready_for_planning: 'bg-primary/10 text-primary',
  preprocessing_failed: 'bg-destructive/10 text-destructive',
}

interface NovelSwitcherProps {
  collapsed?: boolean
  onExpand?: () => void
}

export function NovelSwitcher({ collapsed = false, onExpand }: NovelSwitcherProps) {
  const navigate = useNavigate()
  const { novels, currentNovel, switchNovel, deleteNovel } = useAppStore()
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(true)

  function startNewProject() {
    navigate('/', { state: { newProject: true } })
  }

  async function handleDelete(novelId: string, title: string) {
    if (deletingId) return
    if (!window.confirm(`确定删除「${title}」？关联剧本与预处理数据将一并删除，且不可恢复。`)) {
      return
    }
    setDeletingId(novelId)
    await deleteNovel(novelId)
    setDeletingId(null)
  }

  if (collapsed) {
    return (
      <div className="flex justify-center gap-0.5 border-b border-border/50 py-2.5">
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10"
          title={currentNovel ? `当前：${currentNovel.title}` : '选择项目'}
          aria-label="当前项目，点击展开侧边栏"
          onClick={onExpand}
        >
          <Library className="h-[18px] w-[18px]" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10"
          title="新建项目"
          aria-label="新建项目"
          onClick={startNewProject}
        >
          <Plus className="h-[18px] w-[18px]" />
        </Button>
      </div>
    )
  }

  return (
    <div className="border-b border-border/50 px-3 py-3">
      <div className="mb-2 flex w-full items-center gap-1 px-1">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex min-w-0 flex-1 cursor-pointer items-center justify-between text-left"
          aria-expanded={expanded}
        >
          <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
            项目库
          </span>
          <ChevronDown
            className={cn(
              'h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200',
              expanded && 'rotate-180',
            )}
          />
        </button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
          title="新建项目（不会覆盖已有项目）"
          aria-label="新建项目"
          onClick={startNewProject}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {novels.length === 0 ? (
        <p className="px-1 text-xs leading-relaxed text-muted-foreground">
          暂无项目，点击右侧 ＋ 或上传页创建第一个项目
        </p>
      ) : expanded ? (
        <ul className="max-h-48 space-y-1.5 overflow-y-auto pr-0.5">
          {novels.map((novel) => {
            const active = currentNovel?.id === novel.id
            const busy = deletingId === novel.id
            return (
              <li
                key={novel.id}
                className={cn(
                  'group flex items-stretch overflow-hidden rounded-xl border transition-all duration-200',
                  active
                    ? 'border-primary/25 bg-accent/50 shadow-soft'
                    : 'border-border/40 bg-background/40 hover:border-border hover:bg-secondary/50',
                )}
              >
                <button
                  type="button"
                  disabled={Boolean(deletingId)}
                  onClick={() => void switchNovel(novel.id)}
                  className={cn(
                    'min-w-0 flex-1 px-3 py-2.5 text-left transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                  )}
                >
                  <span className="block truncate text-sm font-medium leading-snug">{novel.title}</span>
                  <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <span
                      className={cn(
                        'inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-medium',
                        statusTone[novel.status],
                      )}
                    >
                      {statusLabel[novel.status]}
                    </span>
                    {novel.wordCount ? (
                      <span className="text-[10px] text-muted-foreground">
                        {(novel.wordCount / 10000).toFixed(1)} 万字
                      </span>
                    ) : null}
                  </span>
                </button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-auto w-9 shrink-0 rounded-none text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100 focus-visible:opacity-100"
                  disabled={Boolean(deletingId)}
                  title={`删除「${novel.title}」`}
                  aria-label={`删除项目 ${novel.title}`}
                  onClick={() => void handleDelete(novel.id, novel.title)}
                >
                  {busy ? (
                    <LoadingSpinner className="h-3.5 w-3.5" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                </Button>
              </li>
            )
          })}
        </ul>
      ) : (
        currentNovel && (
          <p className="truncate px-1 text-xs text-muted-foreground">当前：{currentNovel.title}</p>
        )
      )}
    </div>
  )
}
