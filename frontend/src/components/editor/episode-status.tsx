import type { ReactNode } from 'react'
import { CheckCircle2, Circle, Loader2, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { EpisodeStatus } from '@/lib/types'

const meta: Record<
  EpisodeStatus,
  { label: string; icon: ReactNode; className: string }
> = {
  done: {
    label: '已完成',
    icon: <CheckCircle2 className="h-3.5 w-3.5" />,
    className: 'text-primary',
  },
  generating: {
    label: '生成中',
    icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />,
    className: 'text-primary',
  },
  pending: {
    label: '待生成',
    icon: <Circle className="h-3.5 w-3.5" />,
    className: 'text-muted-foreground/50',
  },
  failed: {
    label: '失败',
    icon: <XCircle className="h-3.5 w-3.5" />,
    className: 'text-destructive',
  },
}

export function EpisodeStatusBadge({ status }: { status: EpisodeStatus }) {
  const { label, icon, className } = meta[status]
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full border border-border/40 bg-background/50 px-2 py-0.5 text-[10px] font-medium',
        className,
      )}
      title={label}
    >
      {icon}
      <span>{label}</span>
    </span>
  )
}

export function EpisodeStatusIcon({ status }: { status: EpisodeStatus }) {
  return <span className={meta[status].className}>{meta[status].icon}</span>
}
