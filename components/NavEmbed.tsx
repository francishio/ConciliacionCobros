'use client'

// Barra de pestañas para la vista embebida en HIOFFICE (SSO): como ahí ocultamos
// el sidebar, estas pestañas dan la navegación entre las pantallas que ve el
// cliente. Estilo Material (pestaña activa subrayada) → con el tema HIOFFICE queda
// en azul. Son las mismas pantallas que el cliente ve en el sidebar normal.
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  { label: 'Conciliación', href: '/conciliacion' },
  { label: 'Acreditaciones', href: '/acreditaciones' },
  { label: 'Sugerencias', href: '/sugerencias' },
]

export function NavEmbed() {
  const pathname = usePathname()
  return (
    <nav
      className="flex flex-shrink-0 items-center gap-1 border-b px-5"
      style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
    >
      {TABS.map((t) => {
        const active = pathname === t.href || pathname.startsWith(t.href + '/')
        return (
          <Link
            key={t.href}
            href={t.href}
            className="px-4 py-2.5 text-[13px] font-medium transition-colors"
            style={{
              color: active ? 'var(--hio)' : 'var(--muted2)',
              borderBottom: active ? '2px solid var(--hio)' : '2px solid transparent',
            }}
          >
            {t.label}
          </Link>
        )
      })}
    </nav>
  )
}
