import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'ConciliaciónCobros',
  description: 'Conciliación de cobros HIOPOS ↔ pasarelas de cobro',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  )
}
