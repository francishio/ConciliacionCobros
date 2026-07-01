'use client'

// Sidebar del shell (estilo PayConcil). Los ítems con href ya son pantallas
// reales; el resto son placeholders que se irán habilitando (Establecimientos,
// Carga, Etapas, Reportes).
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const nav: { section: string; items: { icon: string; label: string; href?: string }[] }[] = [
  {
    section: 'Principal',
    items: [
      { icon: '🏪', label: 'Establecimientos', href: '/establecimientos' },
      { icon: '↑', label: 'Cargar archivos' },
      { icon: '◈', label: 'Dashboard', href: '/' },
    ],
  },
  {
    section: 'Conciliación',
    items: [
      { icon: '⇄', label: 'Etapa 1 — Operativa' },
      { icon: '🏦', label: 'Etapa 2 — Financiera' },
      { icon: '🔗', label: 'Conciliación manual', href: '/manual' },
    ],
  },
  {
    section: 'Análisis',
    items: [{ icon: '⊡', label: 'Reportes' }],
  },
]

export function Sidebar() {
  const pathname = usePathname()
  return (
    <aside
      className="flex w-56 flex-shrink-0 flex-col border-r"
      style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
    >
      {/* Logo */}
      <div className="flex items-center gap-2.5 border-b px-4 py-3.5" style={{ borderColor: 'var(--border)' }}>
        <div
          className="flex h-8 w-8 items-center justify-center rounded-lg text-base"
          style={{ background: 'linear-gradient(135deg,var(--cyan),#0891b2)' }}
        >
          ⚡
        </div>
        <div>
          <div className="text-sm font-bold">ConciliaciónCobros</div>
          <div className="text-[9px] uppercase tracking-wider" style={{ color: 'var(--muted)' }}>
            HIOPOS ↔ Pasarelas
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-2.5">
        {nav.map((grupo) => (
          <div key={grupo.section}>
            <div
              className="px-3.5 pb-1 pt-2.5 text-[9px] font-bold uppercase tracking-widest"
              style={{ color: 'var(--muted)' }}
            >
              {grupo.section}
            </div>
            {grupo.items.map((it) => {
              const active = it.href === pathname
              const inner = (
                <>
                  <span className="w-4 text-center text-[13px]">{it.icon}</span>
                  {it.label}
                </>
              )
              const cls = 'mx-1.5 my-px flex items-center gap-2.5 rounded-md px-3 py-1.5 text-[11.5px]'
              if (it.href) {
                return (
                  <Link
                    key={it.label}
                    href={it.href}
                    className={cls}
                    style={active ? { background: 'var(--surface3)', color: 'var(--cyan)' } : { color: 'var(--muted2)' }}
                  >
                    {inner}
                  </Link>
                )
              }
              return (
                <div key={it.label} className={cls} style={{ color: 'var(--muted)', cursor: 'default' }}>
                  {inner}
                </div>
              )
            })}
          </div>
        ))}
      </nav>

      <div className="border-t px-3.5 py-2.5 text-[10px]" style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}>
        <div className="font-mono text-[9px]">v0.1 · beta</div>
      </div>
    </aside>
  )
}
