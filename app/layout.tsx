import type { Metadata } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'
import './globals.css'
import { Sidebar } from '@/components/Sidebar'

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' })
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono' })

export const metadata: Metadata = {
  title: 'ConciliaciónCobros',
  description: 'Conciliación de cobros HIOPOS ↔ pasarelas de cobro',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${inter.variable} ${mono.variable}`}>
      <body className="font-sans">
        <div className="flex h-screen overflow-hidden">
          <Sidebar />
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <header
              className="flex h-12 flex-shrink-0 items-center gap-3 border-b px-5"
              style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
            >
              <div className="font-mono text-[11px]" style={{ color: 'var(--muted)' }}>
                ConciliaciónCobros
              </div>
              <div className="ml-auto font-mono text-[10.5px]" style={{ color: 'var(--muted)' }}>
                HIOPOS ↔ Payway · MVP
              </div>
            </header>
            <div className="flex-1 overflow-y-auto p-5">{children}</div>
          </div>
        </div>
      </body>
    </html>
  )
}
