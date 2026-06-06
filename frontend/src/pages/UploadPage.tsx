import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, UploadCloud } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { GENRES } from '@/lib/mock'
import { useAppStore } from '@/stores/useAppStore'

export function UploadPage() {
  const navigate = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)
  const { currentNovel, apiConnected, uploadAndPreprocess, globalLoading } = useAppStore()
  const [selected, setSelected] = useState<string[]>(currentNovel?.userSelectedGenres ?? [])
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)

  function toggleGenre(g: string) {
    setSelected((prev) =>
      prev.includes(g)
        ? prev.filter((x) => x !== g)
        : prev.length < 3
          ? [...prev, g]
          : prev,
    )
  }

  function onFileChange(f: File | null) {
    if (!f) return
    if (!/\.(txt|docx)$/i.test(f.name)) {
      useAppStore.getState().setGlobalError('仅支持 .txt / .docx 文件（当前仅 .txt 可解析）')
      return
    }
    setFile(f)
  }

  async function handleStartPreprocess() {
    if (!file || selected.length === 0) return
    setUploading(true)
    try {
      const novelId = await uploadAndPreprocess(file, selected)
      if (novelId) navigate('/preprocess')
    } finally {
      setUploading(false)
    }
  }

  const busy = uploading || globalLoading

  return (
    <>
      <PageHeader
        title="上传小说"
        description={
          apiConnected
            ? '上传后将调用 POST /api/novels 并自动启动预处理'
            : '需启动后端（侧边栏 Mock 模式）才能上传；或仅浏览 mock 流程'
        }
      />
      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto flex max-w-2xl flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>1. 选择小说文件</CardTitle>
            </CardHeader>
            <CardContent>
              <input
                ref={fileRef}
                type="file"
                accept=".txt,.docx"
                className="hidden"
                onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault()
                  onFileChange(e.dataTransfer.files[0] ?? null)
                }}
                className="flex w-full flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-12 text-muted-foreground transition-colors hover:border-primary hover:text-foreground disabled:opacity-50"
              >
                <UploadCloud className="h-8 w-8" />
                <span className="text-sm">
                  {file ? file.name : '点击或拖拽 .txt 文件到这里'}
                </span>
                {file && (
                  <span className="text-xs text-primary">
                    {(file.size / 1024).toFixed(1)} KB · 就绪
                  </span>
                )}
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
            {currentNovel && (
              <Button variant="outline" onClick={() => navigate('/preprocess')}>
                查看预处理
              </Button>
            )}
            <Button
              size="lg"
              disabled={!file || selected.length === 0 || busy || !apiConnected}
              onClick={() => void handleStartPreprocess()}
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              上传并开始预处理
            </Button>
          </div>
          {!apiConnected && (
            <p className="text-center text-xs text-muted-foreground">
              启动 backend 后刷新页面，侧边栏显示 API 即可上传
            </p>
          )}
        </div>
      </div>
    </>
  )
}
