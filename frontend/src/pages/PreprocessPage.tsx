import { CheckCircle2, Loader2, Circle } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

type StageState = 'done' | 'running' | 'pending'

const stages: { name: string; desc: string; state: StageState }[] = [
  { name: '章节拆分', desc: '已拆分 80 章', state: 'done' },
  { name: '章节处理', desc: '摘要 / 关键事件 / 语义切片（62/80）', state: 'running' },
  { name: '全书分析', desc: '全书摘要 · 角色弧光 · 伏笔索引', state: 'pending' },
  { name: '向量化入库', desc: 'BGE-M3 → Chroma', state: 'pending' },
  { name: '题材二次确认', desc: 'AI 校验用户所选题材', state: 'pending' },
  { name: '概览版生成', desc: '自动产出全书改编报告', state: 'pending' },
]

const stateIcon = {
  done: <CheckCircle2 className="h-5 w-5 text-primary" />,
  running: <Loader2 className="h-5 w-5 animate-spin text-primary" />,
  pending: <Circle className="h-5 w-5 text-muted-foreground/40" />,
}

export function PreprocessPage() {
  return (
    <>
      <PageHeader title="预处理进度" description="WebSocket 实时推送（骨架阶段为静态示例）" />
      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-2xl">
          <Card>
            <CardContent className="p-2">
              <ul className="flex flex-col">
                {stages.map((s, i) => (
                  <li
                    key={s.name}
                    className={cn(
                      'flex items-start gap-3 rounded-md p-3',
                      s.state === 'running' && 'bg-accent/50',
                    )}
                  >
                    <div className="mt-0.5">{stateIcon[s.state]}</div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">
                          Stage {i + 1} · {s.name}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">{s.desc}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  )
}
