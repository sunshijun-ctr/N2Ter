import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { UploadCloud } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { GENRES } from '@/lib/mock'
import { useAppStore } from '@/stores/useAppStore'

export function UploadPage() {
  const navigate = useNavigate()
  const { currentNovel } = useAppStore()
  const [selected, setSelected] = useState<string[]>(currentNovel?.genres ?? [])

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
      <PageHeader
        title="上传小说"
        description={
          currentNovel
            ? `当前项目：${currentNovel.title} · 支持最大 100 万字`
            : '支持最大 100 万字 · 上传时强制选择题材（1-3 个）'
        }
      />
      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto flex max-w-2xl flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>1. 选择小说文件</CardTitle>
            </CardHeader>
            <CardContent>
              <button
                type="button"
                className="flex w-full flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-12 text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
              >
                <UploadCloud className="h-8 w-8" />
                <span className="text-sm">点击或拖拽 .txt / .docx 文件到这里</span>
                <span className="text-xs">（接入 POST /api/novels 后启用）</span>
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
                      type="button"
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

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => navigate('/preprocess')}>
              查看预处理
            </Button>
            <Button size="lg" disabled={selected.length === 0} onClick={() => navigate('/preprocess')}>
              开始预处理
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}
