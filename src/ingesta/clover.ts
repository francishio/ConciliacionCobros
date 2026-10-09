// Adaptador de ingesta para Clover (Fiserv) — modo API.
// Trae los pagos de un comercio por rango de fecha vía la Platform REST API y los
// normaliza al modelo canónico. El código de autorización viene en el pago, así
// que el cruce con HIOPOS (integrado) puede ser DETERMINÍSTICO 1:1.
//
// Base URL por región (ej. Argentina/LatAm: https://api.la.clover.com).
// Auth: token del comercio (Bearer). Importe en CENTAVOS. Fecha en epoch ms (UTC).
import type { TipoTarjeta } from '@prisma/client'
import type { TransaccionNormalizada } from './tipos'

export interface CloverConfig {
  baseUrl: string // ej. https://api.la.clover.com
  merchantId: string // MID, ej. B00PSW185T911
  token: string // API token del comercio (solo lectura)
}

interface CloverPayment {
  id: string
  amount?: number // centavos
  externalPaymentId?: string
  createdTime?: number // epoch ms (UTC)
  result?: string // SUCCESS / FAIL / ...
  note?: string
  device?: { id?: string }
  order?: { id?: string } // id de la ORDEN (HIOPOS a veces estampa ESTE, no el payment id)
  tender?: { label?: string; labelKey?: string }
  cardTransaction?: { last4?: string; cardType?: string; authCode?: string }
}

const authDeNote = (note: string | undefined): string | null => {
  const m = (note ?? '').match(/ID\s+Autorizaci[oó]n:\s*([^;]+)/i)
  return m ? m[1].trim() : null
}

function tipoTarjetaDe(tender: CloverPayment['tender']): TipoTarjeta | null {
  const k = `${tender?.labelKey ?? ''} ${tender?.label ?? ''}`.toLowerCase()
  if (/debit|d[eé]bito/.test(k)) return 'DEBITO'
  if (/credit|cr[eé]dito/.test(k)) return 'CREDITO'
  return null
}

function normalizar(p: CloverPayment, merchantId: string): TransaccionNormalizada {
  const marca = p.cardTransaction?.cardType && p.cardTransaction.cardType !== 'OTHER' ? p.cardTransaction.cardType : null
  return {
    proveedor: 'CLOVER',
    idExterno: p.id,
    importeBruto: ((p.amount ?? 0) / 100).toFixed(2),
    cuotas: 1, // Clover no trae cuotas en el pago; default 1
    // Guardamos el id de la ORDEN como referencia alterna: HIOPOS a veces estampa
    // el order id (no el payment id) en "Datos Transacción", y el match por id lo
    // contempla además del idExterno (ver indexarTransacciones).
    externalReference: p.order?.id ?? null,
    codAutorizacion: p.cardTransaction?.authCode ?? authDeNote(p.note),
    terminal: merchantId, // un MID = un comercio → ancla para el scope por establecimiento (fallback)
    deviceId: p.device?.id ?? null, // dispositivo físico → mapea a tienda/terminal de HIOPOS
    marca,
    ultimos4: p.cardTransaction?.last4 ?? null,
    tipoTarjeta: tipoTarjetaDe(p.tender),
    estado: 'APROBADA', // solo ingerimos SUCCESS (ver obtenerPagosClover)
    fechaHora: new Date(p.createdTime ?? Date.now()),
    raw: p as unknown,
  }
}

// --- Verificación de cuenta / descubrimiento de dispositivos ---
// Con el MID + token: trae el NOMBRE del comercio (para confirmar que el MID/token
// son correctos) y la lista de DISPOSITIVOS (terminales físicas) de ese comercio,
// para después mapear cada dispositivo → tienda/terminal de HIOPOS.
export interface DispositivoClover {
  id: string
  serial: string | null
  modelo: string | null
  nombre: string | null
}
export interface ComercioClover {
  nombre: string
  dispositivos: DispositivoClover[]
}

export async function verificarComercioClover(cfg: CloverConfig, fetchImpl: typeof fetch = fetch): Promise<ComercioClover> {
  const base = cfg.baseUrl.replace(/\/+$/, '')
  const headers = { Authorization: `Bearer ${cfg.token}` }

  const mRes = await fetchImpl(`${base}/v3/merchants/${cfg.merchantId}`, { headers })
  if (!mRes.ok) {
    const body = await mRes.text().catch(() => '')
    throw new Error(`Clover ${mRes.status} ${mRes.statusText}: ${body.slice(0, 200)}`)
  }
  const m = (await mRes.json()) as { name?: string }

  // Dispositivos (si el token no tiene permiso, devolvemos lista vacía sin romper).
  let dispositivos: DispositivoClover[] = []
  const dRes = await fetchImpl(`${base}/v3/merchants/${cfg.merchantId}/devices`, { headers })
  if (dRes.ok) {
    const dj = (await dRes.json()) as {
      elements?: { id?: string; serial?: string; model?: string; productName?: string; deviceTypeName?: string; name?: string }[]
    }
    dispositivos = (dj.elements ?? []).map((d) => ({
      id: d.id ?? '',
      serial: d.serial ?? null,
      modelo: d.productName ?? d.model ?? d.deviceTypeName ?? null,
      nombre: d.name ?? null,
    }))
  }
  return { nombre: m.name ?? '(sin nombre)', dispositivos }
}

