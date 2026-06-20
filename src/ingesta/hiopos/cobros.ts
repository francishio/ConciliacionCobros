// Normalizador de cobros del export "ARG - Conciliacion Cobros" del Bridge
// Hioffice. El export es un CSV (;-delimitado, números formato AR).
//
// Mapeo POR NOMBRE de columna (no por posición): el export puede agregar/quitar
// o reordenar columnas, así que ubicamos cada campo por su header. Si falta una
// columna esperada, falla ruidosamente (mejor que leer datos corridos en
// silencio). Para "Cód. Doc." (que el export puede repetir) se toma la primera.
import { parse } from 'csv-parse/sync'
import type { CobroNormalizado } from '../tipos'

const COLS = {
  fecha: 'Fecha',
  codDoc: 'Cód. Doc.',
  numeroLinea: 'Número Línea',
  medioPago: 'Medio Pago',
  marca: 'Titular',
  numeroTarjeta: 'Número Tarjeta',
  idAutorizacion: 'Id. Autorización',
  importe: 'Importe',
} as const

type ClaveCol = keyof typeof COLS

const norm = (s: string) => (s ?? '').normalize('NFC').trim()

function mapearIndices(header: string[]): Record<ClaveCol, number> {
  const headerNorm = header.map(norm)
  const idx = {} as Record<ClaveCol, number>
  for (const [clave, nombre] of Object.entries(COLS) as [ClaveCol, string][]) {
    const i = headerNorm.indexOf(norm(nombre)) // primera ocurrencia
    if (i === -1) {
      throw new Error(
        `Columna HIOPOS faltante en el export: "${nombre}". Header recibido: ${header.join(' | ')}`,
      )
    }
    idx[clave] = i
  }
  return idx
}

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

function rawObjeto(header: string[], fila: string[]): Record<string, string> {
  const o: Record<string, string> = {}
  header.forEach((h, i) => {
    o[norm(h)] = fila[i] ?? ''
  })
  return o
}

export function parseCobrosHiopos(csv: string): CobroNormalizado[] {
  const filas = parse(csv, {
    delimiter: ';',
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
    bom: true,
  }) as string[][]
  if (filas.length < 2) return []

  const header = filas[0]
  const idx = mapearIndices(header)

  return filas.slice(1).map((c) => {
    const codDoc = (c[idx.codDoc] ?? '').trim()
    const numeroLinea = (c[idx.numeroLinea] ?? '').trim()
    const auth = (c[idx.idAutorizacion] ?? '').trim()
    if (!codDoc) throw new Error(`Fila HIOPOS sin Cód. Doc.: ${c.join(';')}`)
    return {
      origenRef: `${codDoc}|${numeroLinea}|${auth}`,
      hioposTicketId: codDoc,
      medioPago: (c[idx.medioPago] ?? '').trim(),
      marca: (c[idx.marca] ?? '').trim() || null,
      importe: parseImporteAr(c[idx.importe]),
      cuotas: 1, // el export no trae cuotas; default 1
      fechaHora: parseFechaAr(c[idx.fecha]),
      codAutorizacion: auth || null,
      ultimos4: ultimos4(c[idx.numeroTarjeta]),
      raw: rawObjeto(header, c),
    }
  })
}
