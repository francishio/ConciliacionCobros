// API del flujo demo end-to-end: recibe el export de HIOPOS (CSV) y el reporte
// de Payway (xlsx), ingiere todo, corre la conciliación operativa y devuelve el
// resultado. Reutiliza exactamente la lógica ya probada en src/.
//
// MVP: el "tenant" se identifica por nombre (sin login todavía). La corrida
// resetea los datos previos de ese tenant para que sea re-ejecutable.
import { NextResponse } from 'next/server'
import { adminDb } from '@/src/db/admin'
import { parseCobrosHiopos } from '@/src/ingesta/hiopos/cobros'
import { parseTransaccionesPayway } from '@/src/ingesta/payway'
import { ingestarCobrosBulk, ingestarTransaccionesBulk } from '@/src/ingesta/persistir'
import { conciliarOperativa } from '@/src/matching/operativa'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

function proveedorDeMedio(m: string): 'PAYWAY' | 'MERCADOPAGO' | null {
  if (/cr[eé]dito otras|d[eé]bito otras/i.test(m)) return 'PAYWAY'
  if (/mercado\s*pago/i.test(m)) return 'MERCADOPAGO'
  return null
}

// Corte por tienda: cuenta cobros conciliables (excluye NO_APLICA) por estado
// operativo. Sirve para el desglose por establecimiento del dashboard.
async function resumenPorEstablecimiento(tenantId: string) {
  const [estabs, grupos] = await Promise.all([
    adminDb.establecimiento.findMany({
      where: { tenantId },
      select: { id: true, nombre: true, codTienda: true },
    }),
    adminDb.cobro.groupBy({
      by: ['establecimientoId', 'estadoOp'],
      where: { tenantId, estadoOp: { not: 'NO_APLICA' } },
      _count: { _all: true },
    }),
  ])

  return estabs
    .map((e) => {
      const filas = grupos.filter((g) => g.establecimientoId === e.id)
      const n = (estado: string) =>
        filas.filter((g) => g.estadoOp === estado).reduce((s, g) => s + g._count._all, 0)
      return {
        id: e.id,
        nombre: e.nombre,
        codTienda: e.codTienda,
        ok: n('OK'),
        diferenciaMonto: n('DIFERENCIA_MONTO'),
        enRevision: n('EN_REVISION'),
        sinTransaccion: n('SIN_TRANSACCION'),
        total: filas.reduce((s, g) => s + g._count._all, 0),
      }
    })
    .filter((e) => e.total > 0)
    .sort((a, b) => b.total - a.total)
}

export async function POST(req: Request): Promise<Response> {
  try {
    const form = await req.formData()
    const tenantNombre = String(form.get('tenant') || '').trim() || 'Demo'
    const hioposFile = form.get('hiopos')
    const paywayFile = form.get('payway')
    if (!(hioposFile instanceof File) || !(paywayFile instanceof File)) {
      return NextResponse.json({ error: 'Subí los dos archivos (HIOPOS y Payway).' }, { status: 400 })
    }

    const cobros = parseCobrosHiopos(Buffer.from(await hioposFile.arrayBuffer()).toString('utf8'))
    const transacciones = parseTransaccionesPayway(Buffer.from(await paywayFile.arrayBuffer()))

    // Tenant por nombre (upsert) + reset de la corrida anterior (demo).
    const tenant =
      (await adminDb.tenant.findFirst({ where: { nombre: tenantNombre } })) ??
      (await adminDb.tenant.create({ data: { nombre: tenantNombre } }))
    const tenantId = tenant.id

    await adminDb.match.deleteMany({ where: { tenantId } })
    await adminDb.excepcion.deleteMany({ where: { tenantId } })
    await adminDb.cobro.deleteMany({ where: { tenantId } })
    await adminDb.transaccion.deleteMany({ where: { tenantId } })
    await adminDb.mapeoMedioPago.deleteMany({ where: { tenantId } })

    await adminDb.matchingProfile.upsert({
      where: { tenantId },
      create: { tenantId, ventanaMin: 600, tolMonto: '0' },
      update: { ventanaMin: 600, tolMonto: '0' },
    })
    const medios = [...new Set(cobros.map((c) => c.medioPago))]
    await adminDb.mapeoMedioPago.createMany({
      data: medios.map((m) => ({ tenantId, medioPago: m, proveedor: proveedorDeMedio(m) })),
    })

    await ingestarCobrosBulk(tenantId, cobros)
    await ingestarTransaccionesBulk(tenantId, transacciones)
    const resultado = await conciliarOperativa(tenantId, 'PAYWAY')
    const establecimientos = await resumenPorEstablecimiento(tenantId)

    return NextResponse.json({
      tenant: tenantNombre,
      cobros: cobros.length,
      transacciones: transacciones.length,
      resultado,
      establecimientos,
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
