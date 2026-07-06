'use client'

import { useEffect, useState } from 'react'

export interface SesionCliente {
  email: string
  rol: 'SUPERADMIN' | 'CLIENTE'
  tenantNombre: string | null
}

// Lee la sesión actual (rol + tenant) desde /api/auth/me para que las pantallas
// del cliente ajusten la UI (ocultar el selector de cliente, mostrar su nombre).
export function useSesion(): SesionCliente | null {
  const [sesion, setSesion] = useState<SesionCliente | null>(null)
  useEffect(() => {
    let vivo = true
    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (vivo && j) setSesion(j as SesionCliente)
      })
      .catch(() => {})
    return () => {
      vivo = false
    }
  }, [])
  return sesion
}
