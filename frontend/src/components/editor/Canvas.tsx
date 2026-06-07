import { useEffect, useState } from 'react'
import {
  Check,
  Clapperboard,
  Loader2,
  MessageSquarePlus,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AutoInput } from '@/components/ui/auto-input'
import { AutoTextarea } from '@/components/ui/auto-textarea'
import { DialogueLine } from '@/components/ui/dialogue-line'
import { useAppStore } from '@/stores/useAppStore'
import type { AgentStep, Scene, Shot } from '@/lib/types'
import { cn, formatSourceChapters } from '@/lib/utils'

const labelClass = 'text-[11px] font-medium uppercase tracking-wide text-muted-foreground/80'

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
    <div className="relative rounded-md border-l-2 border-red-300/35 bg-background/40 py-1 pl-4 dark:border-red-400/25">
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
        ruled && 'border-b border-slate-300/60 dark:border-slate-600/45',
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
    <div className="relative w-full min-w-0 pr-9">
      <AutoInput
        className={cn('font-semibold text-foreground', speakerClassName)}
        minChars={3}
        value={speaker}
        onChange={(e) => onSpeakerChange(e.target.value)}
        placeholder={speakerPlaceholder}
      />
      <DialogueLine
        className="mt-1 pl-4 sm:pl-8"
        value={line}
        onChange={onLineChange}
        placeholder={linePlaceholder}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="absolute right-0 top-0 h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
        onClick={onRemove}
        aria-label={removeLabel}
      >
        <Trash2 className="h-3.5 w-3.5" />
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
        <Field label="主体">
          <AutoInput
            className="text-xs"
            minChars={3}
            value={shot.subject ?? ''}
            onChange={(e) =>
              updateShot(episodeId, sceneId, shot.id, {
                subject: e.target.value || undefined,
              })
            }
            placeholder="画面主体角色"
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
    <section className="rounded-xl border border-border/40 bg-background/60 p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Clapperboard className="h-4 w-4 shrink-0 text-primary/80" />
          <span className="font-manuscript text-base font-semibold tracking-tight">
            场景 {index + 1}
          </span>
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
          block
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
    <section className="rounded-xl border border-border/40 bg-background/60 p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-2">
        <span className="font-manuscript text-base font-semibold tracking-tight text-foreground">
          场景 {index + 1}
        </span>
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
          block
          className="font-manuscript text-sm font-medium tracking-wide"
          minChars={8}
          value={scene.heading}
          onChange={(e) => updateScene(episodeId, scene.id, { heading: e.target.value })}
          placeholder="内景 - 地点 - 时间"
        />
      </Field>

      <Field label="动作描述" className="mb-5 block w-full">
        <AutoTextarea
          className="font-manuscript text-[15px] leading-relaxed"
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

/** 生成进度面板里的一行步骤：完成 / 进行中 / 失败 三态。 */
function StepRow({ state, text }: { state: 'done' | 'running' | 'failed'; text: string }) {
  return (
    <li className="flex items-start gap-2 text-sm">
      <span className="mt-0.5 shrink-0">
        {state === 'done' ? (
          <Check className="h-3.5 w-3.5 text-primary" />
        ) : state === 'failed' ? (
          <X className="h-3.5 w-3.5 text-destructive" />
        ) : (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
        )}
      </span>
      <span
        className={cn(
          'leading-snug',
          state === 'running' ? 'text-foreground' : 'text-muted-foreground',
        )}
      >
        {text}
        {state === 'running' && (
          <span className="ml-1.5 text-xs text-muted-foreground">· 进行中…</span>
        )}
      </span>
    </li>
  )
}

/** 生成进度面板：自带一个一直在走的计时器，让用户随时能判断「还在干活 vs 卡死」。
 *  只在本集处于 generating 时挂载，挂载时刻即生成起点。 */
