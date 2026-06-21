// Adaptador de ingesta para Payway (modo archivo / reporte "Movimientos
// Presentado" en .xlsx). Mapeo POR NOMBRE de columna (robusto a reordenamientos),
// con la fila de encabezado detectada por la columna COMPRA (el reporte trae una
// fila de título arriba). Números formato US (punto decimal), fechas DD/MM/YYYY.
import * as XLSX from 'xlsx'
import type { EstadoTransaccion } from '@prisma/client'
import type { ArchivoAdapter, EntradaArchivo } from './adapter'
import type { TransaccionNormalizada } from './tipos'

const COLS = {
  compra: 'COMPRA',
  tipo: 'TIPO',
  lote: 'LOTE',
  numCupon: 'NUM.CUPON',
  marca: 'MARCA',
  establecimiento: 'ESTABLECIMIENTO',
  monto: 'MONTO_BRUTO',
  numTarjeta: 'NUM.TARJETA',
  cuotas: 'CANT.CUOTAS',
  nroAut: 'NRO_AUT',
} as const
type ClaveCol = keyof typeof COLS

const norm = (s: string): string => (s ?? '').normalize('NFC').trim().toUpperCase()

function estadoDeTipo(tipo: string): EstadoTransaccion {
  switch (norm(tipo)) {
    case 'VENTA':
      return 'APROBADA'
    case 'DEVOLUCION':
    case 'DEVOLUCIÓN':
      return 'DEVUELTA'
    case 'ANULACION':
    case 'ANULACIÓN':
      return 'ANULADA'
    case 'CONTRACARGO':
      return 'CONTRACARGO'
    default:
      return 'APROBADA' // tipos no vistos → tratar como venta (revisar si aparece)
  }
}

function parseMonto(raw: string): string {
  const s = (raw ?? '').trim().replace(/,/g, '') // formato US: coma = miles
  const n = Number(s)
  if (!Number.isFinite(n)) throw new Error(`MONTO_BRUTO Payway inválido: "${raw}"`)
  return n.toFixed(2)
}

function parseFecha(raw: string): Date {
  const m = (raw ?? '').trim().match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  if (!m) throw new Error(`Fecha Payway inválida: "${raw}"`)
  return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]))
}

function ultimos4(numeroTarjeta: string): string | null {
  const m = (numeroTarjeta ?? '').trim().match(/(\d{4})$/)
  return m ? m[1] : null
}

function rawObjeto(header: string[], fila: string[]): Record<string, string> {
  const o: Record<string, string> = {}
  header.forEach((h, i) => {
    o[(h ?? '').normalize('NFC').trim()] = fila[i] ?? ''
  })
  return o
}

export function parseTransaccionesPayway(contenido: string | Buffer): TransaccionNormalizada[] {
  const wb = XLSX.read(contenido, { type: typeof contenido === 'string' ? 'string' : 'buffer' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const filas = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, raw: false, defval: '' })

  const headerIdx = filas.findIndex((r) => r.map(norm).includes('COMPRA'))
  if (headerIdx === -1) {
    throw new Error('No se encontró la fila de encabezado (COMPRA) en el Excel de Payway')
  }
  const headerOriginal = filas[headerIdx]
  const header = headerOriginal.map(norm)

  const idx = {} as Record<ClaveCol, number>
  for (const [clave, nombre] of Object.entries(COLS) as [ClaveCol, string][]) {
    const i = header.indexOf(norm(nombre))
    if (i === -1) {
      throw new Error(`Columna Payway faltante: "${nombre}". Header: ${headerOriginal.join(' | ')}`)
    }
    idx[clave] = i
  }

  const datos = filas.slice(headerIdx + 1).filter((r) => (r[idx.compra] ?? '').trim() !== '')
  return datos.map((c) => {
    const establecimiento = (c[idx.establecimiento] ?? '').trim()
    const lote = (c[idx.lote] ?? '').trim()
    const numCupon = (c[idx.numCupon] ?? '').trim()
    const nroAut = (c[idx.nroAut] ?? '').trim()
    const cuotasN = Number((c[idx.cuotas] ?? '').trim())
    return {
      proveedor: 'PAYWAY',
      // Payway no trae un ID único: lo componemos (clave de idempotencia).
      idExterno: `${establecimiento}|${lote}|${numCupon}|${nroAut}`,
      importeBruto: parseMonto(c[idx.monto]),
      cuotas: Number.isFinite(cuotasN) && cuotasN > 0 ? cuotasN : 1,
      externalReference: null,
      codAutorizacion: nroAut || null,
      marca: (c[idx.marca] ?? '').trim() || null,
      ultimos4: ultimos4(c[idx.numTarjeta]),
      estado: estadoDeTipo(c[idx.tipo]),
      fechaHora: parseFecha(c[idx.compra]),
      raw: rawObjeto(headerOriginal, c),
    }
  })
}

export class PaywayAdapter implements ArchivoAdapter {
  readonly proveedor = 'PAYWAY' as const

  parseTransacciones(entrada: EntradaArchivo): TransaccionNormalizada[] {
    return parseTransaccionesPayway(entrada.contenido)
  }
}
