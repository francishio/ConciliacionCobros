// Tablero de conciliación de un cliente para un mes (periodo YYYY-MM).
// Métricas por establecimiento y terminal: cantidades (tx, conciliadas,
// pendientes, dif. monto), montos ($ HIOPOS vs $ pasarela) y el cruce INVERSO
// (transacciones de pasarela sin cobro HIOPOS). Solo lectura.
import { adminDb } from '../db/admin'

export interface TerminalFila {
  codTerminal: string
  alias: string | null
  txHiopos: number
  conciliadas: number
  pendientes: number // sin transacción
  difMonto: number
  enRevision: number
  montoHiopos: number
  montoPasarela: number // de las transacciones conciliadas
}
export interface EstablecimientoFila {
  id: string | null
  nombre: string
  codTienda: string | null
  txHiopos: number
  conciliadas: number
  pendientes: number
  difMonto: number
  enRevision: number
  montoHiopos: number
  montoPasarela: number
  txPasarelaSinCobro: number // transacciones de pasarela sin cobro HIOPOS (atribuidas a esta tienda)
  montoPasarelaSinCobro: number
  terminales: TerminalFila[]
}
export interface TableroConciliacion {
  periodo: string
  kpi: {
    cobros: number
    cobrosPasarela: number
    conciliadas: number
    pendientes: number
    difMonto: number
    enRevision: number
    montoHiopos: number
    montoPasarela: number
    txPasarelaSinCobro: number
    montoPasarelaSinCobro: number
    porcentaje: number // % conciliado (conciliadas / cobros)
  }
  establecimientos: EstablecimientoFila[]
  // Transacciones de pasarela sin cobro que NO cuelgan de una tienda (ej. Clover
  // global, sin mapeo de dispositivo → establecimiento).
  pasarelaSinCobroGlobal: { n: number; monto: number }
}

const num = (v: unknown): number => (v == null ? 0 : Number(v))
const r2 = (n: number): number => Math.round(n * 100) / 100

