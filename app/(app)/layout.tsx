// Layout del shell (sidebar + topbar) para las pantallas autenticadas.
// El middleware garantiza que acá siempre hay sesión.
import { sesionActual } from '@/src/auth/session'
import { Sidebar } from '@/components/Sidebar'
import { UserMenu } from '@/components/UserMenu'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await sesionActual()
  const rol = s?.rol ?? 'CLIENTE'
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar rol={rol} />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header
          className="flex h-12 flex-shrink-0 items-center gap-3 border-b px-5"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
        >
          <div className="font-mono text-[11px]" style={{ color: 'var(--muted)' }}>
            ConciliaciónCobros
          </div>
          <div className="ml-auto">
            <UserMenu email={s?.email ?? ''} rol={rol} tenantNombre={s?.tenantNombre ?? null} />
          </div>
        </header>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  )
}
