import { useState } from 'react'
import { Sparkles, Wand2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { LoadingSpinner } from '@/components/ui/loading'
import { useAppStore } from '@/stores/useAppStore'

const SUGGESTIONS = [
  '所有角色情绪更兴奋、节奏更快',
  '冲突更强烈，台词更有张力',
  '增加细节与画面感，更有电影感',
  '更贴近原著的情绪基调',
]

/**
 * 「重新生成本集」按钮 + 自定义指令弹窗。
 * 只挂载在「已生成的最新一集」上（更早的集不允许重生，只能手动微调）。
 * 弹窗里填写修改方向 → 交给剧本 agent 带指令重写本集。
 */
export function RegenerateButton({
  episodeId,
  episodeNum,
  episodeTitle,
}: {
  episodeId: string
  episodeNum: number
  episodeTitle: string
}) {
  const generateEpisode = useAppStore((s) => s.generateEpisode)
  const [open, setOpen] = useState(false)
  const [instruction, setInstruction] = useState('')
  const [submitting, setSubmitting] = useState(false)

  function close() {
    if (submitting) return
    setOpen(false)
  }

  async function handleConfirm() {
    const trimmed = instruction.trim()
    if (!trimmed) return
    setSubmitting(true)
    // generateEpisode 会把本集置为 generating 并开始流式展示执行过程；
    // 这里发起后即可关闭弹窗，让用户在画布上看 agent 重写。
    void generateEpisode(episodeId, trimmed)
    setSubmitting(false)
    setOpen(false)
    setInstruction('')
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        title="按你的方向重新生成本集"
      >
        <Wand2 className="h-4 w-4" />
        重新生成本集
      </Button>

      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-foreground/20 backdrop-blur-[1px]"
            aria-label="关闭"
            onClick={close}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="regen-title"
            className="relative z-10 w-full max-w-lg rounded-lg border bg-card p-6 shadow-lg"
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 id="regen-title" className="flex items-center gap-2 text-lg font-semibold">
                  <Sparkles className="h-5 w-5 text-primary" />
                  重新生成 · 第 {episodeNum} 集
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {episodeTitle} · 描述你想要的修改方向，AI 会按此重写整集
                </p>
              </div>
              <Button variant="ghost" size="icon" onClick={close} aria-label="关闭对话框">
                <X className="h-4 w-4" />
              </Button>
            </div>

            <textarea
              autoFocus
              rows={4}
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder="例如：把所有人写得更兴奋一点，冲突更强烈，节奏更快…"
              className="w-full resize-none rounded-md border bg-background px-3 py-2 text-sm leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />

            <div className="mt-3 flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setInstruction(s)}
                  className="rounded-full border px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
                >
                  {s}
                </button>
              ))}
            </div>

            <p className="mt-4 rounded-md bg-secondary px-3 py-2 text-xs text-muted-foreground">
              重新生成会覆盖本集当前内容（后端会自动留存历史版本）。仅最新一集可重生，更早的集请手动微调。
            </p>

            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" onClick={close} disabled={submitting}>
                取消
              </Button>
              <Button onClick={() => void handleConfirm()} disabled={submitting || !instruction.trim()}>
                {submitting ? <LoadingSpinner /> : <Wand2 className="h-4 w-4" />}
                按此重新生成
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
