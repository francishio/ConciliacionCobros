'use client'

// Sidebar oscuro con etiquetas de texto (estilo HIOPOS Analytics, color de marca
// naranja en el ítem activo).
import Link from 'next/link'
import { usePathname } from 'next/navigation'

type Item = { label: string; href: string }
type Grupo = { rolVisible: 'SUPERADMIN' | 'CLIENTE'; items: Item[] }

const nav: Grupo[] = [
  {
    rolVisible: 'SUPERADMIN',
    items: [
      { label: 'Pasarelas', href: '/pasarelas' },
      { label: 'Clientes', href: '/config' },
      { label: 'Conc HIO-PAS', href: '/conciliacion' },
      { label: 'Sugerencias', href: '/sugerencias' },
    ],
  },
  {
    rolVisible: 'CLIENTE',
    items: [
      { label: 'Conc HIO-PAS', href: '/conciliacion' },
      { label: 'Sugerencias', href: '/sugerencias' },
    ],
  },
]

export function Sidebar({ rol }: { rol: 'SUPERADMIN' | 'CLIENTE' }) {
  const pathname = usePathname()
  const items = nav.filter((g) => g.rolVisible === rol).flatMap((g) => g.items)
  return (
    <aside className="flex w-48 flex-shrink-0 flex-col border-r border-black/30 bg-slate-900 py-3">
      <nav className="flex flex-1 flex-col gap-0.5 px-2 pt-1">
        {items.map((it) => {
          const active = it.href === pathname
          return (
            <Link
              key={it.label}
              href={it.href}
              className="rounded-lg px-3 py-2 text-[12.5px] font-semibold uppercase tracking-wide transition-colors"
              style={
                active
                  ? { background: 'var(--hio)', color: '#fff' }
                  : { color: '#cbd5e1' }
              }
            >
              {it.label}
            </Link>
          )
        })}
      </nav>
      <div className="px-4 text-[8px] font-mono text-slate-600">v0.1</div>
    </aside>
  )
}
