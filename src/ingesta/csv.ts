// Utilidad de parseo de CSV para los adaptadores de ingesta por archivo.
// Usa csv-parse (maneja comillas, comas embebidas, BOM). La primera fila se
// toma como cabecera → cada registro es un objeto { columna: valor }.
import { parse } from 'csv-parse/sync'

export interface OpcionesCsv {
  delimitador?: string // por defecto ','
  desdeLinea?: number // saltar N líneas iniciales (reportes con preámbulo)
}

export function parseCsv(
  contenido: string | Buffer,
  opciones: OpcionesCsv = {},
): Record<string, string>[] {
  return parse(contenido, {
    columns: true,
    delimiter: opciones.delimitador ?? ',',
    from_line: opciones.desdeLinea ?? 1,
    skip_empty_lines: true,
    trim: true,
    bom: true,
  }) as Record<string, string>[]
}
