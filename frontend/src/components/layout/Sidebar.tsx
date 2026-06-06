import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  BookUp,
  LayoutDashboard,
  FileText,
  PenLine,
  Sparkles,
  Layers,
  ListTree,
  PanelLeftClose,
  PanelLeft,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { NovelSwitcher } from './NovelSwitcher'
import { useAppStore } from '@/stores/useAppStore'

const STORAGE_KEY = 'n2ter-sidebar-collapsed'

const navItems = [
  { to: '/', label: '上传小说', icon: BookUp, end: true },
  { to: '/preprocess', label: '预处理进度', icon: LayoutDashboard },
  { to: '/overview', label: '概览版', icon: FileText },
  { to: '/schema-select', label: '选择剧本类型', icon: Layers },
  { to: '/adaptation-plan', label: '改编方案', icon: ListTree },
  { to: '/editor', label: '剧本工作区', icon: PenLine },
]

export function Sidebar() {
  const apiConnected = useAppStore((s) => s.apiConnected)
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === '1'
    } catch {
      return false
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0')
    } catch {
      /* ignore */
    }
  }, [collapsed])

  return (
    <aside
      className={cn(
        'flex shrink-0 flex-col border-r bg-card transition-[width] duration-200 ease-out',
        collapsed ? 'w-[4.5rem]' : 'w-60',
      )}
    >
      <div
        className={cn(
          'flex h-14 shrink-0 items-center border-b',
          collapsed ? 'justify-center px-2' : 'justify-between gap-2 px-4',
        )}
      >
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Sparkles className="h-4 w-4" />
          </div>
          {!collapsed && <div className="truncate font-semibold">N2Ter</div>}
        </div>
        {!collapsed && (
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0"
            onClick={() => setCollapsed(true)}
            aria-label="收起导航"
            title="收起导航"
          >
            <PanelLeftClose className="h-4 w-4" />
          </Button>
        )}
      </div>

      <NovelSwitcher collapsed={collapsed} onExpand={() => setCollapsed(false)} />

      <nav className={cn('flex flex-1 flex-col gap-1 overflow-y-auto', collapsed ? 'p-2' : 'p-3')}>
        {navItems.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            title={collapsed ? label : undefined}
            className={({ isActive }) =>
              cn(
                'flex items-center rounded-md text-sm font-medium transition-colors',
                collapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2',
                isActive
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
              )
            }
          >
            <Icon className="h-4 w-4 shrink-0" />
            {!collapsed && <span className="truncate">{label}</span>}
          </NavLink>
        ))}
      </nav>

      <div className={cn('shrink-0 border-t', collapsed ? 'p-2' : 'p-3')}>
        {collapsed ? (
          <Button
            variant="ghost"
            size="icon"
            className="w-full"
            onClick={() => setCollapsed(false)}
            aria-label="展开导航"
            title="展开导航"
          >
            <PanelLeft className="h-4 w-4" />
          </Button>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">AI 小说转剧本 · v0.2</p>
            <span
              className={cn(
                'inline-flex items-center gap-1 text-[10px]',
                apiConnected ? 'text-primary' : 'text-muted-foreground',
              )}
              title={apiConnected ? '已连接后端 API' : '离线 mock 模式'}
            >
              <span
                className={cn(
                  'h-1.5 w-1.5 rounded-full',
                  apiConnected ? 'bg-primary' : 'bg-muted-foreground/50',
                )}
              />
              {apiConnected ? 'API' : 'Mock'}
            </span>
          </div>
        )}
      </div>
    </aside>
  )
}
