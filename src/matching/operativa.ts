// Orquestador de la conciliación operativa (cobro ↔ transacción) por tenant.
// Cascada: determinístico → fuzzy → conclusión. Crea la unión en `Match`,
// proyecta `estadoOp` en cada `Cobro` y abre `Excepcion` para los breaks.
//
// Procesa los cobros en estado PENDIENTE. (TODO: re-evaluar SIN_TRANSACCION /
// EN_REVISION en corridas posteriores — transacción tardía / ventana móvil; y
// paginar para batches grandes: hoy va todo en una $transaction vía withTenant.)
import type { TipoExcepcion, Transaccion } from '@prisma/client'
import { withTenant } from '../db/tenant'
import { indexarTransacciones, matchDeterministico } from './deterministico'
import { matchFuzzy } from './fuzzy'
import { estadoOperativaPorMonto } from './estado'

export interface ResultadoConciliacionOperativa {
  cobrosPendientes: number
  deterministico: number
  fuzzy: number
  ok: number
  diferenciaMonto: number
  enRevision: number
  sinTransaccion: number
  excepciones: number
}

export async function conciliarOperativa(tenantId: string): Promise<ResultadoConciliacionOperativa> {
  return withTenant(tenantId, async (tx) => {
    const profile = await tx.matchingProfile.findUnique({ where: { tenantId } })
    const tolMonto = profile ? Number(profile.tolMonto) : 0
    const ventanaMin = profile?.ventanaMin ?? 5

    const cobros = await tx.cobro.findMany({ where: { estadoOp: 'PENDIENTE' } })
    const transacciones = await tx.transaccion.findMany({ where: { estado: 'APROBADA' } })
    const idx = indexarTransacciones(transacciones)

    // Transacciones ya unidas: no reusarlas (match 1:1).
    const yaMatcheadas = await tx.match.findMany({ select: { transaccionId: true } })
    const usadas = new Set(yaMatcheadas.map((m) => m.transaccionId))

    const r: ResultadoConciliacionOperativa = {
      cobrosPendientes: cobros.length,
      deterministico: 0, fuzzy: 0, ok: 0, diferenciaMonto: 0,
      enRevision: 0, sinTransaccion: 0, excepciones: 0,
    }

    const abrirExcepcion = async (cobroId: string, tipo: TipoExcepcion, nota: string): Promise<void> => {
      await tx.excepcion.create({ data: { tenantId, cobroId, tipo, nota } })
      r.excepciones++
    }

    const aplicarMatch = async (
      cobroId: string,
      importeCobro: string,
      transaccion: Transaccion,
      tipo: 'DETERMINISTICO' | 'FUZZY',
      score: number | null,
    ): Promise<void> => {
      usadas.add(transaccion.id)
      await tx.match.create({ data: { tenantId, cobroId, transaccionId: transaccion.id, tipo, score } })
      const est = estadoOperativaPorMonto(importeCobro, transaccion.importeBruto.toString(), String(tolMonto))
      await tx.cobro.update({ where: { id: cobroId }, data: { estadoOp: est } })
      if (est === 'OK') r.ok++
      else if (est === 'DIFERENCIA_MONTO') {
        r.diferenciaMonto++
        await abrirExcepcion(cobroId, 'DIFERENCIA_MONTO', `Monto cobro ${importeCobro} vs transacción ${transaccion.importeBruto}`)
      }
    }

    const marcarRevision = async (cobroId: string, nota: string): Promise<void> => {
      await tx.cobro.update({ where: { id: cobroId }, data: { estadoOp: 'EN_REVISION' } })
      await abrirExcepcion(cobroId, 'FUZZY_AMBIGUO', nota)
      r.enRevision++
    }

    for (const cobro of cobros) {
      // 1. Determinístico
      const det = matchDeterministico(cobro, idx, usadas)
      if (det.tipo === 'match') {
        await aplicarMatch(cobro.id, cobro.importe.toString(), det.transaccion, 'DETERMINISTICO', null)
        r.deterministico++
        continue
      }
      if (det.tipo === 'ambiguo') {
        await marcarRevision(cobro.id, 'Match determinístico ambiguo (varias transacciones con la misma clave)')
        continue
      }

      // 2. Fuzzy
      const fz = matchFuzzy(cobro, transacciones, usadas, { tolMonto, ventanaMin })
      if (fz.tipo === 'match') {
        await aplicarMatch(cobro.id, cobro.importe.toString(), fz.transaccion, 'FUZZY', fz.score)
        r.fuzzy++
        continue
      }
      if (fz.tipo === 'ambiguo') {
        await marcarRevision(cobro.id, `Fuzzy ambiguo: ${fz.candidatos} candidatos dentro de tolerancia`)
        continue
      }

      // 3. Sin match
      await tx.cobro.update({ where: { id: cobro.id }, data: { estadoOp: 'SIN_TRANSACCION' } })
      await abrirExcepcion(cobro.id, 'COBRO_SIN_TRANSACCION', 'No se encontró transacción del procesador')
      r.sinTransaccion++
    }

    return r
  })
}
