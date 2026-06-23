// Match fuzzy (arquitectura §7, fallback sin clave compartida).
// Gate obligatorio: importe dentro de tolerancia + fecha dentro de ventana.
// Luego narrowing progresivo por últimos4 y marca (si ambos lados los tienen).
// Candidato único → match; varios → ambiguo (a revisión, nunca se fuerza).
//
// Nota sobre la ventana: si los datos vienen sin hora (medianoche), el cruce
// por minutos equivale a "mismo día" (el día siguiente está a 1440 min).
import type { Cobro, Transaccion } from '@prisma/client'

export interface ParametrosFuzzy {
  tolMonto: number
  ventanaMin: number
}

export type ResultadoFuzzy =
  | { tipo: 'match'; transaccion: Transaccion; score: number }
  | { tipo: 'ambiguo'; candidatos: number }
  | { tipo: 'sin_match' }

const igual = (a: string | null, b: string | null): boolean =>
  a != null && b != null && a.trim().toUpperCase() === b.trim().toUpperCase()

function puntuar(cobro: Cobro, t: Transaccion): number {
  let s = 0.5
  if (igual(cobro.ultimos4, t.ultimos4)) s += 0.3
  if (igual(cobro.marca, t.marca)) s += 0.15
  if (cobro.tipoTarjeta && cobro.tipoTarjeta === t.tipoTarjeta) s += 0.1
  return Math.min(s, 1)
}

export function matchFuzzy(
  cobro: Cobro,
  transacciones: Transaccion[],
  usadas: Set<string>,
  p: ParametrosFuzzy,
): ResultadoFuzzy {
  const importeCobro = Number(cobro.importe)
  const ventanaMs = p.ventanaMin * 60_000

  // Gate: importe dentro de tolerancia + fecha dentro de ventana, no usada.
  let cands = transacciones.filter(
    (t) =>
      !usadas.has(t.id) &&
      Math.abs(importeCobro - Number(t.importeBruto)) <= p.tolMonto &&
      Math.abs(cobro.fechaHora.getTime() - t.fechaHora.getTime()) <= ventanaMs,
  )
  if (cands.length === 0) return { tipo: 'sin_match' }

  // Narrowing por últimos4 (si el cobro lo tiene y algún candidato coincide).
  if (cands.length > 1 && cobro.ultimos4) {
    const refinado = cands.filter((t) => igual(cobro.ultimos4, t.ultimos4))
    if (refinado.length > 0) cands = refinado
  }
  // Narrowing por marca (si el cobro la tiene y algún candidato coincide).
  if (cands.length > 1 && cobro.marca) {
    const refinado = cands.filter((t) => igual(cobro.marca, t.marca))
    if (refinado.length > 0) cands = refinado
  }
  // Narrowing por tipo crédito/débito (desempate; no descarta si ninguno coincide).
  if (cands.length > 1 && cobro.tipoTarjeta) {
    const refinado = cands.filter((t) => t.tipoTarjeta === cobro.tipoTarjeta)
    if (refinado.length > 0) cands = refinado
  }

  if (cands.length === 1) return { tipo: 'match', transaccion: cands[0], score: puntuar(cobro, cands[0]) }
  return { tipo: 'ambiguo', candidatos: cands.length }
}
