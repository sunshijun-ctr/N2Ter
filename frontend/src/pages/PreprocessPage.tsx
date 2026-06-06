import { CheckCircle2, Loader2, Circle } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/stores/useAppStore'
import type { NovelStatus } from '@/lib/types'

type StageState = 'done' | 'running' | 'pending'

const statusStages: Record<NovelStatus, StageState[]> = {
  uploaded: ['pending', 'pending', 'pending', 'pending', 'pending', 'pending'],
  preprocessing: ['done', 'running', 'pending', 'pending', 'pending', 'pending'],
  ready_for_planning: ['done', 'done', 'done', 'done', 'done', 'done'],
  preprocessing_failed: ['done', 'done', 'pending', 'pending', 'pending', 'pending'],
}

const stageDefs = [
  { name: '章节拆分', descKey: 'split' as const },
  { name: '章节处理', descKey: 'chapters' as const },
  { name: '全书分析', descKey: 'analysis' as const },
  { name: '向量化入库', descKey: 'vectorize' as const },
  { name: '题材二次确认', descKey: 'genre' as const },
  { name: '概览版生成', descKey: 'overview' as const },
]

const stageDesc: Record<string, string> = {
  split: '已拆分章节',
  chapters: '摘要 / 关键事件 / 语义切片',
  analysis: '全书摘要 · 角色弧光 · 伏笔索引',
  vectorize: 'BGE-M3 → Chroma',
  genre: 'AI 校验用户所选题材',
  overview: '自动产出全书改编报告',
}

const stateIcon = {
  done: <CheckCircle2 className="h-5 w-5 text-primary" />,
  running: <Loader2 className="h-5 w-5 animate-spin text-primary" />,
  pending: <Circle className="h-5 w-5 text-muted-foreground/40" />,
}

export function PreprocessPage() {
  const { currentNovel } = useAppStore()
  const states = currentNovel ? statusStages[currentNovel.status] : statusStages.preprocessing

  return (
    <>
      <PageHeader
        title="预处理进度"
        description={
          currentNovel
            ? `《${currentNovel.title}》· WebSocket 实时推送（当前为 mock 状态映射）`
            : 'WebSocket 实时推送（骨架阶段为静态示例）'
        }
      />
      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-2xl">
          {!currentNovel ? (
            <p className="text-center text-sm text-muted-foreground">请先在侧边栏选择项目</p>
          ) : (
            <Card>
              <CardContent className="p-2">
                <ul className="flex flex-col">
                  {stageDefs.map((s, i) => {
                    const state = states[i]
                    return (
                      <li
                        key={s.name}
                        className={cn(
                          'flex items-start gap-3 rounded-md p-3',
                          state === 'running' && 'bg-accent/50',
                        )}
                      >
                        <div className="mt-0.5">{stateIcon[state]}</div>
                        <div className="flex-1">
                          <div className="text-sm font-medium">
                            Stage {i + 1} · {s.name}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {stageDesc[s.descKey]}
                            {currentNovel.status === 'preprocessing' && i === 1 && '（进行中）'}
                          </p>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  )
}
