// Reemplazo de un bloque mensual: borra matches, excepciones, transacciones y
// cobros del período antes de re-ingerir (así re-subir un mes reemplaza, no
// duplica). Orden: primero lo que referencia (match/excepcion), luego los datos.
import { adminDb } from '../db/admin'

export async function reemplazarBloqueMes(tenantId: string, periodo: string): Promise<void> {
  await adminDb.match.deleteMany({ where: { tenantId, cobro: { periodo } } })
  await adminDb.excepcion.deleteMany({
    where: { tenantId, OR: [{ cobro: { periodo } }, { transaccion: { periodo } }] },
  })
  await adminDb.transaccion.deleteMany({ where: { tenantId, periodo } })
  await adminDb.cobro.deleteMany({ where: { tenantId, periodo } })
}
