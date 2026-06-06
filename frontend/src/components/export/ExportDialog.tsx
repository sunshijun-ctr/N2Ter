import { useState } from 'react'
import { FileArchive, FileCode2, FileText, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { LoadingSpinner } from '@/components/ui/loading'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/stores/useAppStore'
import type { ExportFormat } from '@/lib/types'

const formats: {
  value: ExportFormat
  label: string
  desc: string
  icon: typeof FileCode2
}[] = [
  { value: 'yaml', label: 'YAML', desc: '结构化数据，供其他工具消费', icon: FileCode2 },
  { value: 'pdf', label: 'PDF', desc: '人类可读，自定义剧本排版', icon: FileText },
  { value: 'zip', label: 'ZIP 打包', desc: 'YAML + PDF + 概览版一次性导出', icon: FileArchive },
]

export function ExportDialog() {
  const {
    exportDialogOpen,
    setExportDialogOpen,
    currentNovel,
    currentScreenplay,
    selectedSchema,
    requestExport,
  } = useAppStore()
  const [format, setFormat] = useState<ExportFormat>('yaml')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)

  if (!exportDialogOpen) return null

  async function handleExport() {
    setSubmitting(true)
    setResult(null)
    const res = await requestExport(format)
    setResult(res)
    setSubmitting(false)
  }

  function handleClose() {
    setExportDialogOpen(false)
    setResult(null)
    setSubmitting(false)
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-foreground/20 backdrop-blur-[1px]"
        aria-label="关闭"
        onClick={handleClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-title"
        className="relative z-10 w-full max-w-md rounded-lg border bg-card p-6 shadow-lg"
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 id="export-title" className="text-lg font-semibold">
              导出剧本
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {currentNovel ? `《${currentNovel.title}》` : '未选择项目'}
              {currentScreenplay && ` · ${currentScreenplay.title}`}
              {selectedSchema && ` · ${selectedSchema}`}
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={handleClose} aria-label="关闭对话框">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex flex-col gap-2">
          {formats.map((f) => {
            const Icon = f.icon
            const active = format === f.value
            return (
              <button
                key={f.value}
                type="button"
                onClick={() => setFormat(f.value)}
                className={cn(
                  'flex items-start gap-3 rounded-md border p-3 text-left transition-colors',
                  active ? 'border-primary bg-accent/50' : 'hover:bg-secondary',
                )}
              >
                <Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div>
                  <div className="font-medium">{f.label}</div>
                  <div className="text-xs text-muted-foreground">{f.desc}</div>
                </div>
              </button>
            )
          })}
        </div>

        {result && (
          <p
            className={cn(
              'mt-4 rounded-md p-3 text-sm',
              result.ok ? 'bg-accent text-accent-foreground' : 'bg-destructive/10 text-destructive',
            )}
          >
            {result.message}
          </p>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={handleClose}>
            取消
          </Button>
          <Button disabled={submitting || !currentNovel} onClick={handleExport}>
            {submitting ? <LoadingSpinner /> : null}
            {submitting ? '导出中…' : '开始导出'}
          </Button>
        </div>
      </div>
    </div>
  )
}
