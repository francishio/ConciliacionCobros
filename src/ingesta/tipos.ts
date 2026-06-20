// Tipos normalizados de ingesta — independientes del proveedor.
// Los adaptadores mapean su fuente (API, webhook, archivo) a estas formas;
// la persistencia las baja al modelo canónico de Prisma.
import type { EstadoTransaccion, Proveedor, TipoMovimiento } from '@prisma/client'

export interface TransaccionNormalizada {
  proveedor: Proveedor
  idExterno: string // MP payment_id / Payway TID
  importeBruto: string // decimal como string para no perder precisión
  cuotas: number
  externalReference: string | null // ticket HIOPOS estampado (MP)
  estado: EstadoTransaccion
  fechaHora: Date
  raw: unknown // payload crudo del proveedor (auditoría)
}

export interface LiquidacionLineaNormalizada {
  idExternoTransaccion: string | null // TID/payment_id de la transacción asociada
  nroCuota: number
  bruto: string
  arancel: string
  retenciones: string
  neto: string
  tipoMov: TipoMovimiento
}

export interface LiquidacionNormalizada {
  proveedor: Proveedor
  fechaAcreditacion: Date
  netoTotal: string
  lineas: LiquidacionLineaNormalizada[]
}

// Mapeo de columnas para adaptadores por archivo (configurable por tenant):
// nombre de la columna en el reporte → campo del modelo normalizado.
export interface MapeoColumnasTransaccion {
  idExterno: string
  importeBruto: string
  fechaHora: string
  cuotas?: string
  estado?: string
  externalReference?: string
}
