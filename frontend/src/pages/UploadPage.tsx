import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, UploadCloud } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { GENRES } from '@/lib/mock'
import { splitChapters } from '@/lib/chapter-split'
import { api } from '@/api/client'
import { useAppStore } from '@/stores/useAppStore'
import type { NovelChapter } from '@/lib/types'
import {
  getReaderCollapsedDefault,
  NovelReaderPanel,
  persistReaderCollapsed,
} from '@/components/upload/NovelReaderPanel'

export function UploadPage() {
  const navigate = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)
  const { currentNovel, apiConnected, uploadAndPreprocess, globalLoading } = useAppStore()
  const [selected, setSelected] = useState<string[]>(currentNovel?.userSelectedGenres ?? [])
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadDone, setUploadDone] = useState(false)

  const [readerCollapsed, setReaderCollapsed] = useState(getReaderCollapsedDefault)
  const [readerTitle, setReaderTitle] = useState('')
  const [chapters, setChapters] = useState<NovelChapter[]>([])
  const [activeChapterNum, setActiveChapterNum] = useState(1)
  const [chaptersLoading, setChaptersLoading] = useState(false)

  const loadChaptersFromApi = useCallback(async (novelId: string) => {
    setChaptersLoading(true)
    try {
      const list = await api.novels.chapters.list(novelId)
      if (list.length) {
        setChapters(list)
        setActiveChapterNum(list[0].chapterNum)
      }
    } catch {
      useAppStore.getState().setGlobalError('加载章节列表失败')
    } finally {
      setChaptersLoading(false)
    }
  }, [])

  useEffect(() => {
    if (currentNovel && apiConnected) {
      setReaderTitle(currentNovel.title)
      void loadChaptersFromApi(currentNovel.id)
      if (chapters.length === 0) setReaderCollapsed(false)
    }
  }, [currentNovel?.id, apiConnected, loadChaptersFromApi])

  function toggleGenre(g: string) {
    setSelected((prev) =>
      prev.includes(g)
        ? prev.filter((x) => x !== g)
        : prev.length < 3
          ? [...prev, g]
          : prev,
    )
  }

  async function previewLocalFile(f: File) {
    const text = await f.text()
    const title = f.name.replace(/\.(txt|docx)$/i, '') || '未命名小说'
    const parsed = splitChapters(text)
    setReaderTitle(title)
    setChapters(
      parsed.map((ch) => ({
        chapterNum: ch.chapterNum,
        title: ch.title,
        content: ch.content,
        wordCount: ch.wordCount,
      })),
    )
    setActiveChapterNum(parsed[0]?.chapterNum ?? 1)
    setReaderCollapsed(false)
    persistReaderCollapsed(false)
  }

  function onFileChange(f: File | null) {
    if (!f) return
    if (!/\.(txt|docx)$/i.test(f.name)) {
      useAppStore.getState().setGlobalError('仅支持 .txt / .docx 文件（当前仅 .txt 可解析）')
      return
    }
    setFile(f)
    setUploadDone(false)
    void previewLocalFile(f)
  }

  function handleReaderCollapsed(collapsed: boolean) {
    setReaderCollapsed(collapsed)
    persistReaderCollapsed(collapsed)
  }

  async function handleStartPreprocess() {
    if (!file || selected.length === 0) return
    setUploading(true)
    try {
      const novelId = await uploadAndPreprocess(file, selected)
      if (novelId) {
        setUploadDone(true)
        setReaderTitle(file.name.replace(/\.(txt|docx)$/i, '') || '未命名小说')
        await loadChaptersFromApi(novelId)
        setReaderCollapsed(false)
        persistReaderCollapsed(false)
      }
    } finally {
      setUploading(false)
    }
  }

  const busy = uploading || globalLoading
  const statusHint = uploadDone
    ? currentNovel?.status === 'preprocessing'
      ? '预处理进行中，可先在此阅读等待'
      : currentNovel?.status === 'ready_for_planning'
        ? '预处理已完成，可继续后续流程'
        : '已上传，等待后台处理'
    : file
      ? '本地预览 · 上传后将同步服务端章节'
      : currentNovel
        ? `《${currentNovel.title}》`
        : undefined

  return (
    <>
      <PageHeader
        title="上传小说"
        description="左侧上传与选题材，右侧可折叠阅读；预处理期间可先翻阅章节"
        actions={
          uploadDone || currentNovel?.status === 'preprocessing' ? (
            <Button variant="outline" size="sm" onClick={() => navigate('/preprocess')}>
              查看预处理进度
            </Button>
          ) : undefined
        }
      />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div
          className={cn(
            'flex min-w-0 flex-col overflow-auto p-6 transition-[flex]',
            readerCollapsed ? 'flex-1' : 'w-full max-w-lg shrink-0 xl:max-w-xl',
          )}
        >
          <div className="mx-auto flex w-full max-w-lg flex-col gap-6">
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
                  className="flex w-full flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-10 text-muted-foreground transition-colors hover:border-primary hover:text-foreground disabled:opacity-50"
                >
                  <UploadCloud className="h-8 w-8" />
                  <span className="text-sm">
                    {file ? file.name : '点击或拖拽 .txt 文件到这里'}
                  </span>
                  {file && (
                    <span className="text-xs text-primary">
                      {(file.size / 1024).toFixed(1)} KB · 右侧可预览
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

            <div className="flex flex-wrap justify-end gap-2">
              {readerCollapsed && chapters.length > 0 && (
                <Button variant="outline" onClick={() => handleReaderCollapsed(false)}>
                  展开阅读面板
                </Button>
              )}
              <Button
                size="lg"
                disabled={!file || selected.length === 0 || busy || !apiConnected}
                onClick={() => void handleStartPreprocess()}
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                {uploadDone ? '重新上传并预处理' : '上传并开始预处理'}
              </Button>
            </div>

            {uploadDone && (
              <p className="text-center text-xs text-primary">
                已提交预处理，可在右侧继续阅读，或前往「预处理进度」查看实时状态
              </p>
            )}
            {!apiConnected && (
              <p className="text-center text-xs text-muted-foreground">
                启动 backend 后刷新页面，侧边栏显示 API 即可上传
              </p>
            )}
          </div>
        </div>

        <NovelReaderPanel
          collapsed={readerCollapsed}
          onCollapsedChange={handleReaderCollapsed}
          title={readerTitle || currentNovel?.title || ''}
          chapters={chapters}
          activeChapterNum={activeChapterNum}
          onChapterChange={setActiveChapterNum}
          loading={chaptersLoading}
          statusHint={statusHint}
        />
      </div>
    </>
  )
}
