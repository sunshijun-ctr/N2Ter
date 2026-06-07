import { cn } from '@/lib/utils'

type AutoInputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  /** 空内容时的最小占位宽度（字符数，仅作 fallback） */
  minChars?: number
  /** 占满容器宽度（场景头等整行字段） */
  block?: boolean
}

/**
 * 宽度随文字内容伸缩：镜像 span 仅用于测量，opacity-0 避免叠字。
 */
export function AutoInput({
  className,
  value,
  minChars = 2,
  block = false,
  style,
  placeholder,
  ...props
}: AutoInputProps) {
  const text = String(value ?? '')
  const hint = String(placeholder ?? '')
  const mirror =
    text ||
    hint ||
    '\u00a0'.repeat(Math.max(1, minChars))

  const fieldClass = cn(
    'col-start-1 row-start-1 min-w-0 px-1 py-1 font-manuscript text-[15px] leading-relaxed [grid-area:field]',
    'border-b border-border/30 transition-colors duration-200',
    'hover:border-border/50 focus:border-primary/55 focus-visible:ring-0 focus-visible:outline-none',
    block ? 'w-full max-w-full' : 'max-w-full',
    className,
  )

  return (
    <span
      className={cn(
        'max-w-full align-baseline [grid-template-areas:"field"]',
        block ? 'grid w-full' : 'inline-grid',
      )}
      style={style}
    >
      <span className={cn(fieldClass, 'pointer-events-none select-none whitespace-pre break-words opacity-0')} aria-hidden>
        {mirror}
      </span>
      <input
        value={value}
        placeholder={placeholder}
        className={cn(fieldClass, 'relative z-[1] bg-transparent outline-none')}
        {...props}
      />
    </span>
  )
}