function GenerationProgress({
  steps,
  canReset,
  onReset,
}: {
  steps: AgentStep[]
  canReset: boolean
  onReset: () => void
}) {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setElapsed((s) => s + 1), 1000)
    return () => clearInterval(t)
  }, [])
  const mmss = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`
  // 计时器在涨、step 在涨 → 在干活；超过这个阈值还没动静，提示可能卡住。
  const looksStuck = elapsed > 90 && steps.length === 0

  // 场景是并发起草的，事件天然乱序到达；这里整理成「按场号有序 + 每场独立状态」。
  const hasPlan = steps.some((s) => s.phase === 'plan')
  const doneScenes = new Set(
    steps.filter((s) => s.phase === 'draft_done').map((s) => s.stepIndex),
  )
  const failedScenes = new Set(
    steps.filter((s) => s.phase === 'draft_failed').map((s) => s.stepIndex),
  )
  const draftScenes = Array.from(
    new Map(steps.filter((s) => s.phase === 'draft').map((s) => [s.stepIndex, s])).values(),
  ).sort((a, b) => a.stepIndex - b.stepIndex)
  const planDone = draftScenes.length > 0
  const researchOnly = draftScenes.length === 0 && steps.some((s) => s.phase === 'research')

  return (
    <div className="rounded-lg border border-dashed border-border/60 p-5">
      <div className="mb-3 flex items-center justify-between gap-2 text-sm font-medium text-foreground">
        <span className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          AI 正在生成本集 · agent 执行过程
        </span>
        <span className="font-mono text-xs tabular-nums text-muted-foreground">已用时 {mmss}</span>
      </div>
      {steps.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {looksStuck
            ? '已等待较久仍无进展，可能因服务重启中断；可重置本集后重试。'
            : '正在准备 · AI 正在思考，首步可能需要几十秒…'}
        </p>
      ) : (
        <ol className="flex flex-col gap-2">
          {hasPlan && (
            <StepRow state={planDone ? 'done' : 'running'} text="规划本集场景大纲" />
          )}
          {researchOnly && <StepRow state="running" text="检索原著资料…" />}
          {draftScenes.map((s) => {
            const state = failedScenes.has(s.stepIndex)
              ? 'failed'
              : doneScenes.has(s.stepIndex)
                ? 'done'
                : 'running'
            return <StepRow key={s.stepIndex} state={state} text={s.label || `撰写第 ${s.stepIndex} 场`} />
          })}
        </ol>
      )}
      {canReset && (
        <div className="mt-4 flex items-center gap-2 border-t border-border/40 pt-3">
          <span className="text-xs text-muted-foreground">
            卡住不动了？（如服务重启过）可重置本集后重新生成
          </span>
          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={onReset}>
            <RotateCcw className="h-3.5 w-3.5" />
            重置本集
          </Button>
        </div>
      )}
    </div>
  )
}

export function Canvas() {
  const {
    getActiveEpisode,
    getEpisodeBlocker,
    addScene,
    generateEpisode,
    resetEpisode,
    apiConnected,
    selectedSchema,
    currentScreenplay,
    agentStepsByEpisode,
  } = useAppStore()
  const episode = getActiveEpisode()

  if (!episode) {
    return (
      <div className="manuscript-surface flex flex-1 flex-col items-center justify-center px-6 text-center">
        <p className="font-manuscript text-base text-muted-foreground">请选择上方分集开始编辑</p>
        <p className="mt-1 text-xs text-muted-foreground/80">画布内容会随分集切换自动保存到本地会话</p>
      </div>
    )
  }

  const chapterLabel = formatSourceChapters(episode.sourceChapters)
  const scenes = episode.content.scenes ?? []
  const blockerNum = getEpisodeBlocker(episode.id)
  const agentSteps = agentStepsByEpisode[episode.id] ?? []
  const isAiVideo =
    selectedSchema === 'ai_video' || currentScreenplay?.schemaType === 'ai_video'

  return (
    <div className="manuscript-surface relative min-h-0 min-w-0 flex-1 overflow-auto">
      <div className="mx-auto w-full max-w-manuscript px-6 py-8 sm:px-10">
        <header className="mb-8 border-b border-border/50 pb-5">
          <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
            第 {episode.episodeNum} 集
          </p>
          <h2 className="mt-1 font-display text-2xl font-normal leading-tight tracking-tight">
            {episode.title}
          </h2>
          {chapterLabel && (
            <p className="mt-2 text-xs text-muted-foreground">源章节 · {chapterLabel}</p>
          )}
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground/85">
            {isAiVideo
              ? '编辑分镜、对白与 generation_prompt · 保存后写入本集 JSON'
              : '场景与对白可直接编辑 · 作业本横线分隔每句对白'}
          </p>
        </header>

        <div className="flex w-full flex-col gap-6">
          {episode.status === 'generating' ? (
            <GenerationProgress
              steps={agentSteps}
              canReset={apiConnected}
              onReset={() => void resetEpisode(episode.id)}
            />
          ) : scenes.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center text-sm text-muted-foreground">
              <span>{episode.status === 'failed' ? '本集生成失败' : '本集暂无内容'}</span>
              {episode.status === 'failed' && episode.errorMessage && (
                <span className="max-w-md text-xs text-muted-foreground/80">
                  {episode.errorMessage}
                </span>
              )}
              {apiConnected &&
                (blockerNum !== null ? (
                  <span className="text-xs text-muted-foreground">
                    需先完成第 {blockerNum} 集（剧集按顺序依赖前文生成）
                  </span>
                ) : (
                  <div className="flex items-center gap-2">
                    <Button size="sm" onClick={() => void generateEpisode(episode.id)}>
                      <Sparkles className="h-4 w-4" />
                      {episode.status === 'failed' ? '重新生成本集' : 'AI 生成本集'}
                    </Button>
                    {episode.status === 'failed' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground"
                        onClick={() => void resetEpisode(episode.id)}
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        重置
                      </Button>
                    )}
                  </div>
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
              variant="outline"
              className="mt-2 w-full border-dashed text-muted-foreground hover:text-foreground"
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
