import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type WorkspacePanelProps = {
  title: string
  subtitle?: ReactNode
  trailing?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
  width?: 'sm' | 'md'
}

const widthClass = {
  sm: 'w-60',
  md: 'w-[380px]',
} as const

/** 剧本工作台侧栏/对话栏统一面板壳 */
export function WorkspacePanel({
  title,
  subtitle,
  trailing,
  children,
  className,
  bodyClassName,
  width = 'sm',
}: WorkspacePanelProps) {
  return (
    <aside
      className={cn(
        'glass-panel flex shrink-0 flex-col border-border/50 bg-card/70',
        width === 'sm' ? 'border-r' : 'border-l',
        widthClass[width],
        className,
      )}
    >
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border/60 px-4">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold tracking-tight">{title}</h2>
          {subtitle && (
            <p className="truncate text-[11px] text-muted-foreground">{subtitle}</p>
          )}
        </div>
        {trailing}
      </div>
      <div className={cn('min-h-0 flex-1 overflow-auto', bodyClassName)}>{children}</div>
    </aside>
  )
}
