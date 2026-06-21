// Adaptador de ingesta para Payway (modo archivo / reporte CSV).
// El formato exacto del reporte se resuelve con un mapeo de columnas
// configurable por tenant (MapeoColumnasTransaccion), así no hay que tocar
// código cuando cambia el layout. Los defaults son tentativos: confirmar
// contra un reporte real de Mi Payway Profesional.
import type { EstadoTransaccion } from '@prisma/client'
import type { ArchivoAdapter, EntradaArchivo } from './adapter'
import type { MapeoColumnasTransaccion, TransaccionNormalizada } from './tipos'
import { parseCsv } from './csv'

const MAPEO_PAYWAY_DEFAULT: MapeoColumnasTransaccion = {
  idExterno: 'TID', // clave de match Payway
  importeBruto: 'Importe',
  cuotas: 'Cuotas',
  fechaHora: 'Fecha',
  estado: 'Estado',
}

const ESTADO_PAYWAY_DEFAULT: Record<string, EstadoTransaccion> = {
  APROBADA: 'APROBADA',
  ANULADA: 'ANULADA',
  DEVUELTA: 'DEVUELTA',
  DEVOLUCION: 'DEVUELTA',
  CONTRACARGO: 'CONTRACARGO',
}

// Importe con formato AR (1.234,56) o estándar (1234.56).
function parseImporte(raw: string): string {
  let s = (raw ?? '').trim()
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.') // miles '.', decimal ','
  const n = Number(s)
  if (!Number.isFinite(n)) throw new Error(`Importe Payway inválido: "${raw}"`)
  return n.toFixed(2)
}

// Fecha DD/MM/YYYY [HH:mm[:ss]] (formato AR); fallback a Date.parse.
function parseFecha(raw: string): Date {
  const m = (raw ?? '').trim().match(/^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/)
  if (m) {
    const [, d, mo, y, hh = '0', mi = '0', ss = '0'] = m
    return new Date(Number(y), Number(mo) - 1, Number(d), Number(hh), Number(mi), Number(ss))
  }
  const fallback = new Date(raw)
  if (Number.isNaN(fallback.getTime())) throw new Error(`Fecha Payway inválida: "${raw}"`)
  return fallback
}

export interface PaywayAdapterConfig {
  mapeo?: Partial<MapeoColumnasTransaccion>
  estados?: Record<string, EstadoTransaccion>
  delimitador?: string
  desdeLinea?: number
}

export class PaywayAdapter implements ArchivoAdapter {
  readonly proveedor = 'PAYWAY' as const
  private readonly mapeo: MapeoColumnasTransaccion
  private readonly estados: Record<string, EstadoTransaccion>
  private readonly delimitador?: string
  private readonly desdeLinea?: number

  constructor(cfg: PaywayAdapterConfig = {}) {
    this.mapeo = { ...MAPEO_PAYWAY_DEFAULT, ...cfg.mapeo }
    this.estados = cfg.estados ?? ESTADO_PAYWAY_DEFAULT
    this.delimitador = cfg.delimitador
    this.desdeLinea = cfg.desdeLinea
  }

  parseTransacciones(entrada: EntradaArchivo): TransaccionNormalizada[] {
    const filas = parseCsv(entrada.contenido, {
      delimitador: this.delimitador,
      desdeLinea: this.desdeLinea,
    })
    return filas.map((fila) => this.normalizarFila(fila))
  }

  private normalizarFila(fila: Record<string, string>): TransaccionNormalizada {
    const idExterno = fila[this.mapeo.idExterno]
    if (!idExterno) throw new Error(`Fila Payway sin columna "${this.mapeo.idExterno}" (TID)`)
    return {
      proveedor: 'PAYWAY',
      idExterno,
      importeBruto: parseImporte(fila[this.mapeo.importeBruto]),
      cuotas: this.mapeo.cuotas && fila[this.mapeo.cuotas] ? Number(fila[this.mapeo.cuotas]) : 1,
      externalReference: this.mapeo.externalReference ? fila[this.mapeo.externalReference] ?? null : null,
      codAutorizacion: this.mapeo.codAutorizacion ? fila[this.mapeo.codAutorizacion] ?? null : null,
      estado: this.mapEstado(this.mapeo.estado ? fila[this.mapeo.estado] : undefined),
      fechaHora: parseFecha(fila[this.mapeo.fechaHora]),
      raw: fila,
    }
  }

  private mapEstado(raw?: string): EstadoTransaccion {
    if (!raw) return 'APROBADA'
    const estado = this.estados[raw.trim().toUpperCase()]
    if (!estado) throw new Error(`Estado Payway no mapeado: "${raw}"`)
    return estado
  }
}
