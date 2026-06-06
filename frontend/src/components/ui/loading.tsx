import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export function LoadingSpinner({ className }: { className?: string }) {
  return <Loader2 className={cn('h-5 w-5 animate-spin text-primary', className)} />
}

export function PageLoading({ message = '加载中…' }: { message?: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-muted-foreground">
      <LoadingSpinner className="h-8 w-8" />
      <p className="text-sm">{message}</p>
    </div>
  )
}

export function LoadingOverlay({ message }: { message?: string }) {
  return (
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-2 bg-background/70 backdrop-blur-[1px]">
      <LoadingSpinner className="h-8 w-8" />
      {message && <p className="text-sm text-muted-foreground">{message}</p>}
    </div>
  )
}
