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
  const { currentNovel, selectedSchema, setExportDialogOpen, planConfirmed } = useAppStore()

  return (
    <>
      <PageHeader
        title="剧本工作区"
        description={
          currentNovel
            ? `《${currentNovel.title}》· ${selectedSchema ? schemaLabels[selectedSchema] : '未选类型'}${planConfirmed ? ' · 方案已确认' : ''}`
            : '画布编辑 + 对话修改'
        }
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm">
              批量生成剩余集
            </Button>
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
