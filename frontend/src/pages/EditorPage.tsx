import { useEffect, useRef, useState } from 'react'
import { Loader2, Save, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EpisodeList } from '@/components/editor/EpisodeList'
import { Canvas } from '@/components/editor/Canvas'
import { ChatPanel } from '@/components/editor/ChatPanel'
import { useAppStore } from '@/stores/useAppStore'

export function EditorPage() {
  const {
    setExportDialogOpen,
    apiConnected,
    saveActiveEpisode,
    generateEpisode,
    generateAllEpisodes,
    generatingAll,
    getEpisodes,
    getEpisodeBlocker,
  } = useAppStore()
  const activeEpisode = useAppStore((s) => s.getActiveEpisode())
  const [saving, setSaving] = useState(false)

  const pendingCount = getEpisodes().filter(
    (e) => e.status === 'pending' || e.status === 'failed',
  ).length

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

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-b border-border/40 px-4 py-2">
        {apiConnected && (
          <>
            <Button
              variant="outline"
              size="sm"
              disabled={saving || !activeEpisode}
              onClick={() => void handleSave()}
            >
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              {saving ? '保存中…' : '保存本集'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={generatingAll || pendingCount === 0}
              onClick={() => void generateAllEpisodes()}
            >
              {generatingAll ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              {generatingAll
                ? '批量生成中…'
                : `批量生成${pendingCount ? ` (${pendingCount})` : ''}`}
            </Button>
          </>
        )}
        <Button size="sm" onClick={() => setExportDialogOpen(true)}>
          导出剧本
        </Button>
      </div>
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <EpisodeList />
        <Canvas />
        <ChatPanel />
      </div>
    </div>
  )
}
