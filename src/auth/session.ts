// Helpers de sesión del lado server (usan next/headers → solo Node, no Edge).
import { cookies } from 'next/headers'
import { adminDb } from '../db/admin'
import { SESSION_COOKIE, verificarSesion, type Sesion } from './jwt'

// Sesión del usuario actual (o null si no hay/está vencida).
export async function sesionActual(): Promise<Sesion | null> {
  return verificarSesion(cookies().get(SESSION_COOKIE)?.value)
}

export interface TenantCtx {
  tenantId: string
  nombre: string
}

// Resuelve el tenant efectivo de una request de datos de cliente:
//  - CLIENTE: SIEMPRE el suyo (ignora cualquier nombre pasado por parámetro).
//  - SUPERADMIN: el que indique `nombreParam` (puede operar sobre cualquiera).
// Devuelve null si no se puede resolver (sin sesión, cliente sin tenant, o
// superadmin sin indicar cliente / cliente inexistente).
export async function resolverTenant(nombreParam?: string | null): Promise<TenantCtx | null> {
  const s = await sesionActual()
  if (!s) return null

  if (s.rol === 'CLIENTE') {
    if (!s.tenantId || !s.tenantNombre) return null
    return { tenantId: s.tenantId, nombre: s.tenantNombre }
  }

  // SUPERADMIN
  const nombre = (nombreParam ?? '').trim()
  if (!nombre) return null
  const t = await adminDb.tenant.findFirst({ where: { nombre }, select: { id: true, nombre: true } })
  return t ? { tenantId: t.id, nombre: t.nombre } : null
}
