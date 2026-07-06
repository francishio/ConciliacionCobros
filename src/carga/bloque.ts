// Reemplazo de datos de un bloque mensual, POR FUENTE (para que cargar HIOPOS no
// pise los extractos de pasarela ya cargados, y viceversa) + reconciliación del
// mes completo tras cualquier cambio.
import { adminDb } from '../db/admin'
import { conciliarOperativa } from '../matching/operativa'

// Reemplaza los COBROS (HIOPOS) del mes: borra sus matches/excepciones y los cobros.
// Las transacciones de pasarela quedan intactas (se re-concilian después).
export async function reemplazarCobrosMes(tenantId: string, periodo: string): Promise<void> {
  await adminDb.match.deleteMany({ where: { tenantId, cobro: { periodo } } })
  await adminDb.excepcion.deleteMany({ where: { tenantId, cobro: { periodo } } })
  await adminDb.cobro.deleteMany({ where: { tenantId, periodo } })
}

// Reemplaza las TRANSACCIONES del mes de UNA pasarela: sus matches/excepciones y
// las transacciones. Los cobros quedan intactos (se re-concilian después).
export async function reemplazarTransMes(tenantId: string, periodo: string, proveedor: string): Promise<void> {
  await adminDb.match.deleteMany({ where: { tenantId, transaccion: { periodo, proveedor } } })
  await adminDb.excepcion.deleteMany({ where: { tenantId, transaccion: { periodo, proveedor } } })
  await adminDb.transaccion.deleteMany({ where: { tenantId, periodo, proveedor } })
}

// Re-concilia el mes desde cero: limpia matches/excepciones, resetea los cobros a
// PENDIENTE y corre la conciliación por cada pasarela conciliable.
// Nota: re-conciliar rehace los matches automáticos; los manuales del mes se
// pierden (los cobros se recrean con id nuevo al recargar HIOPOS).
export async function reconciliarMes(tenantId: string, periodo: string): Promise<void> {
  await adminDb.match.deleteMany({ where: { tenantId, cobro: { periodo } } })
  await adminDb.excepcion.deleteMany({
    where: { tenantId, OR: [{ cobro: { periodo } }, { transaccion: { periodo } }] },
  })
  await adminDb.cobro.updateMany({ where: { tenantId, periodo }, data: { estadoOp: 'PENDIENTE' } })

  const provs = await adminDb.mapeoMedioPago.findMany({
    where: { tenantId, proveedor: { not: null } },
    distinct: ['proveedor'],
    select: { proveedor: true },
  })
  for (const p of provs) if (p.proveedor) await conciliarOperativa(tenantId, p.proveedor)
}

// Limpia datos SIN período (legacy del flujo anterior, ya removido). Necesario
// porque comparten la clave de idempotencia (origenRef / idExterno) y, si no se
// borran, el createMany con skipDuplicates omite las filas nuevas → 0 ingeridas.
export async function limpiarSinPeriodo(tenantId: string): Promise<void> {
  await adminDb.match.deleteMany({ where: { tenantId, cobro: { periodo: null } } })
  await adminDb.excepcion.deleteMany({
    where: { tenantId, OR: [{ cobro: { periodo: null } }, { transaccion: { periodo: null } }] },
  })
  await adminDb.transaccion.deleteMany({ where: { tenantId, periodo: null } })
  await adminDb.cobro.deleteMany({ where: { tenantId, periodo: null } })
}
