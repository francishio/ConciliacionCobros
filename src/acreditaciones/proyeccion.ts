// Proyección del flujo de acreditaciones: sobre las TRANSACCIONES DE LA PASARELA
// (lo que el adquirente procesó, independiente de HIOPOS), aplica las reglas de
// liquidación (plazo + comisión por tipo de cobro) para estimar CUÁNDO y CUÁNTO
// NETO se acredita al banco. Vista SEMANAL: tipo de cobro × semana (pivot).
import { adminDb } from '../db/admin'
import { clasificarTipoCobro } from './tipo-cobro'

export interface Celda {
  n: number
  bruto: number
  comision: number
  neto: number
}
export interface Semana {
  inicio: string // lunes (YYYY-MM-DD)
  fin: string // domingo (YYYY-MM-DD)
  label: string // "06–12/10"
}
export interface FilaTipo {
  tipo: string // DEBITO / CREDITO / QR / PREPAGA / DEVOLUCION / OTRO
  total: Celda
  porSemana: Record<string, Celda> // clave = inicio de semana
}
export interface Proyeccion {
  semanas: Semana[] // columnas
  filas: FilaTipo[] // una por tipo de cobro (con datos)
  totalPorSemana: Record<string, Celda> // fila de totales por semana
  total: Celda
  sinRegla: number
}

const r2 = (n: number) => Math.round(n * 100) / 100
const celdaCero = (): Celda => ({ n: 0, bruto: 0, comision: 0, neto: 0 })
function acum(c: Celda, bruto: number, comision: number, neto: number) {
  c.n++
  c.bruto += bruto
  c.comision += comision
  c.neto += neto
}
const fixCelda = (c: Celda): Celda => ({ n: c.n, bruto: r2(c.bruto), comision: r2(c.comision), neto: r2(c.neto) })

// Fecha AR (YYYY-MM-DD) de la venta + N días (corridos o hábiles). Sin feriados.
function sumarDias(fechaHora: Date, dias: number, habiles: boolean): string {
  const ar = new Date(fechaHora.getTime() - 3 * 3600_000)
  let d = new Date(Date.UTC(ar.getUTCFullYear(), ar.getUTCMonth(), ar.getUTCDate()))
  if (!habiles) {
    d = new Date(d.getTime() + dias * 86_400_000)
  } else {
    let sumados = 0
    while (sumados < dias) {
      d = new Date(d.getTime() + 86_400_000)
      const dow = d.getUTCDay()
      if (dow !== 0 && dow !== 6) sumados++
    }
  }
  return d.toISOString().slice(0, 10)
}

// Lunes (inicio de semana) de una fecha YYYY-MM-DD.
function lunesDe(fechaISO: string): string {
  const [y, m, d] = fechaISO.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  const dow = dt.getUTCDay() // 0=Dom..6=Sáb
  const diff = dow === 0 ? -6 : 1 - dow
  return new Date(dt.getTime() + diff * 86_400_000).toISOString().slice(0, 10)
}
const ddmm = (iso: string) => {
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}

export async function proyectarAcreditaciones(tenantId: string, periodo: string): Promise<Proyeccion> {
  const [trans, reglas] = await Promise.all([
    adminDb.transaccion.findMany({
      where: { tenantId, periodo, estado: 'APROBADA' },
      select: { importeBruto: true, fechaHora: true, proveedor: true, tipoTarjeta: true, raw: true },
    }),
    adminDb.reglaLiquidacion.findMany({
      where: { tenantId },
      select: { proveedor: true, tipoCobro: true, plazoDias: true, habiles: true, comisionPct: true },
    }),
  ])

  const reglaDe = new Map(reglas.map((r) => [`${r.proveedor}|${r.tipoCobro}`, r]))
  const filas = new Map<string, FilaTipo>()
  const totalPorSemana = new Map<string, Celda>()
  const total = celdaCero()
  const semanasSet = new Set<string>()
  let sinRegla = 0

  for (const t of trans) {
    const bruto = Number(t.importeBruto)
    const tipo = clasificarTipoCobro(t.raw, t.tipoTarjeta as string | null, bruto)
    const regla = reglaDe.get(`${t.proveedor}|${tipo}`)
    if (!regla) sinRegla++

    const pct = regla ? Number(regla.comisionPct) : 0
    const comision = r2((bruto * pct) / 100)
    const neto = r2(bruto - comision)
    const semana = lunesDe(sumarDias(t.fechaHora, regla?.plazoDias ?? 0, regla?.habiles ?? false))
    semanasSet.add(semana)

    const fila = filas.get(tipo) ?? { tipo, total: celdaCero(), porSemana: {} }
    const celda = fila.porSemana[semana] ?? celdaCero()
    acum(celda, bruto, comision, neto)
    fila.porSemana[semana] = celda
    acum(fila.total, bruto, comision, neto)
    filas.set(tipo, fila)

    const ts = totalPorSemana.get(semana) ?? celdaCero()
    acum(ts, bruto, comision, neto)
    totalPorSemana.set(semana, ts)

    acum(total, bruto, comision, neto)
  }

  const semanas: Semana[] = [...semanasSet]
    .sort()
    .map((inicio) => {
      const fin = new Date(new Date(inicio + 'T00:00:00Z').getTime() + 6 * 86_400_000).toISOString().slice(0, 10)
      return { inicio, fin, label: `${ddmm(inicio)}–${ddmm(fin)}` }
    })

  return {
    semanas,
    filas: [...filas.values()]
      .map((f) => ({ tipo: f.tipo, total: fixCelda(f.total), porSemana: Object.fromEntries(Object.entries(f.porSemana).map(([k, v]) => [k, fixCelda(v)])) }))
      .sort((a, b) => b.total.bruto - a.total.bruto),
    totalPorSemana: Object.fromEntries([...totalPorSemana.entries()].map(([k, v]) => [k, fixCelda(v)])),
    total: fixCelda(total),
    sinRegla,
  }
}
