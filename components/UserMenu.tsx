'use client'

import { useRouter } from 'next/navigation'

export function UserMenu({
  email,
  rol,
  tenantNombre,
}: {
  email: string
  rol: 'SUPERADMIN' | 'CLIENTE'
  tenantNombre: string | null
}) {
  const router = useRouter()

  async function salir() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }

  return (
    <div className="flex items-center gap-3">
      <div className="text-right leading-tight">
        <div className="text-[10.5px]" style={{ color: 'var(--muted2)' }}>
          {email}
        </div>
        <div className="font-mono text-[9px]" style={{ color: 'var(--muted)' }}>
          {rol === 'SUPERADMIN' ? 'Super admin' : (tenantNombre ?? 'Cliente')}
        </div>
      </div>
      <button
        onClick={salir}
        className="rounded-md px-2.5 py-1 text-[10.5px] font-semibold"
        style={{ background: 'var(--surface3)', color: 'var(--text)' }}
      >
        Salir
      </button>
    </div>
  )
}
