// Match determinístico (arquitectura §7, "caso feliz"): clave compartida 1:1.
//   0. Por ID de pago de la pasarela (Clover: refPasarela == idExterno) — ÚNICO
//      GLOBAL, no exige misma tienda.
//   1. Por código de autorización de tarjeta (Clover / Payway) — scope por tienda.
//   2. Por ticket HIOPOS estampado (MP: external_reference == hioposTicketId).
// Si una clave da más de un candidato libre → ambiguo (no se fuerza el match).
import type { CobroMatch, TransaccionMatch } from './tipos'

export interface IndiceDeterministico {
  porIdExterno: Map<string, TransaccionMatch[]> // idExterno de la pasarela (payment id)
  porCodAutorizacion: Map<string, TransaccionMatch[]>
  porTicket: Map<string, TransaccionMatch[]> // externalReference (MP)
}

function agregar(m: Map<string, TransaccionMatch[]>, clave: string, t: TransaccionMatch): void {
  const arr = m.get(clave)
  if (arr) arr.push(t)
  else m.set(clave, [t])
}

export function indexarTransacciones(transacciones: TransaccionMatch[]): IndiceDeterministico {
  const porIdExterno = new Map<string, TransaccionMatch[]>()
  const porCodAutorizacion = new Map<string, TransaccionMatch[]>()
  const porTicket = new Map<string, TransaccionMatch[]>()
  for (const t of transacciones) {
    if (t.idExterno) agregar(porIdExterno, t.idExterno, t)
    if (t.codAutorizacion) agregar(porCodAutorizacion, t.codAutorizacion, t)
    if (t.externalReference) agregar(porTicket, t.externalReference, t)
  }
  return { porIdExterno, porCodAutorizacion, porTicket }
}

export type ResultadoDeterministico =
  | { tipo: 'match'; transaccion: TransaccionMatch }
  | { tipo: 'ambiguo' }
  | { tipo: 'sin_match' }

// Scope por establecimiento: solo cruza dentro de la misma tienda (terminal).
const mismoEstab = (cobro: CobroMatch, t: TransaccionMatch): boolean =>
  cobro.establecimientoId != null && t.establecimientoId != null && cobro.establecimientoId === t.establecimientoId

export function matchDeterministico(
  cobro: CobroMatch,
  idx: IndiceDeterministico,
  usadas: Set<string>,
): ResultadoDeterministico {
  // 0. Por ID de pago de la pasarela (Clover): clave ÚNICA GLOBAL → no exige
  //    misma tienda. HIOPOS estampa el payment id en refPasarela.
  if (cobro.refPasarela) {
    const cands0 = (idx.porIdExterno.get(cobro.refPasarela) ?? []).filter((t) => !usadas.has(t.id))
    if (cands0.length === 1) return { tipo: 'match', transaccion: cands0[0] }
    if (cands0.length > 1) return { tipo: 'ambiguo' }
  }
  // 1. Por código de autorización (tarjeta)
  if (cobro.codAutorizacion) {
    const cands = (idx.porCodAutorizacion.get(cobro.codAutorizacion) ?? []).filter(
      (t) => !usadas.has(t.id) && mismoEstab(cobro, t),
    )
    if (cands.length === 1) return { tipo: 'match', transaccion: cands[0] }
    if (cands.length > 1) return { tipo: 'ambiguo' }
  }
  // 2. Por ticket estampado (MP)
  const cands2 = (idx.porTicket.get(cobro.hioposTicketId) ?? []).filter((t) => !usadas.has(t.id) && mismoEstab(cobro, t))
  if (cands2.length === 1) return { tipo: 'match', transaccion: cands2[0] }
  if (cands2.length > 1) return { tipo: 'ambiguo' }

  return { tipo: 'sin_match' }
}
