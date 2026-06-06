import { useEffect, useRef, useState } from 'react'
import { Loader2, Save, Sparkles } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { EpisodeList } from '@/components/editor/EpisodeList'
import { Canvas } from '@/components/editor/Canvas'
import { ChatPanel } from '@/components/editor/ChatPanel'
import { useAppStore } from '@/stores/useAppStore'

const schemaLabels = {
  ai_video: 'AI 视频版',
  screenwriter: '编剧工作版',
  overview: '概览版',
} as const

export function EditorPage() {
  const {
    currentNovel,
    currentScreenplay,
    selectedSchema,
    setExportDialogOpen,
    planConfirmed,
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

  // Auto-generate the selected episode's AI draft when it hasn't been generated
  // yet, so the workspace shows real content the user can fine-tune instead of a
  // blank canvas. Each episode is triggered at most once per session.
  const triggered = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (!apiConnected || !activeEpisode) return
    if (activeEpisode.status !== 'pending') return
    // 顺序依赖：前序集未生成完时不自动生成本集（也不标记 triggered，
    // 这样前序完成后再次进入本集仍可自动触发）。
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

  const activeSchema = selectedSchema ?? currentScreenplay?.schemaType

  return (
    <>
      <PageHeader
        title="剧本工作区"
        description={
          currentNovel
            ? `《${currentNovel.title}》· ${
                activeSchema ? schemaLabels[activeSchema] : '未选类型'
              }${planConfirmed ? ' · 方案已确认' : ''}`
            : '画布编辑 + 对话修改'
        }
        actions={
          <div className="flex gap-2">
            {apiConnected && (
              <Button variant="outline" size="sm" disabled={saving} onClick={() => void handleSave()}>
                <Save className="h-3.5 w-3.5" />
                {saving ? '保存中…' : '保存本集'}
              </Button>
            )}
            {apiConnected && (
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
                  : `批量生成剩余集${pendingCount ? ` (${pendingCount})` : ''}`}
              </Button>
            )}
            <Button size="sm" onClick={() => setExportDialogOpen(true)}>
              导出
            </Button>
          </div>
        }
      />
      <div className="flex flex-1 overflow-hidden">
        <EpisodeList />
        <Canvas />
        <ChatPanel />
      </div>
    </>
  )
}
