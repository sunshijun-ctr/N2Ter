import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { X } from 'lucide-react'
import { Sidebar } from './Sidebar'
import { isWorkflowRoute, WorkflowNav } from './WorkflowNav'
import { ExportDialog } from '@/components/export/ExportDialog'
import { LoadingOverlay } from '@/components/ui/loading'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/stores/useAppStore'

export function AppLayout() {
  const { pathname } = useLocation()
  const { globalLoading, globalError, clearError, hydrateFromApi } = useAppStore()
  const showWorkflow = isWorkflowRoute(pathname)

  useEffect(() => {
    void hydrateFromApi()
  }, [hydrateFromApi])

  return (
    <div className="relative flex h-dvh w-full overflow-hidden bg-background">
      <Sidebar />
      <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        {globalError && (
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-destructive/30 bg-destructive/5 px-4 py-2 text-sm text-destructive">
            <span>{globalError}</span>
            <Button variant="ghost" size="icon" onClick={clearError} aria-label="关闭错误提示">
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}
        {showWorkflow && <WorkflowNav />}
        <Outlet />
        {globalLoading && <LoadingOverlay message="切换项目中…" />}
      </main>
      <ExportDialog />
    </div>
  )
}
