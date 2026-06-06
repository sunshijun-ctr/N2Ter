import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2, Loader2, Circle, XCircle } from 'lucide-react'
import type { ReactNode } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
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
      <PageHeader
        title="预处理进度"
        description={
          currentNovel
            ? `《${currentNovel.title}》· ${apiConnected ? (preprocessWsConnected ? '实时进度已连接' : '同步进度中…') : 'mock 状态映射'}`
            : '请先上传小说'
        }
        actions={
          canContinue ? (
            <Button size="sm" onClick={() => navigate('/overview')}>
              进入概览
            </Button>
          ) : undefined
        }
      />
      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-2xl">
          {!currentNovel ? (
            <p className="text-center text-sm text-muted-foreground">请先在「上传小说」页创建项目</p>
          ) : (
            <>
              {preprocessDetail && (
                <p className="mb-4 text-center text-sm text-muted-foreground">{preprocessDetail}</p>
              )}
              <Card>
                <CardContent className="p-2">
                  <ul className="flex flex-col">
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
                            'flex items-start gap-3 rounded-md p-3',
                            state === 'running' && 'bg-accent/50',
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
        </div>
      </div>
    </>
  )
}
