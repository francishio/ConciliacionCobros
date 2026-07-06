// Etapa 1 — Operativa. Devuelve, para un mes, el consolidado + el detalle por
// ítem: conciliados (cobro↔transacción), cobros en revisión / sin transacción,
// y transacciones sin match (colas para conciliar a mano en la misma grilla).
import { NextResponse } from 'next/server'
import { adminDb } from '@/src/db/admin'
import { resolverTenant } from '@/src/auth/session'
import { resumenMes } from '@/src/carga/resumen'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Cobro = {
  id: string
  fechaHora: Date
  establecimiento: { nombre: string } | null
  medioPago: string
  marca: string | null
  ultimos4: string | null
  codAutorizacion: string | null
  importe: unknown
  raw: unknown
}
type Trans = {
  id: string
  proveedor: string
  fechaHora: Date
  ultimos4: string | null
  codAutorizacion: string | null
  importeBruto: unknown
  raw: unknown
}

const mapCobro = (c: Cobro) => ({
  id: c.id,
  fechaHora: c.fechaHora,
  tienda: c.establecimiento?.nombre ?? null,
  medioPago: c.medioPago,
  titular: c.marca,
  ultimos4: c.ultimos4,
  autorizacion: c.codAutorizacion,
  monto: String(c.importe),
  raw: c.raw,
})
const mapTrans = (t: Trans) => ({
  id: t.id,
  pasarela: t.proveedor,
  fechaHora: t.fechaHora,
  ultimos4: t.ultimos4,
  autorizacion: t.codAutorizacion,
  monto: String(t.importeBruto),
  raw: t.raw,
})

const SEL_COBRO = {
  id: true,
  fechaHora: true,
  medioPago: true,
  marca: true,
  ultimos4: true,
  codAutorizacion: true,
  importe: true,
  estadoOp: true,
  raw: true,
  establecimiento: { select: { nombre: true } },
} as const

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
    if (!periodo) return NextResponse.json({ periodos: [], resumen: null, items: [] })

    const [resumen, matches, cobrosSueltos, mapeos] = await Promise.all([
      resumenMes(tenantId, periodo),
      adminDb.match.findMany({
        where: { tenantId, cobro: { periodo } },
        select: {
          cobro: { select: SEL_COBRO },
          transaccion: {
            select: { id: true, proveedor: true, fechaHora: true, ultimos4: true, codAutorizacion: true, importeBruto: true, raw: true },
          },
        },
      }),
      adminDb.cobro.findMany({ where: { tenantId, periodo, estadoOp: { in: ['EN_REVISION', 'SIN_TRANSACCION'] } }, select: SEL_COBRO }),
      adminDb.mapeoMedioPago.findMany({ where: { tenantId }, select: { medioPago: true, proveedor: true } }),
    ])

    const matchedTransIds = matches.map((m) => m.transaccion.id)
    const transSueltas = await adminDb.transaccion.findMany({
      where: { tenantId, periodo, estado: 'APROBADA', id: { notIn: matchedTransIds } },
      select: { id: true, proveedor: true, fechaHora: true, ultimos4: true, codAutorizacion: true, importeBruto: true, raw: true },
    })

    const provDeMedio = new Map(mapeos.map((m) => [m.medioPago, m.proveedor]))

    const items = [
      ...matches.map((m) => {
        const cobro = mapCobro(m.cobro as Cobro)
        const trans = mapTrans(m.transaccion as Trans)
        const dif = Math.abs(Number(cobro.monto) - Number(trans.monto)) >= 0.005
        return { tipo: dif ? 'DIFERENCIA' : 'CONCILIADO', pasarela: trans.pasarela, cobro, trans }
      }),
      ...cobrosSueltos.map((c) => ({
        tipo: (c as unknown as { estadoOp?: string }).estadoOp === 'EN_REVISION' ? 'EN_REVISION' : 'SIN_TRANSACCION',
        pasarela: provDeMedio.get(c.medioPago) ?? null,
        cobro: mapCobro(c as Cobro),
        trans: null,
      })),
      ...transSueltas.map((t) => ({ tipo: 'PASARELA_SIN_MATCH', pasarela: t.proveedor, cobro: null, trans: mapTrans(t as Trans) })),
    ]

    return NextResponse.json({ periodos, resumen, items })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
