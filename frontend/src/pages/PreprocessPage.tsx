import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2, Loader2, Circle, XCircle } from 'lucide-react'
import type { ReactNode } from 'react'
import { PageShell } from '@/components/layout/PageShell'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/stores/useAppStore'
import {
  PREPROCESS_STAGE_DEFS,
  PREPROCESS_STAGE_DESC,
  stagesFromNovelStatus,
  type StageUiState,
} from '@/lib/preprocess-stages'

const stateIcon: Record<StageUiState, ReactNode> = {
  done: <CheckCircle2 className="h-5 w-5 text-primary" />,
  running: <Loader2 className="h-5 w-5 animate-spin text-primary" />,
  pending: <Circle className="h-5 w-5 text-muted-foreground/40" />,
  failed: <XCircle className="h-5 w-5 text-destructive" />,
}

export function PreprocessPage() {
  const navigate = useNavigate()
  const {
    currentNovel,
    apiConnected,
    preprocessStages,
    preprocessDetail,
    preprocessStageDetails,
    preprocessWsConnected,
    preprocessDone,
    startPreprocessWs,
    stopPreprocessWs,
  } = useAppStore()

  const novelId = currentNovel?.id

  const states = apiConnected
    ? preprocessStages
    : currentNovel
      ? stagesFromNovelStatus(currentNovel.status)
      : stagesFromNovelStatus('preprocessing')

  useEffect(() => {
    if (!apiConnected || !novelId) return
    void startPreprocessWs()
    return () => stopPreprocessWs()
  }, [apiConnected, novelId, startPreprocessWs, stopPreprocessWs])

  const canContinue = currentNovel?.status === 'ready_for_planning' || preprocessDone

  return (
    <>
      <PageShell width="md">
          {!currentNovel ? (
            <div className="glass-panel rounded-xl px-6 py-12 text-center">
              <p className="text-sm text-muted-foreground">请先在「上传」页创建项目</p>
            </div>
          ) : (
            <>
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                  《{currentNovel.title}》·{' '}
                  {apiConnected
                    ? preprocessWsConnected
                      ? '实时进度已连接'
                      : '同步进度中…'
                    : 'mock 状态映射'}
                </p>
                {canContinue && (
                  <Button size="sm" onClick={() => navigate('/overview')}>
                    进入概览
                  </Button>
                )}
              </div>
              {preprocessDetail && (
                <p className="mb-5 text-center text-sm leading-relaxed text-muted-foreground">
                  {preprocessDetail}
                </p>
              )}
              <Card>
                <CardContent className="p-3">
                  <ul className="flex flex-col gap-1">
                    {PREPROCESS_STAGE_DEFS.map((s, i) => {
                      const state = states[i]
                      const liveDetail = preprocessStageDetails[i]
                      const desc =
                        state === 'running' && liveDetail
                          ? liveDetail
                          : state === 'done' && liveDetail
                            ? liveDetail
                            : PREPROCESS_STAGE_DESC[s.descKey]
                      return (
                        <li
                          key={s.name}
                          className={cn(
                            'flex items-start gap-3 rounded-xl px-3 py-3 transition-colors duration-200',
                            state === 'running' && 'bg-accent/60 shadow-sm',
                            state === 'done' && 'opacity-90',
                          )}
                        >
                          <div className="mt-0.5">{stateIcon[state]}</div>
                          <div className="flex-1">
                            <div className="text-sm font-medium">
                              Stage {i + 1} · {s.name}
                            </div>
                            <p className="text-xs text-muted-foreground">{desc}</p>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                </CardContent>
              </Card>
            </>
          )}
      </PageShell>
    </>
  )
}
