// Carga de cobros HIOPOS de un mes (compartido por la carga por archivo y la
// sincronización por API): reemplaza los cobros del mes, asegura el mapeo de
// medios y el perfil de matching, e ingiere. La reconciliación se corre aparte.
import { adminDb } from '../db/admin'
import { ingestarCobrosBulk } from '../ingesta/persistir'
import type { CobroNormalizado } from '../ingesta/tipos'
import { reemplazarCobrosMes } from './bloque'

// Heurística medio de pago HIOPOS → pasarela (solo para los que falten mapear).
export function proveedorDeMedio(m: string): 'PAYWAY' | 'MERCADOPAGO' | null {
  if (/cr[eé]dito otras|d[eé]bito otras/i.test(m)) return 'PAYWAY'
  if (/mercado\s*pago/i.test(m)) return 'MERCADOPAGO'
  return null
}

export async function cargarCobrosHiopos(
  tenantId: string,
  periodo: string,
  cobros: CobroNormalizado[],
): Promise<void> {
  await reemplazarCobrosMes(tenantId, periodo)

  // Crea los mapeos de medio que falten (no pisa los ya configurados).
  const medios = [...new Set(cobros.map((c) => c.medioPago))]
  for (const m of medios) {
    await adminDb.mapeoMedioPago.upsert({
      where: { tenantId_medioPago: { tenantId, medioPago: m } },
      create: { tenantId, medioPago: m, proveedor: proveedorDeMedio(m) },
      update: {},
    })
  }
  await adminDb.matchingProfile.upsert({
    where: { tenantId },
    create: { tenantId, ventanaMin: 600, tolMonto: '0' },
    update: {},
  })

  await ingestarCobrosBulk(tenantId, cobros, { periodo })
}
