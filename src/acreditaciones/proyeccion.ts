// Proyección del flujo de acreditaciones: sobre las TRANSACCIONES DE LA PASARELA
// (lo que el adquirente procesó, independiente de HIOPOS), aplica las reglas de
// liquidación (plazo + comisión por tipo de cobro) para estimar CUÁNDO y CUÁNTO
// NETO se acredita al banco.
import { adminDb } from '../db/admin'
import { clasificarTipoCobro } from './tipo-cobro'

export interface DiaAcreditacion {
  fecha: string // YYYY-MM-DD (fecha estimada de acreditación, AR)
  n: number
  bruto: number
  comision: number
  neto: number
}
export interface TipoAcreditacion {
  tipo: string // DEBITO / CREDITO / QR / OTRO
  n: number
  bruto: number
  comision: number
  neto: number
}
export interface Proyeccion {
  porDia: DiaAcreditacion[]
  porTipo: TipoAcreditacion[]
  totales: { n: number; bruto: number; comision: number; neto: number }
  sinRegla: number // transacciones sin regla cargada (se proyectan con plazo 0 / comisión 0)
}

const r2 = (n: number) => Math.round(n * 100) / 100

// Fecha AR (YYYY-MM-DD) + N días (corridos o hábiles). Sin feriados.
function sumarDias(fechaHora: Date, dias: number, habiles: boolean): string {
  const ar = new Date(fechaHora.getTime() - 3 * 3600_000) // a hora AR
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

  const dias = new Map<string, DiaAcreditacion>()
  const tipos = new Map<string, TipoAcreditacion>()
  const tot = { n: 0, bruto: 0, comision: 0, neto: 0 }
  let sinRegla = 0

  for (const t of trans) {
    const bruto = Number(t.importeBruto)
    const tipo = clasificarTipoCobro(t.raw, t.tipoTarjeta as string | null, bruto)
    const regla = reglaDe.get(`${t.proveedor}|${tipo}`)
    if (!regla) sinRegla++

    const plazo = regla?.plazoDias ?? 0
    const habiles = regla?.habiles ?? false
    const pct = regla ? Number(regla.comisionPct) : 0
    const comision = r2((bruto * pct) / 100)
    const neto = r2(bruto - comision)
    const fecha = sumarDias(t.fechaHora, plazo, habiles)

    const d = dias.get(fecha) ?? { fecha, n: 0, bruto: 0, comision: 0, neto: 0 }
    d.n++; d.bruto += bruto; d.comision += comision; d.neto += neto
    dias.set(fecha, d)

    const tp = tipos.get(tipo) ?? { tipo, n: 0, bruto: 0, comision: 0, neto: 0 }
    tp.n++; tp.bruto += bruto; tp.comision += comision; tp.neto += neto
    tipos.set(tipo, tp)

    tot.n++; tot.bruto += bruto; tot.comision += comision; tot.neto += neto
  }

  const fix = <T extends { bruto: number; comision: number; neto: number }>(x: T): T => ({ ...x, bruto: r2(x.bruto), comision: r2(x.comision), neto: r2(x.neto) })

  return {
    porDia: [...dias.values()].map(fix).sort((a, b) => a.fecha.localeCompare(b.fecha)),
    porTipo: [...tipos.values()].map(fix).sort((a, b) => b.bruto - a.bruto),
    totales: { n: tot.n, bruto: r2(tot.bruto), comision: r2(tot.comision), neto: r2(tot.neto) },
    sinRegla,
  }
}
