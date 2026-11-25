'use client'

// Entrada desde el menú de HIOFFICE (SSO). El link del menú es:
//   https://hioconciliacion.netlify.app/hio#t=$$$SESSION_TOKEN$$$&s=$$$SERVER_NAME$$$&e=$$$USER_EMAIL$$$
// Los datos van en el "#" (no viajan al servidor ni a los logs): esta página los lee, los
// manda por POST a /api/auth/hio, borra el "#" de la barra y entra a Conciliación.
import { useEffect, useState } from 'react'

export default function EntradaHioffice() {
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // HIOFFICE le agrega "?guid=…" al FINAL del link (dentro del "#"): se descarta lo que
    // venga después de un "?" en cada valor (ej. "fran@demo.ar?guid=179518…" → "fran@demo.ar").
    const h = new URLSearchParams(window.location.hash.replace(/^#/, '').replace(/\?/g, '&'))
    const limpio = (v: string | null) => (v ?? '').split('?')[0].trim()
    const t = limpio(h.get('t')),
      s = limpio(h.get('s')),
      e = limpio(h.get('e'))
    history.replaceState(null, '', window.location.pathname) // que el token no quede en la barra
    if (!t) {
      setError('Este link tiene que abrirse desde el menú de HIOFFICE.')
      return
    }
    fetch('/api/auth/hio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ t, s, e }),
    })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}))
        if (r.ok && j.ok) window.location.replace('/conciliacion')
        else setError(j.error ?? `Error ${r.status}`)
      })
      .catch((err) => setError((err as Error).message))
  }, [])

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-md space-y-4 rounded-2xl bg-white p-8 text-center shadow-xl">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-hio-400 to-hio-600 text-xl font-bold text-white shadow-md">
          ⇆
        </div>
        {!error ? (
          <p className="text-sm text-slate-600">Entrando con tu sesión de HIOFFICE…</p>
        ) : (
          <>
            <p className="text-sm font-semibold text-red-700">No se pudo entrar con la sesión de HIOFFICE</p>
            <p className="text-sm text-slate-600">{error}</p>
            <a href="/login" className="inline-block text-sm text-hio-600 hover:underline">
              Entrar con usuario y contraseña
            </a>
          </>
        )}
      </div>
    </main>
  )
}
