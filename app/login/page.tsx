'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)

  async function entrar(e: React.FormEvent) {
    e.preventDefault()
    setCargando(true)
    setError(null)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'No se pudo ingresar')
      router.push(json.redirect ?? '/')
      router.refresh()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setCargando(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4" style={{ background: 'var(--bg)' }}>
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2.5">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-lg text-lg"
            style={{ background: 'linear-gradient(135deg,var(--cyan),#0891b2)' }}
          >
            ⚡
          </div>
          <div>
            <div className="text-base font-bold">ConciliaciónCobros</div>
            <div className="text-[9px] uppercase tracking-wider" style={{ color: 'var(--muted)' }}>
              HIOPOS ↔ Pasarelas
            </div>
          </div>
        </div>

        <form onSubmit={entrar} className="pc-panel space-y-4 p-6">
          <div>
            <label className="mb-1 block text-[11px] font-medium" style={{ color: 'var(--muted2)' }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
              className="pc-input w-full px-3 py-2 text-sm"
              placeholder="tu@email.com"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium" style={{ color: 'var(--muted2)' }}>
              Contraseña
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pc-input w-full px-3 py-2 text-sm"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div
              className="rounded-lg border px-3 py-2 text-[12px]"
              style={{ borderColor: '#7f1d1d', background: '#2a0a0a', color: '#fca5a5' }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={cargando}
            className="w-full rounded-lg px-4 py-2 text-[13px] font-semibold disabled:opacity-50"
            style={{ background: 'var(--cyan)', color: '#04121a' }}
          >
            {cargando ? 'Ingresando…' : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  )
}
