// Detalle por transacción:
//  - estab mode (?estab=<id|vacío>): cada cobro HIOPOS del establecimiento con su
//    estado + la transacción de pasarela conciliada (si la hay), y las
//    transacciones de pasarela SIN cobro atribuidas a ese establecimiento.
//  - scope=sincobro: todas las transacciones de pasarela sin cobro del cliente/mes
//    (el cruce inverso, ej. Clover global).
import { NextResponse } from 'next/server'
import { adminDb } from '@/src/db/admin'
import { resolverTenant } from '@/src/auth/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ESTADO: Record<string, string> = {
  OK: 'CONCILIADO',
  DIFERENCIA_MONTO: 'DIFERENCIA',
  EN_REVISION: 'EN_REVISION',
  SIN_TRANSACCION: 'SIN_TRANSACCION',
}

const SEL_TRANS = {
  id: true,
  fechaHora: true,
  proveedor: true,
  idExterno: true,
  importeBruto: true,
  codAutorizacion: true,
  ultimos4: true,
  terminal: true,
  deviceId: true,
} as const

interface TransSel {
  id: string
  fechaHora: Date
  proveedor: string
  idExterno: string
  importeBruto: unknown
  codAutorizacion: string | null
  ultimos4: string | null
  terminal: string | null
  deviceId: string | null
}

export async function GET(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url)
    const ctx = await resolverTenant(url.searchParams.get('tenant'))
    if (!ctx) return NextResponse.json({ error: 'Elegí un cliente.' }, { status: 400 })
    const periodo = (url.searchParams.get('periodo') ?? '').trim()
    if (!/^\d{4}-\d{2}$/.test(periodo)) return NextResponse.json({ error: 'Período inválido.' }, { status: 400 })
    const tenantId = ctx.tenantId
    const scope = url.searchParams.get('scope')

    // Filtro opcional de un día (YYYY-MM-DD), en hora de Argentina (UTC-3).
    const dia = (url.searchParams.get('dia') ?? '').trim()
    const rango = /^\d{4}-\d{2}-\d{2}$/.test(dia)
      ? (() => {
          const [y, m, d] = dia.split('-').map(Number)
          return { gte: new Date(Date.UTC(y, m - 1, d, 3, 0, 0)), lt: new Date(Date.UTC(y, m - 1, d + 1, 3, 0, 0)) }
        })()
      : null
    const rangoWhere = rango ? { fechaHora: { gte: rango.gte, lt: rango.lt } } : {}

    // Nombre del dispositivo (Clover device.id → nombre) para mostrarlo en vez del MID.
    const devs = await adminDb.dispositivoPasarela.findMany({ where: { tenantId }, select: { deviceId: true, deviceNombre: true } })
    const devMap = new Map(devs.map((d) => [d.deviceId, d.deviceNombre]))
    const dispOf = (deviceId: string | null, terminal: string | null): string | null =>
      (deviceId ? devMap.get(deviceId) ?? null : null) || terminal

    const mapSinCobro = (t: TransSel) => ({
      id: t.id,
      fechaHiopos: null as Date | null, // no hay cobro HIOPOS
      fechaPasarela: t.fechaHora as Date | null,
      // Columnas HIO vacías (es una transacción de pasarela sin cobro HIOPOS).
      terminal: null,
      medioPago: null,
      autorizacion: null,
      ultimos4: null,
      montoHiopos: null,
      estado: 'PASARELA_SIN_COBRO',
      manual: false,
      idPago: t.idExterno, // clave de cruce, del lado pasarela
      dispositivo: dispOf(t.deviceId, t.terminal), // nombre del dispositivo (o MID de fallback)
      pasarela: t.proveedor,
      montoPasarela: Number(t.importeBruto),
    })

    // Modo "sin cobro global": todas las transacciones de pasarela sin match.
    if (scope === 'sincobro') {
      const trans = await adminDb.transaccion.findMany({
        where: { tenantId, periodo, estado: 'APROBADA', matches: { none: {} }, ...rangoWhere },
        orderBy: { fechaHora: 'asc' },
        select: SEL_TRANS,
      })
      return NextResponse.json({ items: trans.map(mapSinCobro) })
    }

    const estab = (url.searchParams.get('estab') ?? '').trim() || null

    const [cobros, transSinCobro] = await Promise.all([
      adminDb.cobro.findMany({
        where: { tenantId, periodo, establecimientoId: estab, estadoOp: { not: 'NO_APLICA' }, ...rangoWhere },
        orderBy: { fechaHora: 'asc' },
        select: {
          id: true,
          fechaHora: true,
          medioPago: true,
          codAutorizacion: true,
          ultimos4: true,
          importe: true,
          estadoOp: true,
          aliasTerminal: true,
          codTerminal: true,
          refPasarela: true,
          matches: {
            select: {
              tipo: true,
              transaccion: { select: { proveedor: true, idExterno: true, importeBruto: true, codAutorizacion: true, terminal: true, deviceId: true, fechaHora: true } },
            },
          },
        },
      }),
      // Transacciones de pasarela sin cobro atribuidas a este establecimiento.
      adminDb.transaccion.findMany({
        where: { tenantId, periodo, estado: 'APROBADA', establecimientoId: estab, matches: { none: {} }, ...rangoWhere },
        orderBy: { fechaHora: 'asc' },
        select: SEL_TRANS,
      }),
    ])

    const items = [
      ...cobros.map((c) => {
        const t = c.matches[0]?.transaccion ?? null
        return {
          id: c.id,
          fechaHiopos: c.fechaHora as Date | null,
          fechaPasarela: (t ? t.fechaHora : null) as Date | null,
          terminal: c.aliasTerminal ?? c.codTerminal ?? null,
          medioPago: c.medioPago,
          autorizacion: c.codAutorizacion,
          ultimos4: c.ultimos4,
          montoHiopos: Number(c.importe),
          estado: ESTADO[c.estadoOp] ?? c.estadoOp,
          manual: c.matches[0]?.tipo === 'MANUAL',
          // ID de pago: el que estampó HIOPOS (= el de la pasarela cuando concilió).
          idPago: c.refPasarela ?? (t ? t.idExterno : null),
          dispositivo: t ? dispOf(t.deviceId, t.terminal) : null,
          pasarela: t ? t.proveedor : null,
          montoPasarela: t ? Number(t.importeBruto) : null,
        }
      }),
      ...transSinCobro.map(mapSinCobro),
    ]

    // Orden cronológico unificado (conciliados y sin-cobro mezclados) por la fecha
    // que aplique a cada fila: la de HIOPOS si existe, si no la de la pasarela.
    items.sort((a, b) => {
      const da = a.fechaHiopos ?? a.fechaPasarela
      const db = b.fechaHiopos ?? b.fechaPasarela
      return (da ? da.getTime() : 0) - (db ? db.getTime() : 0)
    })

    return NextResponse.json({ items })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
