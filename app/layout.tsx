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
    // ?v=2 fuerza al navegador a re-bajar el favicon (antes cacheó el rayo viejo).
    icon: '/icono-192.png?v=2',
    apple: '/icono-192.png?v=2',
  },
}

export const viewport: Viewport = {
  themeColor: '#ef7d18',
}

// La app está 100% detrás de login y usa base de datos: prerenderizar en build no
// aporta nada y, de hecho, rompía el build de Netlify (prerender estático con
// useContext null). Forzamos render dinámico en todo el árbol: cada ruta se sirve
// on-demand y nunca se intenta generar estáticamente.
export const dynamic = 'force-dynamic'

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
