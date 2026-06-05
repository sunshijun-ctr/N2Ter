import { useState } from 'react'
import { UploadCloud } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { GENRES } from '@/lib/mock'

export function UploadPage() {
  const [selected, setSelected] = useState<string[]>([])

  function toggleGenre(g: string) {
    setSelected((prev) =>
      prev.includes(g)
        ? prev.filter((x) => x !== g)
        : prev.length < 3
          ? [...prev, g]
          : prev,
    )
  }

  return (
    <>
      <PageHeader title="上传小说" description="支持最大 100 万字 · 上传时强制选择题材（1-3 个）" />
      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto flex max-w-2xl flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>1. 选择小说文件</CardTitle>
            </CardHeader>
            <CardContent>
              <button className="flex w-full flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-12 text-muted-foreground transition-colors hover:border-primary hover:text-foreground">
                <UploadCloud className="h-8 w-8" />
                <span className="text-sm">点击或拖拽 .txt / .docx 文件到这里</span>
                <span className="text-xs">（骨架阶段未接入上传逻辑）</span>
              </button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                2. 选择题材
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  已选 {selected.length}/3
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {GENRES.map((g) => {
                  const active = selected.includes(g)
                  return (
                    <button
                      key={g}
                      onClick={() => toggleGenre(g)}
                      className={cn(
                        'rounded-full border px-4 py-1.5 text-sm transition-colors',
                        active
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-input hover:bg-secondary',
                      )}
                    >
                      {g}
                    </button>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button size="lg" disabled={selected.length === 0}>
              开始预处理
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}
