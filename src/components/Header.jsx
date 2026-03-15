import { Menu, User, Dumbbell } from 'lucide-react'

export function Header({ onMenuClick }) {
  return (
    <header className="sticky top-0 z-50 border-b border-[#404040] backdrop-blur-sm" style={{ backgroundColor: 'rgba(47,47,47,0.95)' }}>
      <div className="mx-auto flex h-14 max-w-[390px] items-center justify-between px-4">
        <button
          type="button"
          onClick={onMenuClick}
          className="flex h-10 w-10 items-center justify-center rounded-xl text-zinc-400 transition hover:bg-[#404040] hover:text-zinc-100"
          aria-label="打开菜单"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2">
          <Dumbbell className="h-6 w-6" style={{ color: '#FF3C3C' }} />
          <span className="font-semibold tracking-tight text-zinc-100">The Body</span>
        </div>
        <button
          type="button"
          className="flex h-10 w-10 items-center justify-center rounded-xl text-zinc-400 transition hover:bg-[#404040] hover:text-zinc-100"
          aria-label="个人"
        >
          <User className="h-5 w-5" />
        </button>
      </div>
    </header>
  )
}
