// Flujo de acreditaciones (proyección) de un cliente/mes.
import { NextResponse } from 'next/server'
import { resolverTenant } from '@/src/auth/session'
import { proyectarAcreditaciones } from '@/src/acreditaciones/proyeccion'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url)
    const ctx = await resolverTenant(url.searchParams.get('tenant'))
    if (!ctx) return NextResponse.json({ error: 'Elegí un cliente.' }, { status: 400 })
    const periodo = (url.searchParams.get('periodo') ?? '').trim()
    if (!/^\d{4}-\d{2}$/.test(periodo)) return NextResponse.json({ error: 'Período inválido.' }, { status: 400 })

    const proyeccion = await proyectarAcreditaciones(ctx.tenantId, periodo)
    return NextResponse.json({ tenant: ctx.nombre, proyeccion })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
