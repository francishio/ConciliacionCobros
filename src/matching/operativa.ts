// Orquestador de la conciliación operativa (cobro ↔ transacción) POR PROVEEDOR.
// La expo de HIOPOS trae todos los medios de pago juntos; el MapeoMedioPago del
// tenant define qué medio pertenece a qué conciliación (proveedor) o si es NO
// CONCILIABLE (→ NO_APLICA, ej. EFECTIVO). Cada proveedor es un cruce separado:
// un cobro de un medio nunca matchea contra transacciones de otro proveedor.
//
// Cascada por cobro: determinístico → fuzzy → conclusión. Crea la unión en
// `Match`, proyecta `estadoOp` y abre `Excepcion` para los breaks.
//
// TODO: re-evaluar SIN_TRANSACCION / EN_REVISION en corridas posteriores
// (transacción tardía / ventana móvil); paginar para batches grandes.
import type { Proveedor, TipoExcepcion, Transaccion } from '@prisma/client'
import { withTenant } from '../db/tenant'
import { indexarTransacciones, matchDeterministico } from './deterministico'
import { matchFuzzy } from './fuzzy'
import { estadoOperativaPorMonto } from './estado'

export interface ResultadoConciliacionOperativa {
  proveedor: Proveedor
  cobrosPendientes: number // total PENDIENTE al inicio
  procesados: number // los del proveedor pedido
  deterministico: number
  fuzzy: number
  ok: number
  diferenciaMonto: number
  enRevision: number
  sinTransaccion: number
  noAplica: number // medios NO CONCILIABLE → NO_APLICA
  sinMapeo: number // medios sin configurar en MapeoMedioPago (se omiten)
  excepciones: number
}

export async function conciliarOperativa(
  tenantId: string,
  proveedor: Proveedor,
): Promise<ResultadoConciliacionOperativa> {
  return withTenant(tenantId, async (tx) => {
    const profile = await tx.matchingProfile.findUnique({ where: { tenantId } })
    const tolMonto = profile ? Number(profile.tolMonto) : 0
    const ventanaMin = profile?.ventanaMin ?? 5

    // Mapeo medio de pago → proveedor (o null = NO CONCILIABLE).
    const mapeos = await tx.mapeoMedioPago.findMany()
    const provDeMedio = new Map<string, Proveedor | null>()
    for (const m of mapeos) provDeMedio.set(m.medioPago, m.proveedor)

    const pendientes = await tx.cobro.findMany({ where: { estadoOp: 'PENDIENTE' } })

    const r: ResultadoConciliacionOperativa = {
      proveedor, cobrosPendientes: pendientes.length, procesados: 0,
      deterministico: 0, fuzzy: 0, ok: 0, diferenciaMonto: 0,
      enRevision: 0, sinTransaccion: 0, noAplica: 0, sinMapeo: 0, excepciones: 0,
    }

    // Clasificar los pendientes según el mapeo del medio de pago.
    const delProveedor: typeof pendientes = []
    for (const c of pendientes) {
      if (!provDeMedio.has(c.medioPago)) { r.sinMapeo++; continue } // sin configurar → omitir
      const prov = provDeMedio.get(c.medioPago) ?? null
      if (prov === null) {
        await tx.cobro.update({ where: { id: c.id }, data: { estadoOp: 'NO_APLICA' } })
        r.noAplica++
      } else if (prov === proveedor) {
        delProveedor.push(c)
      }
      // prov de otro proveedor → se omite (lo procesa la corrida de ese proveedor)
    }
    r.procesados = delProveedor.length

    // Transacciones SOLO de este proveedor.
    const transacciones = await tx.transaccion.findMany({ where: { estado: 'APROBADA', proveedor } })
    const idx = indexarTransacciones(transacciones)
    const yaMatcheadas = await tx.match.findMany({ select: { transaccionId: true } })
    const usadas = new Set(yaMatcheadas.map((m) => m.transaccionId))

    const abrirExcepcion = async (cobroId: string, tipo: TipoExcepcion, nota: string): Promise<void> => {
      await tx.excepcion.create({ data: { tenantId, cobroId, transaccionId: null, tipo, nota } })
      r.excepciones++
    }

    const aplicarMatch = async (
      cobroId: string, importeCobro: string, transaccion: Transaccion,
      tipo: 'DETERMINISTICO' | 'FUZZY', score: number | null,
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

    for (const cobro of delProveedor) {
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

      await tx.cobro.update({ where: { id: cobro.id }, data: { estadoOp: 'SIN_TRANSACCION' } })
      await abrirExcepcion(cobro.id, 'COBRO_SIN_TRANSACCION', 'No se encontró transacción del procesador')
      r.sinTransaccion++
    }

    return r
  })
}
