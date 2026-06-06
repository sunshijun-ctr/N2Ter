import {
  Clapperboard,
  Loader2,
  MessageSquarePlus,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AutoInput } from '@/components/ui/auto-input'
import { AutoTextarea } from '@/components/ui/auto-textarea'
import { DialogueLine } from '@/components/ui/dialogue-line'
import { useAppStore } from '@/stores/useAppStore'
import type { Scene, Shot } from '@/lib/types'
import { cn, formatSourceChapters } from '@/lib/utils'

const labelClass = 'text-[10px] text-muted-foreground/75'

/** 人物行：吴世恭（自言自语） */
function formatSpeaker(character: string, parenthetical?: string): string {
  const name = character.trim()
  if (/[（(][^）)]*[）)]$/.test(name)) return name
  if (!parenthetical?.trim()) return name
  const p = parenthetical.trim()
  if (p.startsWith('（') || p.startsWith('(')) return `${name}${p}`
  return `${name}（${p}）`
}

function parseSpeaker(raw: string): { character: string; parenthetical?: string } {
  const value = raw.trim()
  if (!value) return { character: '' }
  const full = value.match(/^(.+?)（([^）]*)）$/)
  if (full) {
    const p = full[2].trim()
    return { character: full[1].trim(), parenthetical: p || undefined }
  }
  const half = value.match(/^(.+?)\(([^)]*)\)$/)
  if (half) {
    const p = half[2].trim()
    return { character: half[1].trim(), parenthetical: p || undefined }
  }
  return { character: value }
}

function Field({
  label,
  children,
  className,
}: {
  label: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <label className={cn('flex w-full min-w-0 flex-col gap-0.5', className)}>
      <span className={labelClass}>{label}</span>
      {children}
    </label>
  )
}

/** 作业本式对白区：左侧订线 + 每条对白下方横线 */
function DialogueSheet({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative border-l border-red-300/30 pl-4 dark:border-red-400/20">
      {children}
    </div>
  )
}

function DialogueRuledBlock({
  children,
  ruled = true,
}: {
  children: React.ReactNode
  ruled?: boolean
}) {
  return (
    <div
      className={cn(
        'min-w-0 py-3',
        ruled && 'border-b border-slate-300/70 dark:border-slate-600/50',
      )}
    >
      {children}
    </div>
  )
}

