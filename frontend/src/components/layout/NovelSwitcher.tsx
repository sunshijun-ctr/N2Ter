import { useState } from 'react'
import { Library, Trash2 } from 'lucide-react'
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

interface NovelSwitcherProps {
  collapsed?: boolean
  onExpand?: () => void
}

export function NovelSwitcher({ collapsed = false, onExpand }: NovelSwitcherProps) {
  const { novels, currentNovel, switchNovel, deleteNovel } = useAppStore()
  const [deletingId, setDeletingId] = useState<string | null>(null)

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
      <div className="flex justify-center border-b py-2">
        <Button
          variant="ghost"
          size="icon"
          title={currentNovel ? `当前：${currentNovel.title}（点击展开切换项目）` : '选择项目'}
          aria-label="当前项目，点击展开侧边栏以切换"
          onClick={onExpand}
        >
          <Library className="h-4 w-4" />
        </Button>
      </div>
    )
  }

  return (
    <div className="border-b p-3">
      <p className="mb-1.5 text-xs text-muted-foreground">当前项目</p>

      {novels.length === 0 ? (
        <p className="text-xs text-muted-foreground">暂无项目，请先上传小说</p>
      ) : (
        <ul className="max-h-44 space-y-1 overflow-y-auto">
          {novels.map((novel) => {
            const active = currentNovel?.id === novel.id
            const busy = deletingId === novel.id
            return (
              <li
                key={novel.id}
                className={cn(
                  'flex items-stretch gap-0.5 rounded-md border',
                  active ? 'border-primary/40 bg-accent/40' : 'border-transparent hover:bg-secondary/60',
                )}
              >
                <button
                  type="button"
                  disabled={Boolean(deletingId)}
                  onClick={() => void switchNovel(novel.id)}
                  className={cn(
                    'min-w-0 flex-1 px-2.5 py-2 text-left text-sm transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                    active && 'font-medium',
                  )}
                >
                  <span className="block truncate">{novel.title}</span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                    {statusLabel[novel.status]}
                    {novel.wordCount
                      ? ` · ${(novel.wordCount / 10000).toFixed(1)} 万字`
                      : ''}
                  </span>
                </button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-auto w-8 shrink-0 rounded-l-none text-muted-foreground hover:text-destructive"
                  disabled={Boolean(deletingId)}
                  title={`删除「${novel.title}」`}
                  aria-label={`删除项目 ${novel.title}`}
                  onClick={() => void handleDelete(novel.id, novel.title)}
                >
                  {busy ? <LoadingSpinner className="h-3.5 w-3.5" /> : <Trash2 className="h-3.5 w-3.5" />}
                </Button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
