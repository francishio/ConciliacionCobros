// Tablero de conciliación de un cliente para un mes.
//   GET ?tenant=&periodo=YYYY-MM → KPIs + tabla por establecimiento/terminal +
//   las pasarelas del cliente (para saber qué botones de carga mostrar).
import { NextResponse } from 'next/server'
import { adminDb } from '@/src/db/admin'
import { resolverTenant } from '@/src/auth/session'
import { tableroConciliacion } from '@/src/conciliacion/tablero'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Pasarelas que usa el cliente (de sus cuentas), con modo archivo/API.
async function pasarelasDelCliente(tenantId: string) {
  const cuentas = await adminDb.cuentaPasarela.findMany({
    where: { tenantId, activo: true },
    select: { proveedor: true, modo: true },
  })
  if (cuentas.length === 0) return []
  const codigos = [...new Set(cuentas.map((c) => c.proveedor))]
  const catalogo = await adminDb.pasarela.findMany({
    where: { codigo: { in: codigos } },
    orderBy: { orden: 'asc' },
    select: { codigo: true, nombre: true },
  })
  return catalogo.map((p) => ({
    codigo: p.codigo,
    nombre: p.nombre,
    modoArchivo: cuentas.some((c) => c.proveedor === p.codigo && c.modo === 'MANUAL'),
    modoApi: cuentas.some((c) => c.proveedor === p.codigo && c.modo === 'API'),
  }))
}

export async function GET(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url)
    const ctx = await resolverTenant(url.searchParams.get('tenant'))
    if (!ctx) return NextResponse.json({ error: 'Elegí un cliente.' }, { status: 400 })
    const periodo = (url.searchParams.get('periodo') ?? '').trim()
    if (!/^\d{4}-\d{2}$/.test(periodo))
      return NextResponse.json({ error: 'Período inválido.' }, { status: 400 })
    const dia = (url.searchParams.get('dia') ?? '').trim() || null

    const [tablero, pasarelas] = await Promise.all([
      tableroConciliacion(ctx.tenantId, periodo, dia),
      pasarelasDelCliente(ctx.tenantId),
    ])
    return NextResponse.json({ tenant: ctx.nombre, tablero, pasarelas })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