/** 角色名 + 台词并排（作业本一行一句） */
function DialogueEntry({
  speaker,
  line,
  speakerPlaceholder,
  linePlaceholder,
  onSpeakerChange,
  onLineChange,
  onRemove,
  removeLabel,
  speakerClassName,
}: {
  speaker: string
  line: string
  speakerPlaceholder: string
  linePlaceholder?: string
  onSpeakerChange: (value: string) => void
  onLineChange: (value: string) => void
  onRemove: () => void
  removeLabel: string
  speakerClassName?: string
}) {
  return (
    <div className="flex w-full min-w-0 items-start gap-2">
      <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3 gap-y-1">
        <AutoInput
          className={cn('shrink-0 font-medium', speakerClassName)}
          minChars={2}
          value={speaker}
          onChange={(e) => onSpeakerChange(e.target.value)}
          placeholder={speakerPlaceholder}
        />
        <DialogueLine
          className="min-w-[12ch] flex-1 basis-[8rem]"
          value={line}
          onChange={onLineChange}
          placeholder={linePlaceholder}
        />
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="mt-0.5 h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
        onClick={onRemove}
        aria-label={removeLabel}
      >
        <Trash2 className="h-3 w-3" />
      </Button>
    </div>
  )
}

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
    <div className="border-l border-border/15 py-2 pl-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-foreground/90">分镜 {index + 1}</span>
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

      <div className="mb-3 flex flex-wrap items-end gap-x-5 gap-y-2">
        <Field label="景别">
          <AutoInput
            className="text-xs"
            minChars={4}
            value={shot.shotType ?? ''}
            onChange={(e) =>
              updateShot(episodeId, sceneId, shot.id, {
                shotType: e.target.value || undefined,
              })
            }
            placeholder="中景"
          />
        </Field>
        <Field label="时长(秒)">
          <AutoInput
            className="text-xs tabular-nums"
            minChars={2}
            type="text"
            inputMode="decimal"
            value={shot.durationSeconds != null ? String(shot.durationSeconds) : ''}
            onChange={(e) =>
              updateShot(episodeId, sceneId, shot.id, {
                durationSeconds: e.target.value ? Number(e.target.value) : undefined,
              })
            }
            placeholder="5"
          />
        </Field>
        <Field label="机位">
          <AutoInput
            className="text-xs"
            minChars={3}
            value={shot.cameraAngle ?? ''}
            onChange={(e) =>
              updateShot(episodeId, sceneId, shot.id, {
                cameraAngle: e.target.value || undefined,
              })
            }
            placeholder="平视"
          />
        </Field>
        <Field label="运镜">
          <AutoInput
            className="text-xs"
            minChars={2}
            value={shot.cameraMovement ?? ''}
            onChange={(e) =>
              updateShot(episodeId, sceneId, shot.id, {
                cameraMovement: e.target.value || undefined,
              })
            }
            placeholder="推近"
          />
        </Field>
        <Field label="光影">
          <AutoInput
            className="text-xs"
            minChars={4}
            value={shot.lighting ?? ''}
            onChange={(e) =>
              updateShot(episodeId, sceneId, shot.id, {
                lighting: e.target.value || undefined,
              })
            }
            placeholder="侧逆光"
          />
        </Field>
        <Field label="背景">
          <AutoInput
            className="text-xs"
            minChars={4}
            value={shot.background ?? ''}
            onChange={(e) =>
              updateShot(episodeId, sceneId, shot.id, {
                background: e.target.value || undefined,
              })
            }
          />
        </Field>
      </div>

      <Field label="主体动作" className="mb-2 block w-full">
        <AutoTextarea
          minRows={1}
          value={shot.subjectAction ?? ''}
          onChange={(e) =>
            updateShot(episodeId, sceneId, shot.id, {
              subjectAction: e.target.value || undefined,
            })
          }
          placeholder="画面中的动作与主体…"
        />
      </Field>

      <Field label="generation_prompt" className="mb-2 block w-full">
        <AutoTextarea
          className="font-mono text-[11px]"
          minRows={1}
          value={shot.generationPrompt ?? ''}
          onChange={(e) =>
            updateShot(episodeId, sceneId, shot.id, {
              generationPrompt: e.target.value || undefined,
            })
          }
          placeholder="英文视频生成提示词…"
        />
      </Field>

      <Field label="情绪" className="mb-3 block">
        <AutoInput
          className="text-xs"
          minChars={4}
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
      </Field>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className={labelClass}>对白</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
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
            className="py-2 text-left text-xs text-muted-foreground/80 underline-offset-2 hover:text-foreground hover:underline"
          >
            暂无对白，点击添加
          </button>
        ) : (
          <DialogueSheet>
            {shot.dialogues.map((d, di) => (
              <DialogueRuledBlock key={d.id} ruled={di < shot.dialogues.length - 1}>
                <DialogueEntry
                  speaker={formatSpeaker(d.character ?? '', d.voiceTone)}
                  line={d.line}
                  speakerPlaceholder="角色（语气）"
                  linePlaceholder="台词"
                  speakerClassName="text-xs"
                  onSpeakerChange={(raw) => {
                    const parsed = parseSpeaker(raw)
                    updateShotDialogue(episodeId, sceneId, shot.id, d.id, {
                      character: parsed.character || undefined,
                      voiceTone: parsed.parenthetical,
                    })
                  }}
                  onLineChange={(line) =>
                    updateShotDialogue(episodeId, sceneId, shot.id, d.id, { line })
                  }
                  onRemove={() => removeShotDialogue(episodeId, sceneId, shot.id, d.id)}
                  removeLabel="删除台词"
                />
              </DialogueRuledBlock>
            ))}
          </DialogueSheet>
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
    <section className="border-b border-border/15 pb-6 last:border-b-0">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Clapperboard className="h-4 w-4 text-primary/80" />
          <span className="text-sm font-semibold">场景 {index + 1}</span>
          <span className="text-xs text-muted-foreground">· {shots.length} 个分镜</span>
        </div>
        <div className="flex gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
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

      <Field label="场景标识" className="mb-4 block">
        <AutoInput
          className="text-xs"
          minChars={8}
          value={scene.heading}
          onChange={(e) => updateScene(episodeId, scene.id, { heading: e.target.value })}
          placeholder="内景 - 地点 - 时间"
        />
      </Field>

      <div className="flex flex-col gap-1 divide-y divide-border/10">
        {shots.length === 0 ? (
          <button
            type="button"
            onClick={() => addShot(episodeId, scene.id)}
            className="py-6 text-left text-xs text-muted-foreground/80 underline-offset-2 hover:text-foreground hover:underline"
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
    </section>
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
    <section className="border-b border-border/15 pb-6 last:border-b-0">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-sm font-semibold">场景 {index + 1}</span>
        <div className="flex gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
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

      <Field label="场景头" className="mb-3 block">
        <AutoInput
          className="text-xs"
          minChars={8}
          value={scene.heading}
          onChange={(e) => updateScene(episodeId, scene.id, { heading: e.target.value })}
          placeholder="内景 - 地点 - 时间"
        />
      </Field>

      <Field label="动作描述" className="mb-4 block w-full">
        <AutoTextarea
          minRows={2}
          value={scene.action}
          onChange={(e) => updateScene(episodeId, scene.id, { action: e.target.value })}
          placeholder="场景动作与环境描写…"
        />
      </Field>

      <div className="flex flex-col">
        <span className={cn(labelClass, 'mb-2')}>对白</span>
        {scene.dialogues.length === 0 ? (
          <button
            type="button"
            onClick={() => addDialogue(episodeId, scene.id)}
            className="py-2 text-left text-xs text-muted-foreground/80 underline-offset-2 hover:text-foreground hover:underline"
          >
            暂无对白，点击添加
          </button>
        ) : (
          <DialogueSheet>
            {scene.dialogues.map((d, di) => (
              <DialogueRuledBlock
                key={d.id}
                ruled={di < scene.dialogues.length - 1}
              >
                <DialogueEntry
                  speaker={formatSpeaker(d.character, d.parenthetical)}
                  line={d.line}
                  speakerPlaceholder="角色（括号注）"
                  linePlaceholder="对白内容"
                  speakerClassName="text-sm"
                  onSpeakerChange={(raw) => {
                    const parsed = parseSpeaker(raw)
                    updateDialogue(episodeId, scene.id, d.id, parsed)
                  }}
                  onLineChange={(line) =>
                    updateDialogue(episodeId, scene.id, d.id, { line })
                  }
                  onRemove={() => removeDialogue(episodeId, scene.id, d.id)}
                  removeLabel={`删除对白 ${di + 1}`}
                />
              </DialogueRuledBlock>
            ))}
          </DialogueSheet>
        )}
      </div>
    </section>
  )
}

function isShotScene(scene: Scene) {
  return Boolean(scene.shots && scene.shots.length > 0)
}

export function Canvas() {
  const {
    getActiveEpisode,
    getEpisodeBlocker,
    addScene,
    generateEpisode,
    apiConnected,
    selectedSchema,
    currentScreenplay,
  } = useAppStore()
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
  const blockerNum = getEpisodeBlocker(episode.id)
  const isAiVideo =
    selectedSchema === 'ai_video' || currentScreenplay?.schemaType === 'ai_video'

  return (
    <div className="relative min-h-0 min-w-0 flex-1 overflow-auto bg-background">
      <div className="w-full px-6 py-6">
        <div className="mb-5 border-b border-border/20 pb-4">
          <h2 className="text-lg font-semibold">
            第 {episode.episodeNum} 集 · {episode.title}
          </h2>
          {chapterLabel && (
            <p className="mt-1 text-xs text-muted-foreground">源章节：{chapterLabel}</p>
          )}
          <p className="mt-1 text-xs text-muted-foreground/80">
            画布即 source of truth ·{' '}
            {isAiVideo ? '可编辑分镜、对白与 generation_prompt' : '可手动增删场景与对白'}
          </p>
        </div>

        <div className="flex w-full flex-col gap-2">
          {episode.status === 'generating' ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin text-primary" />
              AI 正在生成本集初稿…
            </div>
          ) : scenes.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center text-sm text-muted-foreground">
              <span>{episode.status === 'failed' ? '本集生成失败' : '本集暂无内容'}</span>
              {apiConnected &&
                (blockerNum !== null ? (
                  <span className="text-xs text-muted-foreground">
                    需先完成第 {blockerNum} 集（剧集按顺序依赖前文生成）
                  </span>
                ) : (
                  <Button size="sm" onClick={() => void generateEpisode(episode.id)}>
                    <Sparkles className="h-4 w-4" />
                    {episode.status === 'failed' ? '重新生成本集' : 'AI 生成本集'}
                  </Button>
                ))}
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
                <SceneEditor key={scene.id} episodeId={episode.id} scene={scene} index={i} />
              ),
            )
          )}

          {episode.status !== 'generating' && (
            <Button
              type="button"
              variant="ghost"
              className="mt-2 w-full text-muted-foreground"
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
