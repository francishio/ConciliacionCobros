'use client'

// Fuerza el dominio canónico: si se entra por un alias o permalink de Netlify
// (main--…, <deployid>--…), redirige a hioconciliacion.netlify.app conservando
// la ruta. Evita quedar pegado en una URL de deploy (donde el login de Google
// falla por redirect_uri y el cliente no se comparte entre orígenes).
import { useEffect } from 'react'

const CANONICAL = 'hioconciliacion.netlify.app'

export function CanonicalGuard() {
  useEffect(() => {
    try {
      const h = window.location.host
      if (h.endsWith('.netlify.app') && h !== CANONICAL) {
        window.location.replace(`https://${CANONICAL}${window.location.pathname}${window.location.search}`)
      }
    } catch {
      /* noop */
    }
  }, [])
  return null
}
