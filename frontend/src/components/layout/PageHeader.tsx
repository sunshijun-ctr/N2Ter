import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface PageHeaderProps {
  title: string
  description?: string
  actions?: ReactNode
  className?: string
}

export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  return (
    <header
      className={cn(
        'glass-panel-strong relative z-10 flex shrink-0 items-center justify-between gap-4 border-b border-border/50 px-6 py-3.5 shadow-sm',
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="truncate font-display text-xl tracking-tight text-foreground">{title}</h1>
        {description && (
          <p className="mt-1 truncate text-xs leading-relaxed text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  )
}
