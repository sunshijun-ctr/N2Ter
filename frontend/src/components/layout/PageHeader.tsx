import type { ReactNode } from 'react'

interface PageHeaderProps {
  title: string
  description?: string
  actions?: ReactNode
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b px-6">
      <div>
        <h1 className="text-base font-semibold leading-tight">{title}</h1>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      {actions}
    </header>
  )
}
