import { NavLink } from 'react-router-dom'
import { BookUp, LayoutDashboard, FileText, PenLine, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  { to: '/', label: '上传小说', icon: BookUp, end: true },
  { to: '/preprocess', label: '预处理进度', icon: LayoutDashboard },
  { to: '/overview', label: '概览版', icon: FileText },
  { to: '/editor', label: '剧本工作区', icon: PenLine },
]

export function Sidebar() {
  return (
    <aside className="flex w-60 shrink-0 flex-col border-r bg-card">
      <div className="flex h-14 items-center gap-2 border-b px-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Sparkles className="h-4 w-4" />
        </div>
        <div className="font-semibold">N2Ter</div>
      </div>

      <nav className="flex flex-col gap-1 p-3">
        {navItems.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
              )
            }
          >
            <Icon className="h-4 w-4" />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto p-3 text-xs text-muted-foreground">
        AI 小说转剧本工具 · 骨架 v0.1
      </div>
    </aside>
  )
}
