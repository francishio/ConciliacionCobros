// Normalizador de cobros del export "ARG - Conciliacion Cobros" del Bridge
// Hioffice. El export es un CSV (;-delimitado, números formato AR) con columnas
// posicionales fijas. Mapeo por índice (robusto a los acentos del header).
//
// Columnas: 0 Cód.Establecimiento · 1 Establecimiento · 2 Nif · 3 Fecha ·
// 4 Cód.Doc. · 5 Serie/Número · 6 Número Línea · 7 Cód.MedioPago ·
// 8 Medio Pago · 9 Tipo Tarjeta · 10 Titular(marca) · 11 Número Tarjeta ·
// 12 Id.Autorización · 13 Importe · 14 Neto (Líneas)
import { parse } from 'csv-parse/sync'
import type { CobroNormalizado } from '../tipos'

const COL = {
  fecha: 3,
  codDoc: 4,
  numeroLinea: 6,
  medioPago: 8,
  marca: 10,
  numeroTarjeta: 11,
  idAutorizacion: 12,
  importe: 13,
} as const

const HEADERS = [
  'codEstablecimiento', 'establecimiento', 'nif', 'fecha', 'codDoc',
  'serieNumero', 'numeroLinea', 'codMedioPago', 'medioPago', 'tipoTarjeta',
  'titular', 'numeroTarjeta', 'idAutorizacion', 'importe', 'netoLineas',
]

// Importe formato AR estricto: '.' = miles, ',' = decimal. "671.000" → 671000.
function parseImporteAr(raw: string): string {
  const s = (raw ?? '').trim().replace(/\./g, '').replace(',', '.')
  const n = Number(s)
  if (!Number.isFinite(n)) throw new Error(`Importe HIOPOS inválido: "${raw}"`)
  return n.toFixed(2)
}

// Fecha DD/MM/YYYY (el export trae solo fecha, sin hora).
function parseFechaAr(raw: string): Date {
  const m = (raw ?? '').trim().match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  if (!m) throw new Error(`Fecha HIOPOS inválida: "${raw}"`)
  return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]))
}

function ultimos4(numeroTarjeta: string): string | null {
  const m = (numeroTarjeta ?? '').trim().match(/(\d{4})$/)
  return m ? m[1] : null
}

function rawObjeto(c: string[]): Record<string, string> {
  const o: Record<string, string> = {}
  HEADERS.forEach((h, i) => {
    o[h] = c[i] ?? ''
  })
  return o
}

function normalizarFila(c: string[]): CobroNormalizado {
  const codDoc = (c[COL.codDoc] ?? '').trim()
  const numeroLinea = (c[COL.numeroLinea] ?? '').trim()
  const auth = (c[COL.idAutorizacion] ?? '').trim()
  if (!codDoc) throw new Error(`Fila HIOPOS sin Cód. Doc.: ${c.join(';')}`)
  return {
    origenRef: `${codDoc}|${numeroLinea}|${auth}`,
    hioposTicketId: codDoc,
    medioPago: (c[COL.medioPago] ?? '').trim(),
    marca: (c[COL.marca] ?? '').trim() || null,
    importe: parseImporteAr(c[COL.importe]),
    cuotas: 1, // el export no trae cuotas; default 1
    fechaHora: parseFechaAr(c[COL.fecha]),
    codAutorizacion: auth || null,
    ultimos4: ultimos4(c[COL.numeroTarjeta]),
    raw: rawObjeto(c),
  }
}

export function parseCobrosHiopos(csv: string): CobroNormalizado[] {
  const filas = parse(csv, {
    delimiter: ';',
    from_line: 2, // saltar header
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
    bom: true,
  }) as string[][]
  return filas.map(normalizarFila)
}
