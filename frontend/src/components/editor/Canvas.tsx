import {
  Clapperboard,
  Loader2,
  MessageSquarePlus,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { AutoTextarea } from '@/components/ui/auto-textarea'
import { useAppStore } from '@/stores/useAppStore'
import type { Scene, Shot } from '@/lib/types'
import { cn, formatSourceChapters } from '@/lib/utils'

const inputClass =
  'w-full min-w-0 rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-primary'
const labelClass = 'mb-1 block text-xs text-muted-foreground'

function ShotEditor({
  episodeId,
  sceneId,
  shot,
  index,
}: {
  episodeId: string
  sceneId: string
  shot: Shot
  index: number
}) {
  const {
    updateShot,
    removeShot,
    updateShotDialogue,
    addShotDialogue,
    removeShotDialogue,
  } = useAppStore()

  return (
    <div className="rounded-md border bg-secondary/30 p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-foreground">分镜 {index + 1}</span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 text-muted-foreground hover:text-destructive"
          onClick={() => removeShot(episodeId, sceneId, shot.id)}
          aria-label={`删除分镜 ${index + 1}`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="mb-2 grid grid-cols-2 gap-2 lg:grid-cols-4">
        <div>
          <label className={labelClass}>景别</label>
          <input
            className={cn(inputClass, 'text-xs')}
            value={shot.shotType ?? ''}
            onChange={(e) =>
              updateShot(episodeId, sceneId, shot.id, {
                shotType: e.target.value || undefined,
              })
            }
            placeholder="特写 / 全景…"
          />
        </div>
        <div>
          <label className={labelClass}>时长 (秒)</label>
          <input
            type="number"
            min={0}
            step={0.5}
            className={cn(inputClass, 'text-xs')}
            value={shot.durationSeconds ?? ''}
            onChange={(e) =>
              updateShot(episodeId, sceneId, shot.id, {
                durationSeconds: e.target.value ? Number(e.target.value) : undefined,
              })
            }
            placeholder="5"
          />
        </div>
        <div>
          <label className={labelClass}>机位</label>
          <input
            className={cn(inputClass, 'text-xs')}
            value={shot.cameraAngle ?? ''}
            onChange={(e) =>
              updateShot(episodeId, sceneId, shot.id, {
                cameraAngle: e.target.value || undefined,
              })
            }
            placeholder="平视 / 俯拍…"
          />
        </div>
        <div>
          <label className={labelClass}>运镜</label>
          <input
            className={cn(inputClass, 'text-xs')}
            value={shot.cameraMovement ?? ''}
            onChange={(e) =>
              updateShot(episodeId, sceneId, shot.id, {
                cameraMovement: e.target.value || undefined,
              })
            }
            placeholder="推 / 拉 / 摇…"
          />
        </div>
      </div>

      <label className={labelClass}>主体动作</label>
      <AutoTextarea
        className="mb-2"
        minRows={2}
        value={shot.subjectAction ?? ''}
        onChange={(e) =>
          updateShot(episodeId, sceneId, shot.id, {
            subjectAction: e.target.value || undefined,
          })
        }
        placeholder="画面中的动作与主体…"
      />

      <div className="mb-2 grid grid-cols-2 gap-2 lg:grid-cols-4">
        <div>
          <label className={labelClass}>光影</label>
          <input
            className={cn(inputClass, 'text-xs')}
            value={shot.lighting ?? ''}
            onChange={(e) =>
              updateShot(episodeId, sceneId, shot.id, {
                lighting: e.target.value || undefined,
              })
            }
          />
        </div>
        <div>
          <label className={labelClass}>背景</label>
          <input
            className={cn(inputClass, 'text-xs')}
            value={shot.background ?? ''}
            onChange={(e) =>
              updateShot(episodeId, sceneId, shot.id, {
                background: e.target.value || undefined,
              })
            }
          />
        </div>
      </div>

      <label className={labelClass}>generation_prompt</label>
      <AutoTextarea
        className="mb-2 font-mono text-[11px]"
        minRows={2}
        value={shot.generationPrompt ?? ''}
        onChange={(e) =>
          updateShot(episodeId, sceneId, shot.id, {
            generationPrompt: e.target.value || undefined,
          })
        }
        placeholder="英文视频生成提示词…"
      />

      <label className={labelClass}>情绪（逗号分隔）</label>
      <input
        className={cn(inputClass, 'mb-2 text-xs')}
        value={shot.emotions.join('、')}
        onChange={(e) =>
          updateShot(episodeId, sceneId, shot.id, {
            emotions: e.target.value
              .split(/[,，、]/)
              .map((s) => s.trim())
              .filter(Boolean),
          })
        }
        placeholder="紧张、期待…"
      />

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className={labelClass}>对白</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7"
            onClick={() => addShotDialogue(episodeId, sceneId, shot.id)}
          >
            <MessageSquarePlus className="h-3.5 w-3.5" />
            添加
          </Button>
        </div>
        {shot.dialogues.length === 0 ? (
          <button
            type="button"
            onClick={() => addShotDialogue(episodeId, sceneId, shot.id)}
            className="rounded-md border border-dashed py-4 text-xs text-muted-foreground hover:border-primary hover:text-foreground"
          >
            暂无对白，点击添加
          </button>
        ) : (
          shot.dialogues.map((d) => (
            <div key={d.id} className="rounded-md bg-background/80 p-2">
              <div className="mb-1 flex gap-1">
                <input
                  className="w-24 rounded border bg-background px-2 py-1 text-xs"
                  value={d.character ?? ''}
                  onChange={(e) =>
                    updateShotDialogue(episodeId, sceneId, shot.id, d.id, {
                      character: e.target.value || undefined,
                    })
                  }
                  placeholder="角色"
                />
                <input
                  className="min-w-0 flex-1 rounded border bg-background px-2 py-1 text-xs italic text-muted-foreground"
                  value={d.voiceTone ?? ''}
                  onChange={(e) =>
                    updateShotDialogue(episodeId, sceneId, shot.id, d.id, {
                      voiceTone: e.target.value || undefined,
                    })
                  }
                  placeholder="语气"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  onClick={() => removeShotDialogue(episodeId, sceneId, shot.id, d.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              <AutoTextarea
                className="text-xs"
                minRows={1}
                value={d.line}
                onChange={(e) =>
                  updateShotDialogue(episodeId, sceneId, shot.id, d.id, {
                    line: e.target.value,
                  })
                }
                placeholder="台词"
              />
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function ShotSceneEditor({
  episodeId,
  scene,
  index,
}: {
  episodeId: string
  scene: Scene
  index: number
}) {
  const { updateScene, removeScene, addShot } = useAppStore()
  const shots = scene.shots ?? []

  return (
    <Card>
      <CardContent className="p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Clapperboard className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">场景 {index + 1}</span>
            <span className="text-xs text-muted-foreground">· {shots.length} 个分镜</span>
          </div>
          <div className="flex gap-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => addShot(episodeId, scene.id)}
            >
              <Plus className="h-3.5 w-3.5" />
              添加分镜
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-destructive"
              onClick={() => removeScene(episodeId, scene.id)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        <label className={labelClass}>场景标识（可选）</label>
        <input
          className={cn(inputClass, 'mb-3 text-xs')}
          value={scene.heading}
          onChange={(e) => updateScene(episodeId, scene.id, { heading: e.target.value })}
          placeholder="内景 - 地点 - 时间"
        />

        <div className="flex flex-col gap-3">
          {shots.length === 0 ? (
            <button
              type="button"
              onClick={() => addShot(episodeId, scene.id)}
              className="rounded-md border border-dashed py-8 text-xs text-muted-foreground hover:border-primary hover:text-foreground"
            >
              暂无分镜，点击添加
            </button>
          ) : (
            shots.map((shot, i) => (
              <ShotEditor
                key={shot.id}
                episodeId={episodeId}
                sceneId={scene.id}
                shot={shot}
                index={i}
              />
            ))
          )}
        </div>
      </CardContent>
    </Card>
  )
}

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

        <label className={labelClass}>场景头</label>
        <input
          value={scene.heading}
          onChange={(e) => updateScene(episodeId, scene.id, { heading: e.target.value })}
          className={cn(inputClass, 'mb-3 text-xs')}
          placeholder="内景 - 地点 - 时间"
        />

        <label className={labelClass}>动作描述</label>
        <AutoTextarea
          className="mb-3"
          minRows={3}
          value={scene.action}
          onChange={(e) => updateScene(episodeId, scene.id, { action: e.target.value })}
          placeholder="场景动作与环境描写…"
        />

        <div className="flex flex-col gap-2">
          <span className={labelClass}>对白</span>
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
                <AutoTextarea
                  minRows={1}
                  value={d.line}
                  onChange={(e) =>
                    updateDialogue(episodeId, scene.id, d.id, { line: e.target.value })
                  }
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

function isShotScene(scene: Scene) {
  return Boolean(scene.shots && scene.shots.length > 0)
}

export function Canvas() {
  const { getActiveEpisode, addScene, generateEpisode, apiConnected, selectedSchema, currentScreenplay } =
    useAppStore()
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
  const isAiVideo =
    selectedSchema === 'ai_video' || currentScreenplay?.schemaType === 'ai_video'

  return (
    <div className="relative min-h-0 min-w-0 flex-1 overflow-auto bg-background">
      <div className="w-full px-6 py-6">
        <div className="mb-5 border-b pb-4">
          <h2 className="text-lg font-semibold">
            第 {episode.episodeNum} 集 · {episode.title}
          </h2>
          {chapterLabel && (
            <p className="mt-1 text-xs text-muted-foreground">源章节：{chapterLabel}</p>
          )}
          <p className="mt-1 text-xs text-primary">
            画布即 source of truth ·{' '}
            {isAiVideo ? '可编辑分镜、对白与 generation_prompt' : '可手动增删场景与对白'}
          </p>
        </div>

        <div className="flex w-full flex-col gap-4">
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
            scenes.map((scene, i) =>
              isShotScene(scene) ? (
                <ShotSceneEditor
                  key={scene.id}
                  episodeId={episode.id}
                  scene={scene}
                  index={i}
                />
              ) : (
                <SceneEditor
                  key={scene.id}
                  episodeId={episode.id}
                  scene={scene}
                  index={i}
                />
              ),
            )
          )}

          {episode.status !== 'generating' && (
            <Button
              type="button"
              variant="outline"
              className="w-full border-dashed"
              onClick={() => addScene(episode.id)}
            >
              <Plus className="h-4 w-4" />
              {isAiVideo ? '添加场景（含空分镜）' : '添加场景'}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
