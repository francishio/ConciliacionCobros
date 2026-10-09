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
} as const

const mapSinCobro = (t: {
  id: string
  fechaHora: Date
  proveedor: string
  idExterno: string
  importeBruto: unknown
  codAutorizacion: string | null
  ultimos4: string | null
  terminal: string | null
}) => ({
  id: t.id,
  fechaHiopos: null, // no hay cobro HIOPOS
  fechaPasarela: t.fechaHora,
  // Columnas HIO vacías (es una transacción de pasarela sin cobro HIOPOS).
  terminal: null,
  medioPago: null,
  autorizacion: null,
  ultimos4: null,
  montoHiopos: null,
  estado: 'PASARELA_SIN_COBRO',
  manual: false,
  // ID de pago (clave de cruce): del lado pasarela.
  idPago: t.idExterno,
  // Datos de pasarela
  dispositivo: t.terminal, // el MID / dispositivo de la pasarela
  pasarela: t.proveedor,
  montoPasarela: Number(t.importeBruto),
})

export async function GET(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url)
    const ctx = await resolverTenant(url.searchParams.get('tenant'))
    if (!ctx) return NextResponse.json({ error: 'Elegí un cliente.' }, { status: 400 })
    const periodo = (url.searchParams.get('periodo') ?? '').trim()
    if (!/^\d{4}-\d{2}$/.test(periodo)) return NextResponse.json({ error: 'Período inválido.' }, { status: 400 })
    const tenantId = ctx.tenantId
    const scope = url.searchParams.get('scope')

    // Modo "sin cobro global": todas las transacciones de pasarela sin match.
    if (scope === 'sincobro') {
      const trans = await adminDb.transaccion.findMany({
        where: { tenantId, periodo, estado: 'APROBADA', matches: { none: {} } },
        orderBy: { fechaHora: 'asc' },
        select: SEL_TRANS,
      })
      return NextResponse.json({ items: trans.map(mapSinCobro) })
    }

    const estab = (url.searchParams.get('estab') ?? '').trim() || null

    const [cobros, transSinCobro] = await Promise.all([
      adminDb.cobro.findMany({
        where: { tenantId, periodo, establecimientoId: estab, estadoOp: { not: 'NO_APLICA' } },
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
              transaccion: { select: { proveedor: true, idExterno: true, importeBruto: true, codAutorizacion: true, terminal: true, fechaHora: true } },
            },
          },
        },
      }),
      // Transacciones de pasarela sin cobro atribuidas a este establecimiento.
      adminDb.transaccion.findMany({
        where: { tenantId, periodo, estado: 'APROBADA', establecimientoId: estab, matches: { none: {} } },
        orderBy: { fechaHora: 'asc' },
        select: SEL_TRANS,
      }),
    ])

    const items = [
      ...cobros.map((c) => {
        const t = c.matches[0]?.transaccion ?? null
        return {
          id: c.id,
          fechaHiopos: c.fechaHora,
          fechaPasarela: t ? t.fechaHora : null,
          terminal: c.aliasTerminal ?? c.codTerminal ?? null,
          medioPago: c.medioPago,
          autorizacion: c.codAutorizacion,
          ultimos4: c.ultimos4,
          montoHiopos: Number(c.importe),
          estado: ESTADO[c.estadoOp] ?? c.estadoOp,
          manual: c.matches[0]?.tipo === 'MANUAL',
          // ID de pago: el que estampó HIOPOS (= el de la pasarela cuando concilió).
          idPago: c.refPasarela ?? (t ? t.idExterno : null),
          dispositivo: t ? t.terminal : null,
          pasarela: t ? t.proveedor : null,
          montoPasarela: t ? Number(t.importeBruto) : null,
        }
      }),
      ...transSinCobro.map(mapSinCobro),
    ]

    return NextResponse.json({ items })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