// --- Devoluciones / notas de crédito ---
// En Clover un refund es un objeto SEPARADO (endpoint /refunds), con su propio id.
// HIOPOS estampa ESE id de refund en la nota de crédito (refPasarela), así que el
// cruce es por id, igual que las ventas. Se ingiere en NEGATIVO para que concilie
// limpio contra el importe negativo de la nota de crédito de HIOPOS.
interface CloverRefund {
  id: string
  amount?: number // centavos (positivo en Clover)
  createdTime?: number // epoch ms (UTC)
  payment?: { id?: string }
  device?: { id?: string }
}

function normalizarRefund(r: CloverRefund, merchantId: string): TransaccionNormalizada {
  return {
    proveedor: 'CLOVER',
    idExterno: r.id, // id del refund → matchea el refPasarela de la nota de crédito HIOPOS
    importeBruto: (-(r.amount ?? 0) / 100).toFixed(2), // NEGATIVO: es una devolución
    cuotas: 1,
    externalReference: r.payment?.id ?? null, // referencia al pago original (informativo)
    codAutorizacion: null,
    terminal: merchantId,
    deviceId: r.device?.id ?? null,
    marca: null,
    ultimos4: null,
    tipoTarjeta: null,
    estado: 'APROBADA',
    fechaHora: new Date(r.createdTime ?? Date.now()),
    raw: r as unknown,
  }
}

// Trae las devoluciones del rango [desde, hasta] (paginado) y las normaliza en
// negativo. Filtra por fecha también del lado cliente por si el endpoint ignora
// el filtro de createdTime.
export async function obtenerRefundsClover(
  cfg: CloverConfig,
  rango: { desde: Date; hasta: Date },
  fetchImpl: typeof fetch = fetch,
): Promise<TransaccionNormalizada[]> {
  const base = cfg.baseUrl.replace(/\/+$/, '')
  const desdeMs = rango.desde.getTime()
  const hastaMs = rango.hasta.getTime()
  const limit = 1000
  let offset = 0
  const todos: CloverRefund[] = []

  for (;;) {
    const url =
      `${base}/v3/merchants/${cfg.merchantId}/refunds` +
      `?limit=${limit}&offset=${offset}` +
      `&filter=${encodeURIComponent(`createdTime>=${desdeMs}`)}` +
      `&filter=${encodeURIComponent(`createdTime<=${hastaMs}`)}`
    const res = await fetchImpl(url, { headers: { Authorization: `Bearer ${cfg.token}` } })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`Clover refunds ${res.status} ${res.statusText}: ${body.slice(0, 200)}`)
    }
    const j = (await res.json()) as { elements?: CloverRefund[] }
    const els = j.elements ?? []
    todos.push(...els)
    if (els.length < limit) break
    offset += limit
  }

  return todos
    .filter((r) => {
      const t = r.createdTime ?? 0
      return t >= desdeMs && t <= hastaMs
    })
    .map((r) => normalizarRefund(r, cfg.merchantId))
}

// Trae los pagos SUCCESS del rango [desde, hasta] (paginado) y los normaliza.
export async function obtenerPagosClover(
  cfg: CloverConfig,
  rango: { desde: Date; hasta: Date },
  fetchImpl: typeof fetch = fetch,
): Promise<TransaccionNormalizada[]> {
  const base = cfg.baseUrl.replace(/\/+$/, '')
  const desdeMs = rango.desde.getTime()
  const hastaMs = rango.hasta.getTime()
  const limit = 1000
  let offset = 0
  const todos: CloverPayment[] = []

  for (;;) {
    const url =
      `${base}/v3/merchants/${cfg.merchantId}/payments` +
      `?expand=cardTransaction,tender&limit=${limit}&offset=${offset}` +
      `&filter=${encodeURIComponent(`createdTime>=${desdeMs}`)}` +
      `&filter=${encodeURIComponent(`createdTime<=${hastaMs}`)}`
    const res = await fetchImpl(url, { headers: { Authorization: `Bearer ${cfg.token}` } })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`Clover ${res.status} ${res.statusText}: ${body.slice(0, 200)}`)
    }
    const j = (await res.json()) as { elements?: CloverPayment[] }
    const els = j.elements ?? []
    todos.push(...els)
    if (els.length < limit) break
    offset += limit
  }

  return todos.filter((p) => (p.result ?? 'SUCCESS') === 'SUCCESS').map((p) => normalizar(p, cfg.merchantId))
}
