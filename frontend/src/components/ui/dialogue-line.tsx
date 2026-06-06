import { useCallback, useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

type DialogueLineProps = {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}

/** 角色旁边的台词：与 AutoInput 并排，全宽伸展，高度随内容增长 */
export function DialogueLine({
  value,
  onChange,
  placeholder = '对白内容',
  className,
}: DialogueLineProps) {
  const ref = useRef<HTMLTextAreaElement>(null)

  const adjustHeight = useCallback(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.max(el.scrollHeight, 28)}px`
  }, [])

  useEffect(() => {
    adjustHeight()
  }, [value, adjustHeight])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => adjustHeight())
    ro.observe(el)
    return () => ro.disconnect()
  }, [adjustHeight])

  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      placeholder={placeholder}
      onChange={(e) => {
        onChange(e.target.value)
        requestAnimationFrame(adjustHeight)
      }}
      className={cn(
        'block w-full min-h-[1.75rem] min-w-0 resize-none overflow-hidden',
        'bg-transparent px-1 py-0.5 font-manuscript text-[15px] leading-relaxed text-foreground',
        'border-b border-border/30 outline-none transition-colors duration-200',
        'hover:border-border/50 focus:border-primary/55 focus-visible:ring-0',
        className,
      )}
    />
  )
}
