// Tipos normalizados de ingesta — independientes del proveedor.
// Los adaptadores mapean su fuente (API, webhook, archivo) a estas formas;
// la persistencia las baja al modelo canónico de Prisma.
import type { EstadoTransaccion, TipoMovimiento, TipoTarjeta } from '@prisma/client'

export interface TransaccionNormalizada {
  proveedor: string
  idExterno: string // MP payment_id / Payway TID
  importeBruto: string // decimal como string para no perder precisión
  cuotas: number
  externalReference: string | null // ticket HIOPOS estampado (MP) — clave determinística MP
  codAutorizacion: string | null // cód. autorización tarjeta — clave determinística Clover/Payway
  terminal?: string | null // nro de establecimiento/terminal de la pasarela (scope por tienda)
  marca?: string | null // marca de tarjeta (para fuzzy)
  ultimos4?: string | null // últimos 4 de la tarjeta (para fuzzy)
  tipoTarjeta?: TipoTarjeta | null // CREDITO/DEBITO (para narrowing fuzzy)
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
  proveedor: string
  fechaAcreditacion: Date
  netoTotal: string
  lineas: LiquidacionLineaNormalizada[]
}

// Cobro normalizado (lado HIOPOS, el "ingreso esperado").
export interface CobroNormalizado {
  origenRef: string // clave natural del origen (idempotencia)
  hioposTicketId: string
  codTienda: string | null // Cód. Tienda HIOPOS (ancla del establecimiento)
  tienda: string | null // nombre de la tienda
  medioPago: string
  marca: string | null // marca de tarjeta (VISA/MASTERCARD/…)
  tipoTarjeta: TipoTarjeta | null // CREDITO/DEBITO (para narrowing fuzzy)
  importe: string
  cuotas: number
  fechaHora: Date
  codAutorizacion: string | null // clave determinística (si integrado)
  ultimos4: string | null // para matching fuzzy
  raw: unknown // payload crudo del origen (auditoría)
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
  codAutorizacion?: string
}
