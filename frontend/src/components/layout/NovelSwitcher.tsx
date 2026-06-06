import { ChevronDown, Library } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
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
  const { novels, currentNovel, switchNovel, globalLoading } = useAppStore()

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
      <label htmlFor="novel-switcher" className="mb-1.5 block text-xs text-muted-foreground">
        当前项目
      </label>
      <div className="relative">
        <select
          id="novel-switcher"
          value={currentNovel?.id ?? ''}
          disabled={globalLoading}
          onChange={(e) => void switchNovel(e.target.value)}
          className={cn(
            'w-full appearance-none rounded-md border bg-background py-2 pl-3 pr-8 text-sm',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          )}
        >
          {novels.map((n) => (
            <option key={n.id} value={n.id}>
              {n.title} · {statusLabel[n.status]}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      </div>
      {currentNovel && (
        <p className="mt-1.5 truncate text-xs text-muted-foreground">
          {currentNovel.author ?? '佚名'}
          {currentNovel.wordCount
            ? ` · ${(currentNovel.wordCount / 10000).toFixed(0)} 万字`
            : ''}
        </p>
      )}
    </div>
  )
}
