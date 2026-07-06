// Dashboard de solo lectura: devuelve el resumen de un mes + la lista de meses
// disponibles del cliente (para el selector). El tenant sale de la sesión.
import { NextResponse } from 'next/server'
import { adminDb } from '@/src/db/admin'
import { resolverTenant } from '@/src/auth/session'
import { resumenMes } from '@/src/carga/resumen'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url)
    const ctx = await resolverTenant(url.searchParams.get('tenant'))
    if (!ctx) return NextResponse.json({ error: 'No se pudo resolver el cliente.' }, { status: 400 })
    const { tenantId } = ctx

    const filas = await adminDb.cobro.findMany({
      where: { tenantId, periodo: { not: null } },
      distinct: ['periodo'],
      select: { periodo: true },
      orderBy: { periodo: 'desc' },
    })
    const periodos = filas.map((f) => f.periodo).filter((p): p is string => !!p)

    const pedido = url.searchParams.get('periodo')?.trim()
    const periodo = pedido && periodos.includes(pedido) ? pedido : periodos[0]
    if (!periodo) return NextResponse.json({ periodos: [], resumen: null })

    const resumen = await resumenMes(tenantId, periodo)
    return NextResponse.json({ periodos, resumen })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
