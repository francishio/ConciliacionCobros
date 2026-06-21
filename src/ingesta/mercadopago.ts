// Adaptador de ingesta para Mercado Pago (modo API + pull).
// La normalización (normalizarPagoMp) es una función pura y testeable; el
// adaptador agrega el fetch contra la API de MP.
import type { EstadoTransaccion } from '@prisma/client'
import type { IngestaAdapter, VentanaIngesta } from './adapter'
import type { LiquidacionNormalizada, TransaccionNormalizada } from './tipos'

// Forma parcial del objeto Payment de MP que nos interesa. El resto del
// payload se conserva íntegro en `raw`.
export interface MpPayment {
  id: number | string
  status: string
  transaction_amount: number
  installments?: number
  external_reference?: string | null
  authorization_code?: string | null
  date_approved?: string | null
  date_created?: string | null
  [k: string]: unknown
}

// Mapea el status de MP al enum canónico. Falla-fuerte ante estados no
// esperados para que no se ingiera basura silenciosamente.
function mapEstado(status: string): EstadoTransaccion {
  switch (status) {
    case 'approved':
    case 'authorized':
      return 'APROBADA'
    case 'cancelled':
      return 'ANULADA'
    case 'refunded':
      return 'DEVUELTA'
    case 'charged_back':
      return 'CONTRACARGO'
    default:
      throw new Error(`Estado de pago MP no soportado para ingesta: "${status}"`)
  }
}

export function normalizarPagoMp(p: MpPayment): TransaccionNormalizada {
  const fecha = p.date_approved ?? p.date_created
  if (!fecha) {
    throw new Error(`Pago MP ${p.id} sin fecha (date_approved/date_created)`)
  }
  return {
    proveedor: 'MERCADOPAGO',
    idExterno: String(p.id),
    importeBruto: p.transaction_amount.toFixed(2),
    cuotas: p.installments ?? 1,
    externalReference: p.external_reference ?? null,
    codAutorizacion: p.authorization_code ?? null,
    estado: mapEstado(p.status),
    fechaHora: new Date(fecha),
    raw: p,
  }
}

export interface MercadoPagoAdapterConfig {
  accessToken: string
  // Inyectable para test; por defecto usa el fetch global.
  fetchImpl?: typeof fetch
}

export class MercadoPagoAdapter implements IngestaAdapter {
  readonly proveedor = 'MERCADOPAGO' as const

  constructor(private readonly cfg: MercadoPagoAdapterConfig) {}

  async obtenerTransacciones(ventana: VentanaIngesta): Promise<TransaccionNormalizada[]> {
    const f = this.cfg.fetchImpl ?? fetch
    // TODO: paginar (offset/limit) cuando el volumen lo requiera.
    const url = new URL('https://api.mercadopago.com/v1/payments/search')
    url.searchParams.set('range', 'date_created')
    url.searchParams.set('begin_date', ventana.desde.toISOString())
    url.searchParams.set('end_date', ventana.hasta.toISOString())
    url.searchParams.set('sort', 'date_created')
    url.searchParams.set('criteria', 'asc')

    const res = await f(url.toString(), {
      headers: { Authorization: `Bearer ${this.cfg.accessToken}` },
    })
    if (!res.ok) {
      throw new Error(`MP payments/search falló: ${res.status} ${res.statusText}`)
    }
    const data = (await res.json()) as { results?: MpPayment[] }
    return (data.results ?? []).map(normalizarPagoMp)
  }

  async obtenerLiquidaciones(_ventana: VentanaIngesta): Promise<LiquidacionNormalizada[]> {
    // Próximo incremento: settlement report de MP (API de reportes / CSV).
    throw new Error('obtenerLiquidaciones (MP) todavía no implementado')
  }
}
