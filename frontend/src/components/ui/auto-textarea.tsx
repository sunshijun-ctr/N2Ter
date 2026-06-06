import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

type AutoTextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  minRows?: number
}

/** 高度随内容增长，避免窄框内反复下拉 */
export function AutoTextarea({
  className,
  value,
  minRows = 2,
  onChange,
  ...props
}: AutoTextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.max(el.scrollHeight, minRows * 24)}px`
  }, [value, minRows])

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={onChange}
      rows={minRows}
      className={cn(
        'w-full min-w-0 resize-none overflow-hidden rounded-md border bg-background px-3 py-2 text-sm leading-relaxed outline-none focus:border-primary [field-sizing:content]',
        className,
      )}
      {...props}
    />
  )
}
