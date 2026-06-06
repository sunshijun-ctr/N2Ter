import { useNavigate } from 'react-router-dom'
import { Clapperboard, FileText, PenLine, Check } from 'lucide-react'
import { PageShell } from '@/components/layout/PageShell'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { SCHEMA_OPTIONS } from '@/lib/mock'
import { useAppStore } from '@/stores/useAppStore'
import type { SchemaType } from '@/lib/types'

const schemaIcons: Record<SchemaType, typeof PenLine> = {
  ai_video: Clapperboard,
  screenwriter: PenLine,
  overview: FileText,
}

export function SchemaSelectPage() {
  const navigate = useNavigate()
  const { selectedSchema, setSelectedSchema, currentNovel } = useAppStore()

  function handleContinue() {
    if (!selectedSchema) return
    if (selectedSchema === 'overview') {
      navigate('/overview')
      return
    }
    navigate('/adaptation-plan')
  }

  return (
    <>
      <PageShell width="lg">
          <p className="mb-6 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {currentNovel ? `《${currentNovel.title}》· ` : ''}
            三套 Schema 面向不同产出形态。选「概览版」可跳过详细剧本，直接导出改编报告。
          </p>

          <div className="grid gap-5 md:grid-cols-3">
            {SCHEMA_OPTIONS.map((opt) => {
              const Icon = schemaIcons[opt.type]
              const active = selectedSchema === opt.type
              return (
                <button
                  key={opt.type}
                  type="button"
                  onClick={() => setSelectedSchema(opt.type)}
                  className={cn(
                    'cursor-pointer rounded-xl text-left transition-all duration-200',
                    active
                      ? 'ring-2 ring-primary/40 ring-offset-2 ring-offset-background'
                      : 'hover:-translate-y-0.5 hover:shadow-soft',
                  )}
                >
                  <Card
                    className={cn(
                      'h-full',
                      active ? 'border-primary/30 bg-accent/30' : 'hover:border-border',
                    )}
                  >
                    <CardHeader className="pb-3">
                      <div className="mb-2 flex items-center justify-between">
                        <div
                          className={cn(
                            'flex h-10 w-10 items-center justify-center rounded-md',
                            active ? 'bg-primary text-primary-foreground' : 'bg-secondary',
                          )}
                        >
                          <Icon className="h-5 w-5" />
                        </div>
                        {active && <Check className="h-5 w-5 text-primary" aria-hidden />}
                      </div>
                      <CardTitle className="text-base">{opt.label}</CardTitle>
                      <CardDescription>{opt.tagline}</CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-3 text-sm">
                      <p className="text-muted-foreground">{opt.description}</p>
                      <p className="text-xs text-muted-foreground">适合：{opt.audience}</p>
                      <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
                        {opt.highlights.map((h) => (
                          <li key={h} className="flex items-center gap-1.5">
                            <span className="h-1 w-1 shrink-0 rounded-full bg-primary" />
                            {h}
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                </button>
              )
            })}
          </div>

          <div className="mt-8 flex items-center justify-between border-t border-border/50 pt-6">
            <Button variant="outline" onClick={() => navigate('/overview')}>
              返回概览
            </Button>
            <Button size="lg" disabled={!selectedSchema} onClick={handleContinue}>
              {selectedSchema === 'overview' ? '完成，留在概览版' : '下一步：确认改编方案'}
            </Button>
          </div>
      </PageShell>
    </>
  )
}
