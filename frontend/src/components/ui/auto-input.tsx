import { cn } from '@/lib/utils'

type AutoInputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  /** 空内容时的最小占位宽度（字符数，仅作 fallback） */
  minChars?: number
}

/**
 * 宽度随文字内容伸缩：用 invisible 镜像 span 撑开 grid，适配中文等全角字符。
 */
export function AutoInput({
  className,
  value,
  minChars = 2,
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

  return (
    <span
      className="inline-grid max-w-full align-baseline [grid-template-areas:'field']"
      style={style}
    >
      <span
        className={cn(
          'invisible col-start-1 row-start-1 whitespace-pre px-1 py-1 [grid-area:field]',
          className,
        )}
        aria-hidden
      >
        {mirror}
      </span>
      <input
        value={value}
        placeholder={placeholder}
        className={cn(
        'col-start-1 row-start-1 min-w-0 max-w-full bg-transparent px-1 py-1 outline-none [grid-area:field]',
        'font-manuscript text-[15px] leading-relaxed',
        'border-b border-border/30 transition-colors duration-200',
        'hover:border-border/50 focus:border-primary/55 focus-visible:ring-0',
          className,
        )}
        {...props}
      />
    </span>
  )
}
