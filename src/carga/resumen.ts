// Resumen de un bloque mensual (periodo YYYY-MM) para el dashboard y la carga:
// KPIs por estado, desglose por establecimiento y COBERTURA (qué pasarelas
// aparecen en HIOPOS y cuáles quedaron sin extracto). Solo lectura.
import { adminDb } from '../db/admin'

export interface ResultadoMes {
  procesados: number
  ok: number
  diferenciaMonto: number
  enRevision: number
  sinTransaccion: number
  noAplica: number
  excepciones: number
}
export interface EstablecimientoMes {
  id: string
  nombre: string
  codTienda: string | null
  ok: number
  diferenciaMonto: number
  enRevision: number
  sinTransaccion: number
  total: number
}
export interface CoberturaPasarela {
  proveedor: string
  nombre: string
  cobros: number
  transacciones: number
  estado: 'CONCILIADA' | 'SIN_EXTRACTO' | 'NO_CONCILIABLE'
}
export interface ResumenMes {
  periodo: string
  cobros: number
  transacciones: number
  resultado: ResultadoMes
  establecimientos: EstablecimientoMes[]
  cobertura: CoberturaPasarela[]
}

export async function resumenMes(tenantId: string, periodo: string): Promise<ResumenMes> {
  const [porEstado, transTotal, excepciones, grupos, estabs, mediosCobro, mapeos, catalogo, transProv] =
    await Promise.all([
      adminDb.cobro.groupBy({ by: ['estadoOp'], where: { tenantId, periodo }, _count: { _all: true } }),
      adminDb.transaccion.count({ where: { tenantId, periodo } }),
      adminDb.excepcion.count({
        where: { tenantId, estado: { in: ['ABIERTA', 'EN_REVISION'] }, cobro: { periodo } },
      }),
      adminDb.cobro.groupBy({
        by: ['establecimientoId', 'estadoOp'],
        where: { tenantId, periodo, estadoOp: { not: 'NO_APLICA' } },
        _count: { _all: true },
      }),
      adminDb.establecimiento.findMany({ where: { tenantId }, select: { id: true, nombre: true, codTienda: true } }),
      adminDb.cobro.groupBy({ by: ['codMedioPago'], where: { tenantId, periodo }, _count: { _all: true } }),
      adminDb.mapeoMedioPago.findMany({ where: { tenantId }, select: { codMedioPago: true, proveedor: true } }),
      adminDb.pasarela.findMany({ select: { codigo: true, nombre: true } }),
      adminDb.transaccion.groupBy({ by: ['proveedor'], where: { tenantId, periodo }, _count: { _all: true } }),
    ])

  const cuenta = (estado: string) =>
    porEstado.filter((g) => g.estadoOp === estado).reduce((s, g) => s + g._count._all, 0)
  const ok = cuenta('OK')
  const diferenciaMonto = cuenta('DIFERENCIA_MONTO')
  const enRevision = cuenta('EN_REVISION')
  const sinTransaccion = cuenta('SIN_TRANSACCION')
  const noAplica = cuenta('NO_APLICA')
  const cobrosTotal = porEstado.reduce((s, g) => s + g._count._all, 0)

  const establecimientos: EstablecimientoMes[] = estabs
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

  // Cobertura: cobros por pasarela (vía Cód. Medio Pago) vs extracto (transacciones).
  const medioAProveedor = new Map(mapeos.map((m) => [m.codMedioPago, m.proveedor]))
  const nombrePasarela = new Map(catalogo.map((p) => [p.codigo, p.nombre]))
  const transPorProveedor = new Map(transProv.map((t) => [t.proveedor, t._count._all]))

  const cobrosPorProveedor = new Map<string | null, number>()
  for (const m of mediosCobro) {
    const prov = m.codMedioPago ? medioAProveedor.get(m.codMedioPago) ?? null : null
    cobrosPorProveedor.set(prov, (cobrosPorProveedor.get(prov) ?? 0) + m._count._all)
  }

  const cobertura: CoberturaPasarela[] = []
  for (const [prov, cobros] of cobrosPorProveedor) {
    if (prov === null) {
      if (cobros > 0)
        cobertura.push({
          proveedor: 'NO_CONCILIABLE',
          nombre: 'No conciliable (efectivo, etc.)',
          cobros,
          transacciones: 0,
          estado: 'NO_CONCILIABLE',
        })
      continue
    }
    const transacciones = transPorProveedor.get(prov) ?? 0
    cobertura.push({
      proveedor: prov,
      nombre: nombrePasarela.get(prov) ?? prov,
      cobros,
      transacciones,
      estado: transacciones > 0 ? 'CONCILIADA' : 'SIN_EXTRACTO',
    })
  }
  cobertura.sort((a, b) => b.cobros - a.cobros)

  return {
    periodo,
    cobros: cobrosTotal,
    transacciones: transTotal,
    resultado: { procesados: ok + diferenciaMonto + enRevision + sinTransaccion, ok, diferenciaMonto, enRevision, sinTransaccion, noAplica, excepciones },
    establecimientos,
    cobertura,
  }
}
