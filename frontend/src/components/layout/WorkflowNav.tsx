import { Link, useLocation } from 'react-router-dom'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/stores/useAppStore'

export const WORKFLOW_STEPS = [
  { label: '上传', path: '/' },
  { label: '预处理', path: '/preprocess' },
  { label: '概览', path: '/overview' },
  { label: '剧本类型', path: '/schema-select' },
  { label: '改编方案', path: '/adaptation-plan', detailedOnly: true },
  { label: '工作区', path: '/editor' },
] as const

export function getWorkflowActiveIndex(pathname: string): number {
  const idx = WORKFLOW_STEPS.findIndex((s) => s.path === pathname)
  return idx
}

export function isWorkflowRoute(pathname: string): boolean {
  return getWorkflowActiveIndex(pathname) >= 0
}

function useMaxReachableStep(): number {
  const currentNovel = useAppStore((s) => s.currentNovel)
  const preprocessDone = useAppStore((s) => s.preprocessDone)
  const selectedSchema = useAppStore((s) => s.selectedSchema)
  const planConfirmed = useAppStore((s) => s.planConfirmed)
  const currentScreenplay = useAppStore((s) => s.currentScreenplay)
  const adaptationPlan = useAppStore((s) => s.adaptationPlan)

  if (planConfirmed || currentScreenplay) return 5

  const isDetailed =
    selectedSchema === 'ai_video' || selectedSchema === 'screenwriter'

  if (isDetailed && adaptationPlan?.items.length) return 4
  if (selectedSchema) return 3

  if (currentNovel?.status === 'ready_for_planning' || preprocessDone) return 2
  if (currentNovel) return 1
  return 0
}

function stepReachable(
  index: number,
  maxReachable: number,
  selectedSchema: ReturnType<typeof useAppStore.getState>['selectedSchema'],
): boolean {
  if (index > maxReachable) return false
  const step = WORKFLOW_STEPS[index]
  if ('detailedOnly' in step && step.detailedOnly && selectedSchema === 'overview') return false
  if (index === 5 && selectedSchema === 'overview') return false
  return true
}

export function WorkflowNav() {
  const { pathname } = useLocation()
  const activeIndex = getWorkflowActiveIndex(pathname)
  const maxReachable = useMaxReachableStep()
  const selectedSchema = useAppStore((s) => s.selectedSchema)
  const compact = pathname === '/editor'

  if (activeIndex < 0) return null

  return (
    <nav
      aria-label="改编流程"
      className={cn(
        'glass-panel shrink-0 border-b border-border/40 px-3 sm:px-4',
        compact ? 'py-1' : 'py-2.5 sm:px-6',
      )}
    >
      <div className="mx-auto flex w-full max-w-5xl justify-center overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <ol className="inline-flex min-w-min items-center gap-0.5">
        {WORKFLOW_STEPS.map((step, i) => {
          const state =
            i < activeIndex ? 'done' : i === activeIndex ? 'current' : 'upcoming'
          const reachable = stepReachable(i, maxReachable, selectedSchema)
          const skipped =
            'detailedOnly' in step && step.detailedOnly && selectedSchema === 'overview' && i <= maxReachable

          const pillClass = cn(
            'inline-flex items-center gap-1 rounded-md transition-colors duration-200',
            compact ? 'px-1.5 py-0.5 text-[11px]' : 'gap-1.5 rounded-lg px-2.5 py-1.5 text-xs',
            state === 'current' && 'bg-primary/10 font-semibold text-primary',
            state === 'done' && reachable && 'text-foreground/85 hover:bg-accent/50',
            state === 'done' && !reachable && 'text-muted-foreground/50',
            state === 'upcoming' && reachable && 'text-muted-foreground hover:bg-accent/40 hover:text-foreground',
            state === 'upcoming' && !reachable && 'text-muted-foreground/45',
            skipped && 'opacity-50',
          )

          return (
            <li key={step.path} className="flex shrink-0 items-center">
              {i > 0 && (
                <span
                  className="mx-1 hidden h-px w-4 shrink-0 bg-border/70 sm:block"
                  aria-hidden
                />
              )}
              {reachable && i !== activeIndex ? (
                <Link to={step.path} className={cn(pillClass, 'cursor-pointer')}>
                  <StepBadge index={i} state={state} compact={compact} />
                  <span>{step.label}</span>
                </Link>
              ) : (
                <span
                  className={pillClass}
                  aria-current={state === 'current' ? 'step' : undefined}
                >
                  <StepBadge index={i} state={state} compact={compact} />
                  <span>{step.label}</span>
                </span>
              )}
            </li>
          )
        })}
        </ol>
      </div>
    </nav>
  )
}

function StepBadge({
  index,
  state,
  compact = false,
}: {
  index: number
  state: 'done' | 'current' | 'upcoming'
  compact?: boolean
}) {
  const size = compact ? 'h-4 w-4' : 'h-5 w-5'
  if (state === 'done') {
    return (
      <span
        className={cn(
          'flex shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary',
          size,
        )}
      >
        <Check className={cn(compact ? 'h-2.5 w-2.5' : 'h-3 w-3')} strokeWidth={2.5} />
      </span>
    )
  }
  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full font-semibold tabular-nums',
        size,
        compact ? 'text-[9px]' : 'text-[10px]',
        state === 'current'
          ? 'bg-primary text-primary-foreground'
          : 'bg-muted text-muted-foreground',
      )}
    >
      {index + 1}
    </span>
  )
}