export async function tableroConciliacion(tenantId: string, periodo: string): Promise<TableroConciliacion> {
  const [cobroGroups, establecimientos, matchedRows, inverseRows] = await Promise.all([
    // Cobros conciliables por (establecimiento, terminal, estado): cantidad + monto.
    adminDb.cobro.groupBy({
      by: ['establecimientoId', 'codTerminal', 'aliasTerminal', 'estadoOp'],
      where: { tenantId, periodo, estadoOp: { not: 'NO_APLICA' } },
      _count: { _all: true },
      _sum: { importe: true },
    }),
    adminDb.establecimiento.findMany({ where: { tenantId }, select: { id: true, nombre: true, codTienda: true } }),
    // Monto pasarela conciliado por (establecimiento, terminal): vía match → cobro.
    adminDb.$queryRawUnsafe<{ establecimientoId: string | null; codTerminal: string | null; n: number; monto: number }[]>(
      `SELECT c."establecimientoId", c."codTerminal", count(*)::int AS n, COALESCE(SUM(t."importeBruto"),0)::float8 AS monto
       FROM "match" m
       JOIN "cobro" c ON c.id = m."cobroId"
       JOIN "transaccion" t ON t.id = m."transaccionId"
       WHERE c."tenantId" = $1 AND c."periodo" = $2
       GROUP BY c."establecimientoId", c."codTerminal"`,
      tenantId,
      periodo,
    ),
    // Cruce inverso: transacciones aprobadas sin cobro (sin match), por establecimiento.
    adminDb.$queryRawUnsafe<{ establecimientoId: string | null; n: number; monto: number }[]>(
      `SELECT t."establecimientoId", count(*)::int AS n, COALESCE(SUM(t."importeBruto"),0)::float8 AS monto
       FROM "transaccion" t
       WHERE t."tenantId" = $1 AND t."periodo" = $2 AND t."estado" = 'APROBADA'
         AND NOT EXISTS (SELECT 1 FROM "match" m WHERE m."transaccionId" = t.id)
       GROUP BY t."establecimientoId"`,
      tenantId,
      periodo,
    ),
  ])

  const matchedKey = (e: string | null, t: string | null) => `${e ?? ''}|${t ?? ''}`
  const matchedMap = new Map(matchedRows.map((m) => [matchedKey(m.establecimientoId, m.codTerminal), m]))
  const inverseMap = new Map(inverseRows.map((i) => [i.establecimientoId ?? '', i]))

  // Índice de establecimientos (incluye un bucket null para cobros sin tienda).
  const estabInfo = new Map<string, { nombre: string; codTienda: string | null }>()
  for (const e of establecimientos) estabInfo.set(e.id, { nombre: e.nombre, codTienda: e.codTienda })

  // Agrupar cobroGroups por establecimiento → terminal → estado.
  const idsConDatos = new Set<string>()
  for (const g of cobroGroups) idsConDatos.add(g.establecimientoId ?? '')

  const filas: EstablecimientoFila[] = []
  for (const estabId of idsConDatos) {
    const delEstab = cobroGroups.filter((g) => (g.establecimientoId ?? '') === estabId)
    // Terminales dentro del establecimiento
    const termIds = new Set<string>()
    for (const g of delEstab) termIds.add(g.codTerminal ?? '')

    const terminales: TerminalFila[] = []
    for (const termId of termIds) {
      const delTerm = delEstab.filter((g) => (g.codTerminal ?? '') === termId)
      const cnt = (estado: string) => delTerm.filter((g) => g.estadoOp === estado).reduce((s, g) => s + g._count._all, 0)
      const montoHio = delTerm.reduce((s, g) => s + num(g._sum.importe), 0)
      const matched = matchedMap.get(matchedKey(estabId || null, termId || null))
      const alias = delTerm.find((g) => g.aliasTerminal)?.aliasTerminal ?? null
      terminales.push({
        codTerminal: termId || '—',
        alias,
        txHiopos: delTerm.reduce((s, g) => s + g._count._all, 0),
        conciliadas: cnt('OK'),
        pendientes: cnt('SIN_TRANSACCION'),
        difMonto: cnt('DIFERENCIA_MONTO'),
        enRevision: cnt('EN_REVISION'),
        montoHiopos: r2(montoHio),
        montoPasarela: r2(num(matched?.monto)),
      })
    }
    terminales.sort((a, b) => b.txHiopos - a.txHiopos)

    const cntE = (estado: string) => delEstab.filter((g) => g.estadoOp === estado).reduce((s, g) => s + g._count._all, 0)
    const montoHioE = delEstab.reduce((s, g) => s + num(g._sum.importe), 0)
    const montoPasE = matchedRows
      .filter((m) => (m.establecimientoId ?? '') === estabId)
      .reduce((s, m) => s + num(m.monto), 0)
    const inv = inverseMap.get(estabId)
    const info = estabId ? estabInfo.get(estabId) : undefined

    filas.push({
      id: estabId || null,
      nombre: info?.nombre ?? (estabId ? estabId : '(sin tienda)'),
      codTienda: info?.codTienda ?? null,
      txHiopos: delEstab.reduce((s, g) => s + g._count._all, 0),
      conciliadas: cntE('OK'),
      pendientes: cntE('SIN_TRANSACCION'),
      difMonto: cntE('DIFERENCIA_MONTO'),
      enRevision: cntE('EN_REVISION'),
      montoHiopos: r2(montoHioE),
      montoPasarela: r2(montoPasE),
      txPasarelaSinCobro: inv?.n ?? 0,
      montoPasarelaSinCobro: r2(num(inv?.monto)),
      terminales,
    })
  }
  filas.sort((a, b) => b.txHiopos - a.txHiopos)

  // KPIs del cliente/mes
  const sum = (sel: (f: EstablecimientoFila) => number) => filas.reduce((s, f) => s + sel(f), 0)
  const cobros = sum((f) => f.txHiopos)
  const conciliadas = sum((f) => f.conciliadas)
  const invGlobal = inverseMap.get('') // transacciones sin establecimiento (Clover global)
  const txSinCobroTotal = inverseRows.reduce((s, i) => s + i.n, 0)
  const montoSinCobroTotal = inverseRows.reduce((s, i) => s + num(i.monto), 0)

  return {
    periodo,
    kpi: {
      cobros,
      cobrosPasarela: matchedRows.reduce((s, m) => s + m.n, 0) + txSinCobroTotal,
      conciliadas,
      pendientes: sum((f) => f.pendientes),
      difMonto: sum((f) => f.difMonto),
      enRevision: sum((f) => f.enRevision),
      montoHiopos: r2(sum((f) => f.montoHiopos)),
      montoPasarela: r2(sum((f) => f.montoPasarela)),
      txPasarelaSinCobro: txSinCobroTotal,
      montoPasarelaSinCobro: r2(montoSinCobroTotal),
      porcentaje: cobros > 0 ? Math.round((conciliadas / cobros) * 1000) / 10 : 0,
    },
    establecimientos: filas,
    pasarelaSinCobroGlobal: { n: invGlobal?.n ?? 0, monto: r2(num(invGlobal?.monto)) },
  }
}
