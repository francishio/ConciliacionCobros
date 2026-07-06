// Etapa 1 — Operativa. Devuelve, para un mes, el consolidado + el detalle por
// ítem: conciliados (cobro↔transacción), cobros en revisión / sin transacción,
// y transacciones sin match (colas para conciliar a mano en la misma grilla).
import { NextResponse } from 'next/server'
import { adminDb } from '@/src/db/admin'
import { resolverTenant } from '@/src/auth/session'
import { resumenMes } from '@/src/carga/resumen'
import { reconciliarMes } from '@/src/carga/bloque'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Cobro = {
  id: string
  fechaHora: Date
  establecimientoId: string | null
  establecimiento: { nombre: string } | null
  medioPago: string
  codMedioPago: string | null
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
  terminal: string | null
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
  terminal: t.terminal,
  ultimos4: t.ultimos4,
  autorizacion: t.codAutorizacion,
  monto: String(t.importeBruto),
  raw: t.raw,
})

const SEL_COBRO = {
  id: true,
  fechaHora: true,
  establecimientoId: true,
  medioPago: true,
  codMedioPago: true,
  marca: true,
  ultimos4: true,
  codAutorizacion: true,
  importe: true,
  estadoOp: true,
  raw: true,
  establecimiento: { select: { nombre: true } },
} as const
const SEL_TRANS = {
  id: true,
  proveedor: true,
  fechaHora: true,
  terminal: true,
  ultimos4: true,
  codAutorizacion: true,
  importeBruto: true,
  raw: true,
} as const

// Re-concilia el mes indicado (forzar recálculo tras cambios de config que no
// disparan reconciliación por sí solos, ej. mapeo de terminal / pasarela).
export async function POST(req: Request): Promise<Response> {
  try {
    const { tenant, periodo } = (await req.json()) as { tenant?: string; periodo?: string }
    if (!periodo || !/^\d{4}-\d{2}$/.test(periodo))
      return NextResponse.json({ error: 'Período inválido.' }, { status: 400 })
    const ctx = await resolverTenant(tenant)
    if (!ctx) return NextResponse.json({ error: 'No se pudo resolver el cliente.' }, { status: 400 })
    await reconciliarMes(ctx.tenantId, periodo)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

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

    const [resumen, matches, cobrosSueltos, mapeos, mapeosEstab] = await Promise.all([
      resumenMes(tenantId, periodo),
      adminDb.match.findMany({
        where: { tenantId, cobro: { periodo } },
        select: { tipo: true, cobro: { select: SEL_COBRO }, transaccion: { select: SEL_TRANS } },
      }),
      adminDb.cobro.findMany({ where: { tenantId, periodo, estadoOp: { in: ['EN_REVISION', 'SIN_TRANSACCION'] } }, select: SEL_COBRO }),
      adminDb.mapeoMedioPago.findMany({ where: { tenantId }, select: { codMedioPago: true, proveedor: true } }),
      adminDb.mapeoEstablecimientoPasarela.findMany({ where: { tenantId }, select: { establecimientoId: true, proveedor: true, codigoExterno: true } }),
    ])

    const matchedTransIds = matches.map((m) => m.transaccion.id)
    const transSueltas = await adminDb.transaccion.findMany({
      where: { tenantId, periodo, estado: 'APROBADA', id: { notIn: matchedTransIds } },
      select: SEL_TRANS,
    })

    const provDeMedio = new Map(mapeos.map((m) => [m.codMedioPago, m.proveedor]))
    // Terminal según la config del establecimiento: (establecimiento|pasarela) → código mapeado.
    const terminalCfg = new Map(mapeosEstab.map((m) => [`${m.establecimientoId}|${m.proveedor}`, m.codigoExterno]))
    const cfgDe = (establecimientoId: string | null, pasarela: string | null) =>
      establecimientoId && pasarela ? terminalCfg.get(`${establecimientoId}|${pasarela}`) ?? null : null

    const items = [
      ...matches.map((m) => {
        const c = m.cobro as Cobro
        const cobro = mapCobro(c)
        const trans = mapTrans(m.transaccion as Trans)
        const dif = Math.abs(Number(cobro.monto) - Number(trans.monto)) >= 0.005
        return {
          tipo: dif ? 'DIFERENCIA' : 'CONCILIADO',
          manual: m.tipo === 'MANUAL',
          pasarela: trans.pasarela,
          terminalConfig: cfgDe(c.establecimientoId, trans.pasarela),
          cobro,
          trans,
        }
      }),
      ...cobrosSueltos.map((c) => {
        const cob = c as Cobro
        const pasarela = cob.codMedioPago ? provDeMedio.get(cob.codMedioPago) ?? null : null
        return {
          tipo: (c as unknown as { estadoOp?: string }).estadoOp === 'EN_REVISION' ? 'EN_REVISION' : 'SIN_TRANSACCION',
          pasarela,
          terminalConfig: cfgDe(cob.establecimientoId, pasarela),
          cobro: mapCobro(cob),
          trans: null,
        }
      }),
      ...transSueltas.map((t) => ({ tipo: 'PASARELA_SIN_MATCH', pasarela: t.proveedor, terminalConfig: null, cobro: null, trans: mapTrans(t as Trans) })),
    ]

    return NextResponse.json({ periodos, resumen, items })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
