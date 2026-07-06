// Devuelve la sesión actual (sin datos sensibles) para que las pantallas del
// cliente sepan el rol y su tenant, y ajusten la UI.
import { NextResponse } from 'next/server'
import { sesionActual } from '@/src/auth/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(): Promise<Response> {
  const s = await sesionActual()
  if (!s) return NextResponse.json({ error: 'Sin sesión.' }, { status: 401 })
  return NextResponse.json({ email: s.email, rol: s.rol, tenantNombre: s.tenantNombre })
}
