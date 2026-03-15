import { X, LayoutDashboard, Flame, TrendingUp, Calendar } from 'lucide-react'

const navItems = [
  { icon: LayoutDashboard, label: '概览', href: '#' },
  { icon: Flame, label: '训练', href: '#' },
  { icon: TrendingUp, label: '数据', href: '#' },
  { icon: Calendar, label: '计划', href: '#' },
]

export function Sidebar({ open, onClose }) {
  if (!open) return null

  return (
    <>
      <div
        className="fixed inset-0 z-40 backdrop-blur-sm"
        style={{ backgroundColor: 'rgba(47,47,47,0.6)' }}
        onClick={onClose}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
        role="button"
        tabIndex={0}
        aria-label="关闭侧栏"
      />
      <aside className="fixed left-0 top-0 z-50 flex h-full w-64 flex-col border-r border-[#404040]" style={{ backgroundColor: '#3a3a3a' }}>
        <div className="flex h-14 items-center justify-between border-b border-[#404040] px-4">
          <span className="font-semibold text-zinc-100">菜单</span>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-[#404040] hover:text-zinc-100"
            aria-label="关闭"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="flex flex-col gap-1 p-3">
          {navItems.map(({ icon: Icon, label, href }) => (
            <a
              key={label}
              href={href}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-zinc-300 transition hover:bg-[#404040] hover:text-[#FF3C3C]"
            >
              <Icon className="h-5 w-5 shrink-0" />
              {label}
            </a>
          ))}
        </nav>
      </aside>
    </>
  )
}
