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

  // Mapeo de medios por Cód. Medio Pago. Crea los que falten con la heurística
  // como SUGERENCIA inicial; no pisa el proveedor ya configurado (solo refresca
  // el nombre visible).
  const medios = new Map<string, string>() // codMedioPago → nombre
  for (const c of cobros) if (c.codMedioPago) medios.set(c.codMedioPago, c.medioPago)
  for (const [cod, nombre] of medios) {
    await adminDb.mapeoMedioPago.upsert({
      where: { tenantId_codMedioPago: { tenantId, codMedioPago: cod } },
      create: { tenantId, codMedioPago: cod, medioPago: nombre, proveedor: proveedorDeMedio(nombre) },
      update: { medioPago: nombre },
    })
  }
  await adminDb.matchingProfile.upsert({
    where: { tenantId },
    create: { tenantId, ventanaMin: 600, tolMonto: '0' },
    update: {},
  })

  await ingestarCobrosBulk(tenantId, cobros, { periodo })
}
