// Interfaz común a todos los adaptadores de ingesta.
//
// Cada proveedor resuelve a su manera el origen de los datos (MP por API,
// Payway por archivo CSV, HIOPOS por PortalRest) pero devuelve registros YA
// normalizados al modelo canónico. La persistencia (idempotente, con RLS) es
// responsabilidad de la capa de ingesta (ver persistir.ts), no del adaptador.
import type { LiquidacionNormalizada, TransaccionNormalizada } from './tipos'

// Ventana temporal de ingesta (operativa = día; financiera = ventana móvil).
export interface VentanaIngesta {
  desde: Date
  hasta: Date
}

// Adaptador por PULL (API): obtiene los datos por ventana temporal (cron).
export interface IngestaAdapter {
  readonly proveedor: string
  obtenerTransacciones(ventana: VentanaIngesta): Promise<TransaccionNormalizada[]>
  obtenerLiquidaciones(ventana: VentanaIngesta): Promise<LiquidacionNormalizada[]>
}

// Contenido de un archivo de reporte a ingerir (upload o descarga programada).
export interface EntradaArchivo {
  contenido: string | Buffer
}

// Adaptador por ARCHIVO: parsea un reporte (CSV) a registros normalizados.
// El disparador es la llegada del archivo, no una ventana temporal.
export interface ArchivoAdapter {
  readonly proveedor: string
  parseTransacciones(entrada: EntradaArchivo): TransaccionNormalizada[]
}
