// Interfaz común a todos los adaptadores de ingesta.
//
// Cada proveedor resuelve a su manera el origen de los datos (MP por API,
// Payway por archivo CSV, HIOPOS por PortalRest) pero devuelve registros YA
// normalizados al modelo canónico. La persistencia (idempotente, con RLS) es
// responsabilidad de la capa de ingesta (ver persistir.ts), no del adaptador.
import type { Proveedor } from '@prisma/client'
import type { LiquidacionNormalizada, TransaccionNormalizada } from './tipos'

// Ventana temporal de ingesta (operativa = día; financiera = ventana móvil).
export interface VentanaIngesta {
  desde: Date
  hasta: Date
}

export interface IngestaAdapter {
  readonly proveedor: Proveedor
  obtenerTransacciones(ventana: VentanaIngesta): Promise<TransaccionNormalizada[]>
  obtenerLiquidaciones(ventana: VentanaIngesta): Promise<LiquidacionNormalizada[]>
}
