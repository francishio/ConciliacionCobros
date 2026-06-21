// Máquina de estados de la conciliación operativa (modelo de datos §4).
// estadoOp es una proyección derivada del match cobro ↔ transacción.
import type { EstadoOperativa } from '@prisma/client'

// Dado el match (o su ausencia), calcula el estado operativo por monto.
// - sin transacción            → SIN_TRANSACCION
// - monto dentro de tolerancia → OK
// - monto fuera de tolerancia  → DIFERENCIA_MONTO
export function estadoOperativaPorMonto(
  importeCobro: string,
  importeTransaccion: string | null,
  tolMonto: string,
): EstadoOperativa {
  if (importeTransaccion === null) return 'SIN_TRANSACCION'
  const diff = Math.abs(Number(importeCobro) - Number(importeTransaccion))
  return diff <= Number(tolMonto) ? 'OK' : 'DIFERENCIA_MONTO'
}
