import { useEffect, useRef, useState } from 'react'
import { Download, Loader2, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EpisodeList } from '@/components/editor/EpisodeList'
import { Canvas } from '@/components/editor/Canvas'
import { useAppStore } from '@/stores/useAppStore'

const schemaLabels: Record<string, string> = {
  ai_video: 'AI 视频版',
  screenwriter: '编剧版',
  overview: '概览版',
}

export function EditorPage() {
  const {
    setExportDialogOpen,
    apiConnected,
    saveActiveEpisode,
    generateEpisode,
    getEpisodeBlocker,
    currentNovel,
    currentScreenplay,
    selectedSchema,
    switchToSchemaVersion,
  } = useAppStore()
  const activeEpisode = useAppStore((s) => s.getActiveEpisode())
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!selectedSchema || selectedSchema === 'overview' || !currentNovel) return
    void switchToSchemaVersion(selectedSchema)
  }, [selectedSchema, currentNovel?.id, switchToSchemaVersion])

  const triggered = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (!apiConnected || !activeEpisode) return
    if (activeEpisode.status !== 'pending') return
    if (getEpisodeBlocker(activeEpisode.id) !== null) return
    if (triggered.current.has(activeEpisode.id)) return
    triggered.current.add(activeEpisode.id)
    void generateEpisode(activeEpisode.id)
  }, [apiConnected, activeEpisode?.id, activeEpisode?.status, generateEpisode, getEpisodeBlocker])

  async function handleSave() {
    setSaving(true)
    await saveActiveEpisode()
    setSaving(false)
  }

  const schemaLabel =
    (currentScreenplay?.schemaType && schemaLabels[currentScreenplay.schemaType]) ||
    '剧本'

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="editor-toolbar">
        <div className="flex items-center justify-between gap-2 border-b border-border/30 px-3 py-1.5 sm:px-4">
          <div className="flex min-w-0 items-center gap-2">
            <h1
              className="truncate text-sm font-medium leading-none text-foreground"
              title={currentNovel?.title}
            >
              {currentNovel?.title ?? '未选择项目'}
            </h1>
            <span className="hidden shrink-0 rounded bg-secondary/80 px-1.5 py-0.5 text-[10px] font-medium text-secondary-foreground sm:inline">
              {schemaLabel}
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {apiConnected && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1 px-2 text-xs"
                disabled={saving || !activeEpisode}
                onClick={() => void handleSave()}
              >
                {saving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                <span className="hidden sm:inline">{saving ? '保存中' : '保存'}</span>
              </Button>
            )}
            <Button size="sm" className="h-7 gap-1 px-2 text-xs" onClick={() => setExportDialogOpen(true)}>
              <Download className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">导出</span>
            </Button>
          </div>
        </div>

        <div className="editor-episode-rail">
          <EpisodeList />
        </div>
      </header>

      <Canvas />
    </div>
  )
}
