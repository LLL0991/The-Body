import { useState } from 'react'
import { Header } from './Header'
import { Sidebar } from './Sidebar'

export function Layout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#2F2F2F' }}>
      <Header onMenuClick={() => setSidebarOpen(true)} />
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="mx-auto max-w-[390px] px-5 pt-6 pb-8">
        {children}
      </main>
    </div>
  )
}
