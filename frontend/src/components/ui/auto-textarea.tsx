import { useCallback, useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

type AutoTextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  minRows?: number
}

const fieldBase =
  'block w-full min-w-0 resize-none overflow-hidden bg-transparent px-1 py-1.5 font-manuscript text-[15px] leading-relaxed outline-none border-b border-border/30 transition-colors duration-200 hover:border-border/50 focus:border-primary/55 focus-visible:ring-0'

/** 全宽展示，高度随内容增长 */
export function AutoTextarea({
  className,
  value,
  minRows = 1,
  onChange,
  ...props
}: AutoTextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null)

  const syncHeight = useCallback(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.max(el.scrollHeight, minRows * 24)}px`
  }, [minRows])

  useEffect(() => {
    syncHeight()
  }, [value, syncHeight])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => syncHeight())
    ro.observe(el)
    return () => ro.disconnect()
  }, [syncHeight])

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => {
        onChange?.(e)
        requestAnimationFrame(syncHeight)
      }}
      rows={minRows}
      className={cn(fieldBase, className)}
      {...props}
    />
  )
}
