import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { BookOpen, Loader2, UploadCloud } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { GENRES } from '@/lib/mock'
import { splitChapters, type ChapterSplitMode } from '@/lib/chapter-split'
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
  const location = useLocation()
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
  const [splitMode, setSplitMode] = useState<ChapterSplitMode | null>(null)
  const [autoSplitWords, setAutoSplitWords] = useState(0)

  const splitWordOptions = [0, 3000, 5000, 8000] as const

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
    const state = location.state as { newProject?: boolean } | null
    if (!state?.newProject) return
    setFile(null)
    setSelected([])
    setUploadDone(false)
    setChapters([])
    setReaderTitle('')
    setSplitMode(null)
    setReaderCollapsed(false)
    persistReaderCollapsed(false)
    if (fileRef.current) fileRef.current.value = ''
    navigate('/', { replace: true, state: null })
  }, [location.state, navigate])

  useEffect(() => {
    if ((location.state as { newProject?: boolean } | null)?.newProject) return
    if (currentNovel && apiConnected) {
      setReaderTitle(currentNovel.title)
      void loadChaptersFromApi(currentNovel.id)
      if (chapters.length === 0) setReaderCollapsed(false)
    }
  }, [currentNovel?.id, apiConnected, loadChaptersFromApi, location.state])

  function toggleGenre(g: string) {
    setSelected((prev) =>
      prev.includes(g)
        ? prev.filter((x) => x !== g)
        : prev.length < 3
          ? [...prev, g]
          : prev,
    )
  }

  async function previewLocalFile(f: File, wordsPerChapter = autoSplitWords) {
    const text = await f.text()
    const title = f.name.replace(/\.(txt|docx)$/i, '') || '未命名小说'
    const { chapters: parsed, mode } = splitChapters(text, { wordsPerChapter })
    if (mode === 'headings') {
      setAutoSplitWords(0)
    } else if (wordsPerChapter !== autoSplitWords) {
      setAutoSplitWords(wordsPerChapter)
    }
    setReaderTitle(title)
    setSplitMode(mode)
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
      const novelId = await uploadAndPreprocess(file, selected, autoSplitWords)
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

  const showReader = !readerCollapsed

  return (
    <>
      <div
        className={cn(
          'grid min-h-0 flex-1 overflow-hidden',
          showReader
            ? 'grid-cols-1 lg:grid-cols-[minmax(340px,26rem)_minmax(0,1fr)]'
            : 'grid-cols-1 lg:grid-cols-[minmax(0,1fr)_auto]',
        )}
      >
        <div className="min-h-0 overflow-auto border-b border-border/40 lg:border-b-0 lg:border-r lg:border-border/40">
          <div className="mx-auto flex w-full max-w-xl flex-col gap-6 px-6 py-8 sm:px-8">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">1. 选择小说文件</CardTitle>
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
                  className={cn(
                    'flex w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-4 py-12 transition-all duration-200',
                    'border-border/60 bg-background/40 text-muted-foreground',
                    'hover:border-primary/40 hover:bg-accent/20 hover:text-foreground',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    file && 'border-primary/30 bg-accent/10',
                    busy && 'pointer-events-none opacity-50',
                  )}
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary">
                    <UploadCloud className="h-6 w-6" />
                  </div>
                  <span className="text-sm font-medium">
                    {file ? file.name : '点击或拖拽 .txt 文件到这里'}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {file
                      ? `${(file.size / 1024).toFixed(1)} KB · 右侧可预览章节`
                      : '支持 .txt（.docx 即将支持）'}
                  </span>
                </button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">2. 章节拆分</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p className="text-xs leading-relaxed text-muted-foreground">
                  自带「第 X 章」等标题的 txt 会按原章节识别，无需按字数切分。爬虫 txt 若无章节标题，可选
                  3k / 5k / 8k 按字数自动分章。
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted-foreground">分章方式</span>
                  {splitWordOptions.map((n) => (
                    <button
                      key={n}
                      type="button"
                      disabled={busy || !file}
                      onClick={() => {
                        setAutoSplitWords(n)
                        if (file) void previewLocalFile(file, n)
                      }}
                      className={cn(
                        'rounded-full border px-3 py-1 text-xs transition-colors',
                        autoSplitWords === n
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border/60 hover:bg-secondary/80',
                      )}
                    >
                      {n === 0 ? '0k · 按原章节' : `${n / 1000}k`}
                    </button>
                  ))}
                </div>
                {file && chapters.length > 0 && (
                  <p className="rounded-lg bg-secondary/60 px-3 py-2 text-xs text-foreground/90">
                    {splitMode === 'headings'
                      ? `已识别章节标题，共 ${chapters.length} 章（0k，不自动分章）`
                      : splitMode === 'none'
                        ? `未识别章节标题，0k 模式下整本作为 1 章；如需切分请选 3k / 5k / 8k`
                        : `未识别足够章节标题，已按约 ${autoSplitWords.toLocaleString()} 字/段自动分为 ${chapters.length} 段`}
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  3. 选择题材
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
                          'cursor-pointer rounded-full border px-4 py-2 text-sm transition-all duration-200',
                          active
                            ? 'border-primary bg-primary text-primary-foreground shadow-soft'
                            : 'border-border/60 bg-background/50 hover:border-primary/30 hover:bg-secondary/80',
                        )}
                      >
                        {g}
                      </button>
                    )
                  })}
                </div>
              </CardContent>
            </Card>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/40 pt-2">
              {readerCollapsed && chapters.length > 0 && (
                <Button variant="outline" size="sm" onClick={() => handleReaderCollapsed(false)}>
                  <BookOpen className="h-4 w-4" />
                  展开阅读
                </Button>
              )}
              {(uploadDone || currentNovel?.status === 'preprocessing') && (
                <Button variant="outline" size="sm" onClick={() => navigate('/preprocess')}>
                  查看预处理进度
                </Button>
              )}
              <Button
                className={cn(!readerCollapsed && 'ml-auto')}
                size="lg"
                disabled={!file || selected.length === 0 || busy || !apiConnected}
                onClick={() => void handleStartPreprocess()}
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                {uploadDone ? '重新上传并预处理' : '上传并开始预处理'}
              </Button>
            </div>

            {uploadDone && (
              <p className="rounded-lg bg-primary/5 px-4 py-3 text-center text-xs leading-relaxed text-primary">
                已提交预处理，可在右侧继续阅读，或前往「预处理进度」查看实时状态
              </p>
            )}
            {!apiConnected && (
              <p className="text-center text-xs text-muted-foreground">
                启动 backend 后刷新页面，侧边栏显示「在线」即可上传
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
