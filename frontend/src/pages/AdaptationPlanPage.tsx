import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  BookCopy,
  Layers,
  Minus,
  Plus,
  RefreshCw,
  Sparkles,
} from 'lucide-react'
import { PageShell } from '@/components/layout/PageShell'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { buildAdaptationPlan } from '@/lib/adaptation'
import { useAppStore } from '@/stores/useAppStore'
import { cn, formatSourceChapters } from '@/lib/utils'
import type { AdaptationPlanItem } from '@/lib/types'

const MIN_EPISODES = 1
const MAX_EPISODES = 120

function StatTile({
  label,
  value,
  hint,
}: {
  label: string
  value: string
  hint?: string
}) {
  return (
    <div className="glass-panel rounded-xl px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/75">
        {label}
      </p>
      <p className="mt-1 font-display text-2xl tracking-tight text-foreground">{value}</p>
      {hint && <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  )
}

function EpisodePlanRow({ item }: { item: AdaptationPlanItem }) {
  const rangeLabel = formatSourceChapters(item.sourceChapters)
  const dense = item.sourceChapters.length > 6

  return (
    <div className="group flex gap-4 rounded-xl border border-border/40 bg-background/50 px-4 py-3.5 transition-colors hover:border-primary/20 hover:bg-accent/20">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-sm font-semibold tabular-nums text-primary">
        {item.episodeNum}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">第 {item.episodeNum} 集</span>
          {rangeLabel && (
            <span className="rounded-full bg-secondary px-2.5 py-0.5 text-[11px] font-medium text-secondary-foreground">
              {rangeLabel}
            </span>
          )}
          <span className="text-[11px] text-muted-foreground">
            {item.sourceChapters.length} 章
          </span>
        </div>
        {!dense && item.sourceChapters.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {item.sourceChapters.map((ch) => (
              <span
                key={ch}
                className="rounded-md border border-border/50 bg-card/80 px-2 py-0.5 text-[11px] tabular-nums text-muted-foreground"
              >
                第 {ch} 章
              </span>
            ))}
          </div>
        )}
        {item.oneLineSummary && (
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {item.oneLineSummary}
          </p>
        )}
      </div>
    </div>
  )
}

