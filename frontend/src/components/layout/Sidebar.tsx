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

const navGroups: {
  label: string
  items: { to: string; label: string; icon: typeof BookUp; end?: boolean }[]
}[] = [
  {
    label: '开始',
    items: [
      { to: '/', label: '上传小说', icon: BookUp, end: true },
      { to: '/preprocess', label: '预处理进度', icon: LayoutDashboard },
    ],
  },
  {
    label: '规划',
    items: [
      { to: '/overview', label: '概览版', icon: FileText },
      { to: '/schema-select', label: '选择剧本类型', icon: Layers },
      { to: '/adaptation-plan', label: '改编方案', icon: ListTree },
    ],
  },
  {
    label: '创作',
    items: [{ to: '/editor', label: '剧本工作台', icon: PenLine }],
  },
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
        'glass-panel-strong relative z-20 flex shrink-0 flex-col border-r shadow-panel transition-[width] duration-300 ease-out',
        collapsed ? 'w-[4.75rem]' : 'w-64',
      )}
    >
      <div
        className={cn(
          'flex h-[3.75rem] shrink-0 items-center border-b border-border/50',
          collapsed ? 'justify-center px-2' : 'justify-between gap-2 px-4',
        )}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-soft">
            <Sparkles className="h-4 w-4" />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <div className="truncate font-display text-lg leading-none tracking-tight">N2Ter</div>
              <div className="mt-0.5 truncate text-[10px] text-muted-foreground">小说 · 剧本 · 视频</div>
            </div>
          )}
        </div>
        {!collapsed && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-muted-foreground"
            onClick={() => setCollapsed(true)}
            aria-label="收起导航"
            title="收起导航"
          >
            <PanelLeftClose className="h-4 w-4" />
          </Button>
        )}
      </div>

      <NovelSwitcher collapsed={collapsed} onExpand={() => setCollapsed(false)} />

      <nav className={cn('flex flex-1 flex-col gap-4 overflow-y-auto', collapsed ? 'p-2' : 'px-3 py-4')}>
        {navGroups.map((group) => (
          <div key={group.label}>
            {!collapsed && (
              <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
                {group.label}
              </p>
            )}
            <ul className="flex flex-col gap-0.5">
              {group.items.map(({ to, label, icon: Icon, end }) => (
                <li key={to}>
                  <NavLink
                    to={to}
                    end={end}
                    title={collapsed ? label : undefined}
                    className={({ isActive }) =>
                      cn(
                        'group flex cursor-pointer items-center rounded-lg text-sm font-medium transition-all duration-200',
                        collapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2.5',
                        isActive
                          ? collapsed
                            ? 'bg-accent text-accent-foreground shadow-sm'
                            : 'nav-rail-active pl-4'
                          : 'text-muted-foreground hover:bg-secondary/80 hover:text-foreground',
                      )
                    }
                  >
                    <Icon
                      className={cn(
                        'h-[18px] w-[18px] shrink-0 transition-colors',
                        'group-hover:text-foreground',
                      )}
                    />
                    {!collapsed && <span className="truncate">{label}</span>}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className={cn('shrink-0 border-t border-border/50', collapsed ? 'p-2' : 'p-3')}>
        {collapsed ? (
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-full"
            onClick={() => setCollapsed(false)}
            aria-label="展开导航"
            title="展开导航"
          >
            <PanelLeft className="h-4 w-4" />
          </Button>
        ) : (
          <div className="glass-panel rounded-lg px-3 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] text-muted-foreground">v0.2 · AI 改编引擎</p>
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium',
                  apiConnected
                    ? 'bg-primary/10 text-primary'
                    : 'bg-muted text-muted-foreground',
                )}
                title={apiConnected ? '已连接后端 API' : '离线 mock 模式'}
              >
                <span
                  className={cn(
                    'h-1.5 w-1.5 rounded-full',
                    apiConnected ? 'bg-primary' : 'bg-muted-foreground/50',
                  )}
                />
                {apiConnected ? '在线' : 'Mock'}
              </span>
            </div>
          </div>
        )}
      </div>
    </aside>
  )
}
