import { useState } from 'react'
import { Header } from './Header'
import { Sidebar } from './Sidebar'

export function Layout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#2F2F2F' }}>
      <Header onMenuClick={() => setSidebarOpen(true)} />
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="mx-auto max-w-[390px] px-5 pt-6 pb-4">
        {children}
      </main>
      <footer className="pb-6 flex justify-center">
        <a href="https://platform.fatsecret.com" target="_blank" rel="noopener noreferrer">
          <img
            alt="Nutrition information provided by fatsecret Platform API"
            src="https://platform.fatsecret.com/api/static/images/powered_by_fatsecret_horizontal_brand.png"
            srcSet="https://platform.fatsecret.com/api/static/images/powered_by_fatsecret_horizontal_brand@2x.png 2x, https://platform.fatsecret.com/api/static/images/powered_by_fatsecret_horizontal_brand@3x.png 3x"
            style={{ height: '16px', opacity: 0.6 }}
          />
        </a>
      </footer>
    </div>
  )
}
