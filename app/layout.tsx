import type { Metadata, Viewport } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'
import './globals.css'
import { InstalarApp } from '@/components/InstalarApp'

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' })
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono' })

export const metadata: Metadata = {
  title: 'Conciliación de Cobros',
  description: 'Conciliación de cobros HIOPOS ↔ pasarelas de cobro',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Concilia', statusBarStyle: 'default' },
  icons: {
    icon: '/icono-192.png',
    apple: '/icono-192.png',
  },
}

export const viewport: Viewport = {
  themeColor: '#ef7d18',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${inter.variable} ${mono.variable}`}>
      <body className="font-sans">
        {children}
        <InstalarApp />
      </body>
    </html>
  )
}
