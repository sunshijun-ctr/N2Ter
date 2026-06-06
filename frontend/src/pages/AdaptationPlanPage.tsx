import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Minus, Plus, RefreshCw, Sparkles } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { buildAdaptationPlan } from '@/lib/adaptation'
import { useAppStore } from '@/stores/useAppStore'
import { cn } from '@/lib/utils'

const MIN_EPISODES = 1
const MAX_EPISODES = 120

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
      <>
        <PageHeader title="改编方案" description="请先选择 AI 视频版或编剧工作版" />
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6">
          <p className="text-sm text-muted-foreground">概览版不需要改编方案确认。</p>
          <Button onClick={() => navigate('/schema-select')}>去选择剧本类型</Button>
        </div>
      </>
    )
  }

  return (
    <>
      <PageHeader
        title="改编方案确认"
        description={
          currentNovel
            ? `《${currentNovel.title}》· ${schemaLabel} · 强制确认环节（Design Step 5–6）`
            : `${schemaLabel} · 集→章映射方案`
        }
        actions={
          <Button variant="outline" size="sm" onClick={() => navigate('/schema-select')}>
            更换类型
          </Button>
        }
      />
      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-6">
          {plan?.reasoning && (
            <Card className="border-primary/20 bg-accent/30">
              <CardContent className="flex gap-3 p-4 text-sm">
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <p>{plan.reasoning}</p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">调整集数</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
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
                  className="h-10 w-20 rounded-md border bg-background px-3 text-center text-sm tabular-nums"
                />
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="增加集数"
                  disabled={episodeCount >= Math.min(MAX_EPISODES, totalChapters)}
                  onClick={() => applyEpisodeCount(episodeCount + 1)}
                >
                  <Plus className="h-4 w-4" />
                </Button>
                <span className="text-sm text-muted-foreground">集</span>
              </div>

              <span className="text-sm text-muted-foreground">
                全书 {totalChapters} 章 · 约 {(totalChapters / episodeCount).toFixed(1)} 章/集
              </span>

              <Button
                variant="secondary"
                className="ml-auto"
                disabled={regenerating}
                onClick={handleRegenerate}
              >
                <RefreshCw className={cn('h-4 w-4', regenerating && 'animate-spin')} />
                {regenerating ? 'AI 分配中…' : '让 AI 重新分配'}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">集 → 章映射</CardTitle>
              <span className="text-xs text-muted-foreground">
                共 {plan?.items.length ?? 0} 集
              </span>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-[420px] overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 border-b bg-card">
                    <tr className="text-left text-xs text-muted-foreground">
                      <th className="px-5 py-2 font-medium">集数</th>
                      <th className="px-5 py-2 font-medium">对应章节</th>
                      <th className="px-5 py-2 font-medium">说明</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan?.items.map((item) => (
                      <tr key={item.episodeNum} className="border-b last:border-0">
                        <td className="px-5 py-2.5 font-medium tabular-nums">
                          第 {item.episodeNum} 集
                        </td>
                        <td className="px-5 py-2.5 tabular-nums text-muted-foreground">
                          {item.sourceChapters.length === 1
                            ? `第 ${item.sourceChapters[0]} 章`
                            : `第 ${item.sourceChapters[0]}–${item.sourceChapters.at(-1)} 章`}
                          <span className="ml-2 text-xs">
                            （{item.sourceChapters.length} 章）
                          </span>
                        </td>
                        <td className="px-5 py-2.5 text-muted-foreground">
                          {item.oneLineSummary ?? '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <div className="flex items-center justify-between border-t pt-4">
            <Button variant="outline" onClick={() => navigate('/schema-select')}>
              上一步
            </Button>
            <Button size="lg" disabled={confirming} onClick={() => void handleConfirm()}>
              {confirming ? '创建剧本中…' : '确认方案，进入工作区'}
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}