export function AdaptationPlanPage() {
  const navigate = useNavigate()
  const {
    currentNovel,
    selectedSchema,
    adaptationPlan,
    setAdaptationPlan,
    confirmPlan,
    fetchAdaptationPlan,
    apiConnected,
  } = useAppStore()

  const totalChapters = adaptationPlan?.totalChapters ?? 80
  const [episodeCount, setEpisodeCount] = useState(adaptationPlan?.episodeCount ?? 36)
  const [regenerating, setRegenerating] = useState(false)
  const [confirming, setConfirming] = useState(false)

  const fetchedRef = useRef(false)
  useEffect(() => {
    if (!apiConnected || !currentNovel || fetchedRef.current) return
    if (!selectedSchema || selectedSchema === 'overview') return
    fetchedRef.current = true
    void fetchAdaptationPlan()
  }, [apiConnected, currentNovel?.id, selectedSchema, fetchAdaptationPlan])

  useEffect(() => {
    if (adaptationPlan?.episodeCount) setEpisodeCount(adaptationPlan.episodeCount)
  }, [adaptationPlan?.episodeCount])

  const plan = adaptationPlan
  const schemaLabel =
    selectedSchema === 'ai_video'
      ? 'AI 视频版'
      : selectedSchema === 'screenwriter'
        ? '编剧工作版'
        : '详细版'

  function clampCount(n: number) {
    return Math.max(MIN_EPISODES, Math.min(MAX_EPISODES, Math.min(n, totalChapters)))
  }

  function applyEpisodeCount(count: number) {
    const next = clampCount(count)
    setEpisodeCount(next)
    setAdaptationPlan(
      buildAdaptationPlan(totalChapters, next, currentNovel?.title ?? ''),
    )
  }

  async function handleRegenerate() {
    setRegenerating(true)
    const chaptersPerEpisode = Math.max(1, Math.ceil(totalChapters / episodeCount))
    if (apiConnected) {
      await fetchAdaptationPlan(chaptersPerEpisode)
    } else {
      await new Promise((r) => setTimeout(r, 800))
      setAdaptationPlan(
        buildAdaptationPlan(totalChapters, episodeCount, currentNovel?.title ?? ''),
      )
    }
    setRegenerating(false)
  }

  async function handleConfirm() {
    setConfirming(true)
    try {
      await confirmPlan()
      navigate('/editor')
    } catch {
      /* error shown in global banner */
    } finally {
      setConfirming(false)
    }
  }

  if (!selectedSchema || selectedSchema === 'overview') {
    return (
      <PageShell width="md" className="flex flex-col items-center justify-center gap-4 text-center">
        <p className="text-sm text-muted-foreground">概览版不需要改编方案确认。</p>
        <Button onClick={() => navigate('/schema-select')}>去选择剧本类型</Button>
      </PageShell>
    )
  }

  const chaptersPerEp = (totalChapters / Math.max(episodeCount, 1)).toFixed(1)

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <PageShell width="lg" className="pb-28">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {currentNovel ? `《${currentNovel.title}》· ` : ''}
            {schemaLabel} · 确认集数与章节映射
          </p>
          <Button variant="outline" size="sm" onClick={() => navigate('/schema-select')}>
            更换类型
          </Button>
        </div>
          {plan?.reasoning && (
            <Card className="mb-6 border-primary/15 bg-gradient-to-br from-accent/40 to-background/40">
              <CardContent className="flex gap-3 p-5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <Sparkles className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-primary/80">
                    AI 建议
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-foreground/90">{plan.reasoning}</p>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="mb-6 grid gap-3 sm:grid-cols-3">
            <StatTile label="全书章节" value={String(totalChapters)} hint="源小说章节总数" />
            <StatTile
              label="计划集数"
              value={String(episodeCount)}
              hint={`约 ${chaptersPerEp} 章 / 集`}
            />
            <StatTile
              label="输出形态"
              value={schemaLabel.replace('版', '')}
              hint="确认后将创建对应剧本"
            />
          </div>

          <div className="glass-panel-strong mb-6 rounded-xl p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm font-semibold">调整集数</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  修改后点击重新分配，AI 会刷新下方映射方案
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center rounded-xl border border-border/60 bg-background/70 p-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9"
                    aria-label="减少集数"
                    disabled={episodeCount <= MIN_EPISODES}
                    onClick={() => applyEpisodeCount(episodeCount - 1)}
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  <input
                    type="number"
                    min={MIN_EPISODES}
                    max={Math.min(MAX_EPISODES, totalChapters)}
                    value={episodeCount}
                    onChange={(e) => applyEpisodeCount(Number(e.target.value) || MIN_EPISODES)}
                    aria-label="集数"
                    className="h-9 w-16 border-0 bg-transparent text-center text-base font-semibold tabular-nums outline-none focus:ring-0"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9"
                    aria-label="增加集数"
                    disabled={episodeCount >= Math.min(MAX_EPISODES, totalChapters)}
                    onClick={() => applyEpisodeCount(episodeCount + 1)}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <span className="text-sm text-muted-foreground">集</span>
                <Button variant="outline" disabled={regenerating} onClick={() => void handleRegenerate()}>
                  <RefreshCw className={cn('h-4 w-4', regenerating && 'animate-spin')} />
                  {regenerating ? '分配中…' : '重新分配'}
                </Button>
              </div>
            </div>
          </div>

          <section>
            <div className="mb-4 flex items-end justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 text-base font-semibold">
                  <Layers className="h-4 w-4 text-primary/80" />
                  章节映射预览
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  每集覆盖的源章节范围 · 共 {plan?.items.length ?? 0} 集
                </p>
              </div>
              <BookCopy className="hidden h-5 w-5 text-muted-foreground/40 sm:block" />
            </div>
            <div className="max-h-[min(52vh,520px)] space-y-2 overflow-auto pr-1">
              {plan?.items.map((item) => (
                <EpisodePlanRow key={item.episodeNum} item={item} />
              ))}
            </div>
          </section>
        </PageShell>

        <div className="glass-panel-strong absolute inset-x-0 bottom-0 border-t border-border/50 px-6 py-4 shadow-panel">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
            <Button variant="outline" onClick={() => navigate('/schema-select')}>
              <ArrowLeft className="h-4 w-4" />
              上一步
            </Button>
            <p className="hidden text-xs text-muted-foreground sm:block">
              确认后将创建 {schemaLabel} 并进入剧本工作台
            </p>
            <Button size="lg" disabled={confirming || !plan?.items.length} onClick={() => void handleConfirm()}>
              {confirming ? '创建中…' : '确认并进入工作区'}
              {!confirming && <ArrowRight className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </div>
  )
}
