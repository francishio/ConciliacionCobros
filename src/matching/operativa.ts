// Orquestador de la conciliación operativa (cobro ↔ transacción) por tenant.
// Cascada: determinístico → (fuzzy: próximo incremento) → conclusión.
// Crea la unión en `Match` y proyecta `estadoOp` en cada `Cobro`.
//
// TODO: para batches grandes, paginar / partir en varias transacciones (acá
// va todo en una sola $transaction vía withTenant).
import { withTenant } from '../db/tenant'
import { indexarTransacciones, matchDeterministico } from './deterministico'
import { estadoOperativaPorMonto } from './estado'

export interface ResultadoConciliacionOperativa {
  cobrosPendientes: number
  matcheados: number
  ok: number
  diferenciaMonto: number
  enRevision: number
  sinTransaccion: number
}

export async function conciliarOperativa(tenantId: string): Promise<ResultadoConciliacionOperativa> {
  return withTenant(tenantId, async (tx) => {
    const profile = await tx.matchingProfile.findUnique({ where: { tenantId } })
    const tolMonto = profile?.tolMonto?.toString() ?? '0'

    const cobros = await tx.cobro.findMany({ where: { estadoOp: 'PENDIENTE' } })
    const transacciones = await tx.transaccion.findMany({ where: { estado: 'APROBADA' } })
    const idx = indexarTransacciones(transacciones)

    // Transacciones ya unidas a un cobro: no reusarlas (match 1:1).
    const yaMatcheadas = await tx.match.findMany({ select: { transaccionId: true } })
    const usadas = new Set(yaMatcheadas.map((m) => m.transaccionId))

    const r: ResultadoConciliacionOperativa = {
      cobrosPendientes: cobros.length,
      matcheados: 0,
      ok: 0,
      diferenciaMonto: 0,
      enRevision: 0,
      sinTransaccion: 0,
    }

    for (const cobro of cobros) {
      const det = matchDeterministico(cobro, idx, usadas)

      if (det.tipo === 'ambiguo') {
        await tx.cobro.update({ where: { id: cobro.id }, data: { estadoOp: 'EN_REVISION' } })
        r.enRevision++
        continue
      }

      if (det.tipo === 'match') {
        usadas.add(det.transaccion.id)
        await tx.match.create({
          data: {
            tenantId,
            cobroId: cobro.id,
            transaccionId: det.transaccion.id,
            tipo: 'DETERMINISTICO',
            estado: 'AUTO',
          },
        })
        const est = estadoOperativaPorMonto(
          cobro.importe.toString(),
          det.transaccion.importeBruto.toString(),
          tolMonto,
        )
        await tx.cobro.update({ where: { id: cobro.id }, data: { estadoOp: est } })
        r.matcheados++
        if (est === 'OK') r.ok++
        else if (est === 'DIFERENCIA_MONTO') r.diferenciaMonto++
        continue
      }

      // det.tipo === 'sin_match' → acá entrará el FUZZY (próximo incremento).
      // Por ahora se concluye como SIN_TRANSACCION.
      await tx.cobro.update({ where: { id: cobro.id }, data: { estadoOp: 'SIN_TRANSACCION' } })
      r.sinTransaccion++
    }

    return r
  })
}
