'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

// Mensajes para los ?error=... con los que vuelve el callback de Google.
const ERRORES_GOOGLE: Record<string, string> = {
  noauth: 'Ese email de Google no está habilitado. Pedile el alta al administrador.',
  google_config: 'El ingreso con Google no está configurado en este entorno.',
  google_denied: 'Cancelaste el ingreso con Google.',
  google_cookie: 'Expiró el intento de ingreso. Probá de nuevo.',
  google_state: 'No se pudo validar el ingreso con Google. Probá de nuevo.',
  google_resp: 'Google no devolvió los datos esperados. Probá de nuevo.',
  google_verify: 'No se pudo verificar tu cuenta de Google. Probá de nuevo.',
}

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)

  // Leemos el ?error= del callback de Google desde la URL (sin useSearchParams
  // para no obligar a un Suspense boundary en el build).
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('error')
    if (code) setError(ERRORES_GOOGLE[code] ?? 'No se pudo ingresar con Google.')
  }, [])

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
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      {/* Fondo degradado + silueta de montañas (estilo HIOPOS Analytics) */}
      <div
        className="absolute inset-0 -z-10"
        style={{ background: 'linear-gradient(160deg,#fff7ed 0%,#fde8cf 45%,#f8b26a 100%)' }}
      />
      <svg className="absolute bottom-0 left-0 -z-10 w-full" viewBox="0 0 1440 320" preserveAspectRatio="none" aria-hidden>
        <path fill="#ef7d18" fillOpacity="0.22" d="M0 220 L240 120 L480 200 L720 90 L960 190 L1200 110 L1440 200 L1440 320 L0 320 Z" />
        <path fill="#d96c0c" fillOpacity="0.28" d="M0 260 L300 180 L560 250 L820 160 L1080 240 L1320 170 L1440 240 L1440 320 L0 320 Z" />
      </svg>

      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-hiopos.png" alt="HIOPOS" className="mb-3 h-11 w-auto" />
          <div className="text-xl font-bold text-slate-800">Conciliación de Cobros</div>
          <div className="text-[11px] text-slate-500">HIOPOS ↔ Pasarelas de cobro</div>
        </div>

        <form onSubmit={entrar} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-slate-500">Email</label>
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
            <label className="mb-1 block text-[11px] font-semibold text-slate-500">Contraseña</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pc-input w-full px-3 py-2 text-sm"
              placeholder="••••••••"
            />
          </div>

          {error && <div className="pc-error px-3 py-2 text-[12px]">{error}</div>}

          <button type="submit" disabled={cargando} className="pc-btn w-full px-4 py-2 text-[13px]">
            {cargando ? 'Ingresando…' : 'Ingresar'}
          </button>

          <div className="flex items-center gap-3 text-[11px] text-slate-400">
            <span className="h-px flex-1 bg-slate-200" />
            o
            <span className="h-px flex-1 bg-slate-200" />
          </div>

          <a
            href="/api/auth/google/start"
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-[13px] font-medium text-slate-700 transition hover:bg-slate-50"
          >
            <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
              <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 4.1 29.6 2 24 2 11.8 2 2 11.8 2 24s9.8 22 22 22 22-9.8 22-22c0-1.5-.2-2.6-.4-3.5z" />
              <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 4.1 29.6 2 24 2 15.3 2 7.8 7 6.3 14.7z" />
              <path fill="#4CAF50" d="M24 46c5.5 0 10.5-2.1 14.3-5.6l-6.6-5.6C29.5 36.6 26.9 37.5 24 37.5c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C7.7 41 15.2 46 24 46z" />
              <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.3 5.7l6.6 5.6C40.9 36.9 46 31 46 24c0-1.5-.2-2.6-.4-3.5z" />
            </svg>
            Ingresar con Google
          </a>
        </form>
      </div>
    </div>
  )
}
