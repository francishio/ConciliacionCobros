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
  nombreFiscal: string | null
  cuit: string | null
  direccion: string | null
  localidad: string | null
  provincia: string | null
  codigoPostal: string | null
  grupo: string | null
  telefono: string | null
  email: string | null
  raw: Record<string, string> // fila completa (header → valor)
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
const NOM = ['Tienda', 'Nombre', 'Establecimiento', 'Nombre Tienda', 'Descripción', 'Descripcion']
const NOMFISCAL = ['Nombre Fiscal', 'Razón Social', 'Razon Social']
const NIF = ['Nif', 'NIF', 'CUIT', 'CUIL', 'C.U.I.T.', 'Cuit']
const TIP = ['Tipo', 'Tipo Tienda']
const DIR = ['Dirección', 'Direccion', 'Domicilio', 'Calle']
const LOC = ['Población', 'Poblacion', 'Localidad', 'Ciudad']
const PROV = ['Provincia', 'Estado']
const CP = ['Código Postal', 'Codigo Postal', 'CP', 'C.P.', 'Cód. Postal']
const GRUPO = ['Grupo Tiendas', 'Grupo']
const TEL = ['Teléfono', 'Telefono', 'Tel', 'Tel.']
const MAIL = ['Email', 'E-mail', 'Correo', 'Correo Electrónico']

function desdeFilas(header: string[], filas: string[][]): TiendaNormalizada[] {
  const iCod = buscar(header, COD)
  if (iCod == null) {
    throw new Error(
      `No encuentro la columna de código de tienda en la exportación. Header recibido: ${header.join(' | ')}`,
    )
  }
  const iNom = buscar(header, NOM)
  const cols = {
    tipo: buscar(header, TIP),
    nombreFiscal: buscar(header, NOMFISCAL),
    cuit: buscar(header, NIF),
    direccion: buscar(header, DIR),
    localidad: buscar(header, LOC),
    provincia: buscar(header, PROV),
    codigoPostal: buscar(header, CP),
    grupo: buscar(header, GRUPO),
    telefono: buscar(header, TEL),
    email: buscar(header, MAIL),
  }
  const val = (f: string[], i: number | null) => (i != null ? norm(f[i] ?? '') || null : null)
  const hdr = header.map(norm)

  const vistos = new Set<string>()
  const out: TiendaNormalizada[] = []
  for (const f of filas) {
    const codTienda = norm(f[iCod] ?? '')
    if (!codTienda || vistos.has(codTienda)) continue
    vistos.add(codTienda)
    const raw: Record<string, string> = {}
    hdr.forEach((h, i) => {
      raw[h] = f[i] ?? ''
    })
    out.push({
      codTienda,
      nombre: (iNom != null ? norm(f[iNom] ?? '') : '') || `Tienda ${codTienda}`,
      tipo: val(f, cols.tipo),
      nombreFiscal: val(f, cols.nombreFiscal),
      cuit: val(f, cols.cuit),
      direccion: val(f, cols.direccion),
      localidad: val(f, cols.localidad),
      provincia: val(f, cols.provincia),
      codigoPostal: val(f, cols.codigoPostal),
      grupo: val(f, cols.grupo),
      telefono: val(f, cols.telefono),
      email: val(f, cols.email),
      raw,
    })
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
