// Parser del catálogo de Tiendas exportado por el Bridge Hioffice.
// Igual que cobros.ts, mapea POR NOMBRE de columna y tolera nombres alternativos
// (el layout de la exportación lo define el cliente en HIOPOS). Si no encuentra
// la columna clave (código de tienda), falla mostrando el header real para
// poder ajustar los nombres candidatos en una sola iteración.
import { parse } from 'csv-parse/sync'
import type { TipoDoc } from './bridge'

export interface TiendaNormalizada {
  codTienda: string
  nombre: string
  tipo: string | null
}

const norm = (s: string) => (s ?? '').normalize('NFC').trim()

function buscar(header: string[], nombres: string[]): number | null {
  const h = header.map(norm)
  for (const n of nombres) {
    const i = h.indexOf(norm(n))
    if (i !== -1) return i
  }
  return null
}

const COD = ['Cód. Tienda', 'Cod. Tienda', 'Código Tienda', 'Codigo Tienda', 'Cód. Establecimiento', 'Código', 'Codigo', 'Cód.', 'Id Tienda', 'IdTienda']
const NOM = ['Nombre', 'Tienda', 'Establecimiento', 'Nombre Tienda', 'Descripción', 'Descripcion', 'Razón Social', 'Razon Social']
const TIP = ['Tipo', 'Tipo Tienda']

function desdeFilas(header: string[], filas: string[][]): TiendaNormalizada[] {
  const iCod = buscar(header, COD)
  const iNom = buscar(header, NOM)
  const iTip = buscar(header, TIP)
  if (iCod == null) {
    throw new Error(
      `No encuentro la columna de código de tienda en la exportación. Header recibido: ${header.join(' | ')}`,
    )
  }
  const vistos = new Set<string>()
  const out: TiendaNormalizada[] = []
  for (const f of filas) {
    const codTienda = norm(f[iCod] ?? '')
    if (!codTienda || vistos.has(codTienda)) continue
    vistos.add(codTienda)
    const nombre = (iNom != null ? norm(f[iNom] ?? '') : '') || `Tienda ${codTienda}`
    out.push({ codTienda, nombre, tipo: iTip != null ? norm(f[iTip] ?? '') || null : null })
  }
  return out
}

// Acepta CSV (;-delimitado, como el resto del Bridge) o JSON (array de objetos).
export function parseTiendas(contenido: string, tipo?: TipoDoc): TiendaNormalizada[] {
  const txt = (contenido ?? '').trim()
  if (!txt) return []

  // JSON explícito (type 4) o contenido que arranca como array/objeto.
  if (tipo === 4 || txt.startsWith('[') || txt.startsWith('{')) {
    const data = JSON.parse(txt)
    const arr: Record<string, unknown>[] = Array.isArray(data) ? data : (data.rows ?? data.data ?? [])
    if (!Array.isArray(arr) || arr.length === 0) return []
    const header = Object.keys(arr[0])
    const filas = arr.map((o) => header.map((k) => String(o[k] ?? '')))
    return desdeFilas(header, filas)
  }

  const filas = parse(txt, { delimiter: ';', skip_empty_lines: true, relax_column_count: true, trim: true, bom: true }) as string[][]
  if (filas.length < 2) return []
  return desdeFilas(filas[0], filas.slice(1))
}
