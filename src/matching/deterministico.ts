// Match determinístico (arquitectura §7, "caso feliz"): clave compartida 1:1.
//   1. Por código de autorización de tarjeta (Clover / Payway).
//   2. Por ticket HIOPOS estampado (MP: external_reference == hioposTicketId).
// Si una clave da más de un candidato libre → ambiguo (no se fuerza el match).
import type { Cobro, Transaccion } from '@prisma/client'

export interface IndiceDeterministico {
  porCodAutorizacion: Map<string, Transaccion[]>
  porTicket: Map<string, Transaccion[]> // externalReference (MP)
}

function agregar(m: Map<string, Transaccion[]>, clave: string, t: Transaccion): void {
  const arr = m.get(clave)
  if (arr) arr.push(t)
  else m.set(clave, [t])
}

export function indexarTransacciones(transacciones: Transaccion[]): IndiceDeterministico {
  const porCodAutorizacion = new Map<string, Transaccion[]>()
  const porTicket = new Map<string, Transaccion[]>()
  for (const t of transacciones) {
    if (t.codAutorizacion) agregar(porCodAutorizacion, t.codAutorizacion, t)
    if (t.externalReference) agregar(porTicket, t.externalReference, t)
  }
  return { porCodAutorizacion, porTicket }
}

export type ResultadoDeterministico =
  | { tipo: 'match'; transaccion: Transaccion }
  | { tipo: 'ambiguo' }
  | { tipo: 'sin_match' }

export function matchDeterministico(
  cobro: Cobro,
  idx: IndiceDeterministico,
  usadas: Set<string>,
): ResultadoDeterministico {
  // 1. Por código de autorización (tarjeta)
  if (cobro.codAutorizacion) {
    const cands = (idx.porCodAutorizacion.get(cobro.codAutorizacion) ?? []).filter((t) => !usadas.has(t.id))
    if (cands.length === 1) return { tipo: 'match', transaccion: cands[0] }
    if (cands.length > 1) return { tipo: 'ambiguo' }
  }
  // 2. Por ticket estampado (MP)
  const cands2 = (idx.porTicket.get(cobro.hioposTicketId) ?? []).filter((t) => !usadas.has(t.id))
  if (cands2.length === 1) return { tipo: 'match', transaccion: cands2[0] }
  if (cands2.length > 1) return { tipo: 'ambiguo' }

  return { tipo: 'sin_match' }
}
