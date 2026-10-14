// Clasificación del tipo de cobro de una transacción de la pasarela, con sus
// propios datos (tender/nota de Clover + débito/crédito + signo). Compartido por
// la proyección de acreditaciones y el detalle de conciliación.

// Tipos de cobro configurables (cada uno con su plazo + comisión). DEVOLUCION es
// el reverso de una venta (monto negativo) y tiene su propia config.
export const TIPOS_COBRO = ['DEBITO', 'CREDITO', 'QR', 'PREPAGA', 'DEVOLUCION', 'OTRO'] as const

export const TIPO_COBRO_LABEL: Record<string, string> = {
  DEBITO: 'Débito',
  CREDITO: 'Crédito',
  QR: 'QR / billeteras',
  PREPAGA: 'Prepaga',
  OTRO: 'Otro',
  DEVOLUCION: 'Devolución',
}

export function clasificarTipoCobro(raw: unknown, tipoTarjeta: string | null, importe: number): string {
  if (importe < 0) return 'DEVOLUCION' // los refunds no traen tender
  const r = (raw ?? {}) as { tender?: { label?: string; labelKey?: string }; note?: string }
  const txt = `${r.tender?.labelKey ?? ''} ${r.tender?.label ?? ''} ${r.note ?? ''}`.toLowerCase()
  if (/prepaid|prepaga/.test(txt)) return 'PREPAGA'
  if (/\bqr\b|modo|billetera|wallet|transfer/.test(txt)) return 'QR'
  if (tipoTarjeta === 'DEBITO') return 'DEBITO'
  if (tipoTarjeta === 'CREDITO') return 'CREDITO'
  return 'OTRO'
}
