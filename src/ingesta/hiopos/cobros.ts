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

// Columnas opcionales que cambian de nombre entre exports (p. ej. "Tienda" en
// Rochino vs "Establecimiento" en GARDINER). Devuelve el índice o null.
function buscarCol(header: string[], nombres: string[]): number | null {
  const headerNorm = header.map(norm)
  for (const n of nombres) {
    const i = headerNorm.indexOf(norm(n))
    if (i !== -1) return i
  }
  return null
}

// Importe formato AR estricto: '.' = miles, ',' = decimal. "671.000" → 671000.
function parseImporteAr(raw: string): string {
  const s = (raw ?? '').trim().replace(/\./g, '').replace(',', '.')
  const n = Number(s)
  if (!Number.isFinite(n)) throw new Error(`Importe HIOPOS inválido: "${raw}"`)
  return n.toFixed(2)
}

// Fecha DD/MM/YYYY con hora opcional. La hora puede venir:
//   - en la misma celda "Fecha": "DD/MM/YYYY HH:MM[:SS]", o
//   - en una columna aparte "Hora": "HH:MM[:SS]" (rawHora, tiene prioridad).
// Si no hay hora → medianoche (comportamiento anterior). Tener hora permite
// estrechar la ventana del matching fuzzy y desempatar cobros del mismo importe.
function parseFechaAr(raw: string, rawHora?: string | null): Date {
  const m = (raw ?? '').trim().match(/^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/)
  if (!m) throw new Error(`Fecha HIOPOS inválida: "${raw}"`)
  let [hh, mi, ss] = [m[4], m[5], m[6]]
  const mh = (rawHora ?? '').trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/)
  if (mh) [hh, mi, ss] = [mh[1], mh[2], mh[3]]
  return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), Number(hh ?? 0), Number(mi ?? 0), Number(ss ?? 0))
}

function ultimos4(numeroTarjeta: string): string | null {
  const m = (numeroTarjeta ?? '').trim().match(/(\d{4})$/)
  return m ? m[1] : null
}

// Tipo de tarjeta desde el medio de pago de HIOPOS ("Crédito Otras" / "Débito
// Otras"). Desempata en el fuzzy cuando hay varios candidatos del mismo importe.
function tipoTarjetaDe(medioPago: string): 'CREDITO' | 'DEBITO' | null {
  if (/d[eé]bito|debit/i.test(medioPago)) return 'DEBITO'
  if (/cr[eé]dito|credit/i.test(medioPago)) return 'CREDITO'
  return null
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
  const idxCodTienda = buscarCol(header, ['Cód. Tienda', 'Cód. Establecimiento'])
  const idxTienda = buscarCol(header, ['Tienda', 'Establecimiento'])
  const idxHora = buscarCol(header, ['Hora'])

  return filas.slice(1).map((c) => {
    const codDoc = (c[idx.codDoc] ?? '').trim()
    const numeroLinea = (c[idx.numeroLinea] ?? '').trim()
    const auth = (c[idx.idAutorizacion] ?? '').trim()
    if (!codDoc) throw new Error(`Fila HIOPOS sin Cód. Doc.: ${c.join(';')}`)
    return {
      origenRef: `${codDoc}|${numeroLinea}|${auth}`,
      hioposTicketId: codDoc,
      codTienda: idxCodTienda != null ? (c[idxCodTienda] ?? '').trim() || null : null,
      tienda: idxTienda != null ? (c[idxTienda] ?? '').trim() || null : null,
      medioPago: (c[idx.medioPago] ?? '').trim(),
      marca: (c[idx.marca] ?? '').trim() || null,
      tipoTarjeta: tipoTarjetaDe((c[idx.medioPago] ?? '').trim()),
      importe: parseImporteAr(c[idx.importe]),
      cuotas: 1, // el export no trae cuotas; default 1
      fechaHora: parseFechaAr(c[idx.fecha], idxHora != null ? c[idxHora] : null),
      codAutorizacion: auth || null,
      ultimos4: ultimos4(c[idx.numeroTarjeta]),
      raw: rawObjeto(header, c),
    }
  })
}
