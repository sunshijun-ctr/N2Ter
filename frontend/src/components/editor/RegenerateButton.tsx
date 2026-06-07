import { useState } from 'react'
import { Sparkles, Wand2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { LoadingSpinner } from '@/components/ui/loading'
import { Modal } from '@/components/ui/modal'
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

      <Modal open={open} onClose={close} titleId="regen-title" closeOnBackdrop={!submitting}>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-5 sm:p-6">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 id="regen-title" className="flex items-center gap-2 text-base font-semibold sm:text-lg">
                <Sparkles className="h-5 w-5 shrink-0 text-primary" aria-hidden />
                重新生成 · 第 {episodeNum} 集
              </h2>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                <span className="font-medium text-foreground/90">{episodeTitle}</span>
                <span className="text-muted-foreground"> · 描述修改方向，AI 将按此重写整集</span>
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={close}
              disabled={submitting}
              aria-label="关闭对话框"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <label htmlFor="regen-instruction" className="text-xs font-medium text-muted-foreground">
            修改方向
          </label>
          <textarea
            id="regen-instruction"
            autoFocus
            rows={4}
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="例如：把所有人写得更兴奋一点，冲突更强烈，节奏更快…"
            className="mt-1.5 w-full resize-none rounded-lg border border-border/60 bg-background px-3 py-2.5 text-sm leading-relaxed outline-none transition-colors focus-visible:border-primary/40 focus-visible:ring-2 focus-visible:ring-primary/15"
          />

          <div className="mt-3 flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setInstruction(s)}
                className="cursor-pointer rounded-full border border-border/60 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:bg-accent/40 hover:text-foreground"
              >
                {s}
              </button>
            ))}
          </div>

          <p className="mt-4 rounded-lg bg-muted/50 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
            重新生成会覆盖本集当前内容（后端会自动留存历史版本）。仅最新一集可重生，更早的集请手动微调。
          </p>

          <div className="mt-5 flex shrink-0 justify-end gap-2 border-t border-border/40 pt-4">
            <Button variant="outline" onClick={close} disabled={submitting}>
              取消
            </Button>
            <Button onClick={() => void handleConfirm()} disabled={submitting || !instruction.trim()}>
              {submitting ? <LoadingSpinner /> : <Wand2 className="h-4 w-4" />}
              按此重新生成
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
