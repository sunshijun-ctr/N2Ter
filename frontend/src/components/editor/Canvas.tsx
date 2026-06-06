import { Loader2, MessageSquarePlus, Plus, Sparkles, Trash2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/stores/useAppStore'
import type { Scene } from '@/lib/types'
import { formatSourceChapters } from '@/lib/utils'

function SceneEditor({
  episodeId,
  scene,
  index,
}: {
  episodeId: string
  scene: Scene
  index: number
}) {
  const { updateScene, updateDialogue, addDialogue, removeDialogue, removeScene } =
    useAppStore()

  return (
    <Card>
      <CardContent className="p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <span className="text-sm font-semibold">场景 {index + 1}</span>
          <div className="flex gap-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => addDialogue(episodeId, scene.id)}
            >
              <MessageSquarePlus className="h-3.5 w-3.5" />
              添加对白
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-destructive"
              onClick={() => removeScene(episodeId, scene.id)}
              aria-label={`删除场景 ${index + 1}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        <label className="mb-1 block text-xs text-muted-foreground">场景头</label>
        <input
          value={scene.heading}
          onChange={(e) => updateScene(episodeId, scene.id, { heading: e.target.value })}
          className="mb-3 w-full rounded-md border bg-background px-3 py-2 text-xs"
          placeholder="内景 - 地点 - 时间"
        />

        <label className="mb-1 block text-xs text-muted-foreground">动作描述</label>
        <textarea
          value={scene.action}
          onChange={(e) => updateScene(episodeId, scene.id, { action: e.target.value })}
          rows={3}
          className="mb-3 w-full resize-y rounded-md border bg-background px-3 py-2 text-sm leading-relaxed"
          placeholder="场景动作与环境描写…"
        />

        <div className="flex flex-col gap-2">
          <span className="text-xs text-muted-foreground">对白</span>
          {scene.dialogues.length === 0 ? (
            <button
              type="button"
              onClick={() => addDialogue(episodeId, scene.id)}
              className="rounded-md border border-dashed py-6 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
            >
              暂无对白，点击添加
            </button>
          ) : (
            scene.dialogues.map((d, di) => (
              <div key={d.id} className="rounded-md bg-secondary/50 p-3">
                <div className="mb-2 flex items-start gap-2">
                  <input
                    value={d.character}
                    onChange={(e) =>
                      updateDialogue(episodeId, scene.id, d.id, { character: e.target.value })
                    }
                    className="w-28 rounded border bg-background px-2 py-1 text-sm font-medium"
                    placeholder="角色"
                  />
                  <input
                    value={d.parenthetical ?? ''}
                    onChange={(e) =>
                      updateDialogue(episodeId, scene.id, d.id, {
                        parenthetical: e.target.value || undefined,
                      })
                    }
                    className="min-w-0 flex-1 rounded border bg-background px-2 py-1 text-xs italic text-muted-foreground"
                    placeholder="括号注（可选）"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => removeDialogue(episodeId, scene.id, d.id)}
                    aria-label={`删除对白 ${di + 1}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <textarea
                  value={d.line}
                  onChange={(e) =>
                    updateDialogue(episodeId, scene.id, d.id, { line: e.target.value })
                  }
                  rows={2}
                  className="w-full resize-y rounded border bg-background px-2 py-1 text-sm"
                  placeholder="对白内容"
                />
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export function Canvas() {
  const { getActiveEpisode, addScene, generateEpisode, apiConnected } = useAppStore()
  const episode = getActiveEpisode()

  if (!episode) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        请选择一集进行编辑
      </div>
    )
  }

  const chapterLabel = formatSourceChapters(episode.sourceChapters)

  const scenes = episode.content.scenes ?? []

  return (
    <div className="relative flex-1 overflow-auto bg-background p-6">
      <div className="mx-auto max-w-2xl">
        <div className="mb-4 text-center">
          <h2 className="text-lg font-semibold">
            第 {episode.episodeNum} 集 · {episode.title}
          </h2>
          {chapterLabel && (
            <p className="text-xs text-muted-foreground">源章节：{chapterLabel}</p>
          )}
          <p className="mt-1 text-xs text-primary">
            画布即 source of truth · 可手动增删场景与对白
          </p>
        </div>

        <div className="flex flex-col gap-4">
          {episode.status === 'generating' ? (
            <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
              <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin text-primary" />
              AI 正在生成本集初稿…
            </div>
          ) : scenes.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
              <span>{episode.status === 'failed' ? '本集生成失败' : '本集暂无内容'}</span>
              {apiConnected && (
                <Button size="sm" onClick={() => void generateEpisode(episode.id)}>
                  <Sparkles className="h-4 w-4" />
                  {episode.status === 'failed' ? '重新生成本集' : 'AI 生成本集'}
                </Button>
              )}
            </div>
          ) : (
            scenes.map((scene, i) => (
              <SceneEditor
                key={scene.id}
                episodeId={episode.id}
                scene={scene}
                index={i}
              />
            ))
          )}

          {episode.status !== 'generating' && (
            <Button
              type="button"
              variant="outline"
              className="w-full border-dashed"
              onClick={() => addScene(episode.id)}
            >
              <Plus className="h-4 w-4" />
              添加场景
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
