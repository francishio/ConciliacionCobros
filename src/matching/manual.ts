// Conciliación manual asistida (PayConcil pantalla 06 — grilla doble).
// Servicios para: listar los breaks (cobros sin conciliar) + las transacciones
// sin asignar, y confirmar un match manual. La UI de grilla doble se arma en la
// fase de UX. Reutiliza el modelo (Match/Excepcion) y el cálculo de estado.
//
// TODO: matches 1:N / N:1 (cuotas / depósito agrupado) — hoy 1:1; sugerencias
// "IA" (fuzzy de baja confianza); reason_code + free_text si fuera de tolerancia.
import type { Proveedor } from '@prisma/client'
import { withTenant } from '../db/tenant'
import { estadoOperativaPorMonto } from './estado'
import type { CobroMatch, TransaccionMatch } from './tipos'

export interface NoConciliados {
  cobros: CobroMatch[]
  transacciones: TransaccionMatch[]
}

// Cobros en revisión / sin transacción + transacciones del proveedor sin match.
export async function listarNoConciliados(
  tenantId: string,
  proveedor: Proveedor,
): Promise<NoConciliados> {
  return withTenant(tenantId, async (tx) => {
    const cobros = await tx.cobro.findMany({
      where: { estadoOp: { in: ['EN_REVISION', 'SIN_TRANSACCION'] } },
      omit: { raw: true },
    })
    const matcheadas = (await tx.match.findMany({ select: { transaccionId: true } })).map((m) => m.transaccionId)
    const transacciones = await tx.transaccion.findMany({
      where: { proveedor, estado: 'APROBADA', id: { notIn: matcheadas } },
      omit: { raw: true },
    })
    return { cobros, transacciones }
  })
}

export interface ResultadoMatchManual {
  matchId: string
  estadoOp: string
}

// Confirma un match manual 1:1: crea Match(MANUAL), proyecta el estadoOp del
// cobro y cierra sus excepciones abiertas.
export async function confirmarMatchManual(
  tenantId: string,
  cobroId: string,
  transaccionId: string,
  opts?: { tolMonto?: number },
): Promise<ResultadoMatchManual> {
  return withTenant(tenantId, async (tx) => {
    const yaMatch = await tx.match.findFirst({ where: { transaccionId }, select: { id: true } })
    if (yaMatch) throw new Error('La transacción ya está conciliada con otro cobro.')

    const cobro = await tx.cobro.findUniqueOrThrow({ where: { id: cobroId }, select: { importe: true } })
    const trans = await tx.transaccion.findUniqueOrThrow({ where: { id: transaccionId }, select: { importeBruto: true } })

    const match = await tx.match.create({
      data: { tenantId, cobroId, transaccionId, tipo: 'MANUAL', estado: 'CONFIRMADO_MANUAL' },
      select: { id: true },
    })
    const est = estadoOperativaPorMonto(cobro.importe.toString(), trans.importeBruto.toString(), String(opts?.tolMonto ?? 0))
    await tx.cobro.update({ where: { id: cobroId }, data: { estadoOp: est } })
    await tx.excepcion.updateMany({
      where: { cobroId, estado: { in: ['ABIERTA', 'EN_REVISION'] } },
      data: { estado: 'RESUELTA' },
    })
    return { matchId: match.id, estadoOp: est }
  })
}
