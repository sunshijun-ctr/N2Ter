import { useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { EpisodeList } from '@/components/editor/EpisodeList'
import { Canvas } from '@/components/editor/Canvas'
import { ChatPanel } from '@/components/editor/ChatPanel'

export function EditorPage() {
  const [activeId, setActiveId] = useState('e1')

  return (
    <>
      <PageHeader
        title="剧本工作区"
        description="编剧版 · 画布编辑 + 对话修改"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm">批量生成剩余集</Button>
            <Button size="sm">导出</Button>
          </div>
        }
      />
      <div className="flex flex-1 overflow-hidden">
        <EpisodeList activeId={activeId} onSelect={setActiveId} />
        <Canvas />
        <ChatPanel />
      </div>
    </>
  )
}
