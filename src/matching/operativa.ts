// Orquestador de la conciliación operativa (cobro ↔ transacción) POR PROVEEDOR.
// La expo de HIOPOS trae todos los medios de pago juntos; el MapeoMedioPago del
// tenant define qué medio pertenece a qué conciliación (proveedor) o si es NO
// CONCILIABLE (→ NO_APLICA, ej. EFECTIVO). Cada proveedor es un cruce separado.
//
// Escala: hace LECTURA → CÓMPUTO en memoria → ESCRITURA en lotes
// (createMany / updateMany), así un mes completo (miles de cobros) no excede el
// timeout de transacción. La asignación es 1:1 (una transacción no se reusa).
import type { EstadoOperativa, Proveedor, TipoExcepcion } from '@prisma/client'
import { withTenant } from '../db/tenant'
import { indexarTransacciones, matchDeterministico } from './deterministico'
import { matchFuzzy } from './fuzzy'
import { estadoOperativaPorMonto } from './estado'
import type { TransaccionMatch } from './tipos'

export interface ResultadoConciliacionOperativa {
  proveedor: Proveedor
  cobrosPendientes: number
  procesados: number
  deterministico: number
  fuzzy: number
  ok: number
  diferenciaMonto: number
  enRevision: number
  sinTransaccion: number
  noAplica: number
  sinMapeo: number
  excepciones: number
}

interface PlanMatch {
  cobroId: string
  transaccionId: string
  tipo: 'DETERMINISTICO' | 'FUZZY'
  score: number | null
}
interface PlanExcepcion {
  cobroId: string
  tipo: TipoExcepcion
  nota: string
}

const LOTE = 500

export async function conciliarOperativa(
  tenantId: string,
  proveedor: Proveedor,
): Promise<ResultadoConciliacionOperativa> {
  // ─── 1. LECTURA ───────────────────────────────────────────────────
  const datos = await withTenant(tenantId, async (tx) => ({
    profile: await tx.matchingProfile.findUnique({ where: { tenantId } }),
    mapeos: await tx.mapeoMedioPago.findMany(),
    cobros: await tx.cobro.findMany({ where: { estadoOp: 'PENDIENTE' }, omit: { raw: true } }),
    transacciones: await tx.transaccion.findMany({ where: { estado: 'APROBADA', proveedor }, omit: { raw: true } }),
    usadas: (await tx.match.findMany({ select: { transaccionId: true } })).map((m) => m.transaccionId),
  }))

  const tolMonto = datos.profile ? Number(datos.profile.tolMonto) : 0
  const ventanaMin = datos.profile?.ventanaMin ?? 5
  const provDeMedio = new Map(datos.mapeos.map((m) => [m.medioPago, m.proveedor]))

  // ─── 2. CÓMPUTO (en memoria) ──────────────────────────────────────
  const planMatches: PlanMatch[] = []
  const planExcepciones: PlanExcepcion[] = []
  const planEstados = new Map<EstadoOperativa, string[]>()
  const setEstado = (est: EstadoOperativa, id: string): void => {
    const a = planEstados.get(est)
    if (a) a.push(id)
    else planEstados.set(est, [id])
  }
  const usadas = new Set(datos.usadas)
  const idx = indexarTransacciones(datos.transacciones)

  const r: ResultadoConciliacionOperativa = {
    proveedor, cobrosPendientes: datos.cobros.length, procesados: 0,
    deterministico: 0, fuzzy: 0, ok: 0, diferenciaMonto: 0,
    enRevision: 0, sinTransaccion: 0, noAplica: 0, sinMapeo: 0, excepciones: 0,
  }

  const concluirMatch = (
    cobroId: string, importeCobro: string, transaccion: TransaccionMatch,
    tipo: 'DETERMINISTICO' | 'FUZZY', score: number | null,
  ): void => {
    usadas.add(transaccion.id)
    planMatches.push({ cobroId, transaccionId: transaccion.id, tipo, score })
    const est = estadoOperativaPorMonto(importeCobro, transaccion.importeBruto.toString(), String(tolMonto))
    setEstado(est, cobroId)
    if (est === 'OK') r.ok++
    else if (est === 'DIFERENCIA_MONTO') {
      r.diferenciaMonto++
      planExcepciones.push({ cobroId, tipo: 'DIFERENCIA_MONTO', nota: `Monto cobro ${importeCobro} vs transacción ${transaccion.importeBruto}` })
    }
  }
  const concluirRevision = (cobroId: string, nota: string): void => {
    setEstado('EN_REVISION', cobroId)
    planExcepciones.push({ cobroId, tipo: 'FUZZY_AMBIGUO', nota })
    r.enRevision++
  }

  for (const cobro of datos.cobros) {
    if (!provDeMedio.has(cobro.medioPago)) { r.sinMapeo++; continue }
    const prov = provDeMedio.get(cobro.medioPago) ?? null
    if (prov === null) { setEstado('NO_APLICA', cobro.id); r.noAplica++; continue }
    if (prov !== proveedor) continue
    r.procesados++

    const det = matchDeterministico(cobro, idx, usadas)
    if (det.tipo === 'match') {
      concluirMatch(cobro.id, cobro.importe.toString(), det.transaccion, 'DETERMINISTICO', null)
      r.deterministico++
      continue
    }
    if (det.tipo === 'ambiguo') {
      concluirRevision(cobro.id, 'Match determinístico ambiguo (varias transacciones con la misma clave)')
      continue
    }

    const fz = matchFuzzy(cobro, datos.transacciones, usadas, { tolMonto, ventanaMin })
    if (fz.tipo === 'match') {
      concluirMatch(cobro.id, cobro.importe.toString(), fz.transaccion, 'FUZZY', fz.score)
      r.fuzzy++
      continue
    }
    if (fz.tipo === 'ambiguo') {
      concluirRevision(cobro.id, `Fuzzy ambiguo: ${fz.candidatos} candidatos dentro de tolerancia`)
      continue
    }

    setEstado('SIN_TRANSACCION', cobro.id)
    planExcepciones.push({ cobroId: cobro.id, tipo: 'COBRO_SIN_TRANSACCION', nota: 'No se encontró transacción del procesador' })
    r.sinTransaccion++
  }
  r.excepciones = planExcepciones.length

  // ─── 3. ESCRITURA (en lotes) ──────────────────────────────────────
  for (let i = 0; i < planMatches.length; i += LOTE) {
    const lote = planMatches.slice(i, i + LOTE)
    await withTenant(tenantId, (tx) => tx.match.createMany({ data: lote.map((m) => ({ tenantId, ...m })) }))
  }
  for (let i = 0; i < planExcepciones.length; i += LOTE) {
    const lote = planExcepciones.slice(i, i + LOTE)
    await withTenant(tenantId, (tx) => tx.excepcion.createMany({ data: lote.map((e) => ({ tenantId, ...e })) }))
  }
  for (const [estado, ids] of planEstados) {
    for (let i = 0; i < ids.length; i += LOTE) {
      const lote = ids.slice(i, i + LOTE)
      await withTenant(tenantId, (tx) => tx.cobro.updateMany({ where: { id: { in: lote } }, data: { estadoOp: estado } }))
    }
  }

  return r
}
