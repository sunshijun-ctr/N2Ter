import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type PageShellProps = {
  children: ReactNode
  className?: string
  /** 内容区最大宽度 */
  width?: 'md' | 'lg' | 'xl' | 'full'
}

const widthClass = {
  md: 'max-w-2xl',
  lg: 'max-w-4xl',
  xl: 'max-w-5xl',
  full: 'max-w-none',
} as const

/** 各业务页统一内容区：居中、留白、可滚动 */
export function PageShell({ children, className, width = 'lg' }: PageShellProps) {
  return (
    <div className="flex-1 overflow-auto">
      <div
        className={cn(
          'mx-auto w-full px-6 py-8 sm:px-8',
          widthClass[width],
          className,
        )}
      >
        {children}
      </div>
    </div>
  )
}
