// Persistencia de ingesta: upsert idempotente al modelo canónico, con RLS.
// La clave (tenantId, proveedor, idExterno) garantiza que reprocesar un
// reporte actualice (no duplique). Siempre dentro de withTenant.
import type { Prisma } from '@prisma/client'
import { withTenant } from '../db/tenant'
import type { CobroNormalizado, TransaccionNormalizada } from './tipos'

export interface ResultadoIngesta {
  recibidas: number
  persistidas: number
}

// Upsert idempotente de cobros (lado HIOPOS) por (tenantId, origenRef).
export async function ingestarCobros(
  tenantId: string,
  cobros: CobroNormalizado[],
): Promise<ResultadoIngesta> {
  return withTenant(tenantId, async (tx) => {
    let persistidas = 0
    for (const c of cobros) {
      const datos = {
        hioposTicketId: c.hioposTicketId,
        medioPago: c.medioPago,
        marca: c.marca,
        importe: c.importe,
        cuotas: c.cuotas,
        fechaHora: c.fechaHora,
        codAutorizacion: c.codAutorizacion,
        ultimos4: c.ultimos4,
        raw: c.raw as Prisma.InputJsonValue,
      }
      await tx.cobro.upsert({
        where: { tenantId_origenRef: { tenantId, origenRef: c.origenRef } },
        create: { tenantId, origenRef: c.origenRef, ...datos },
        update: datos,
      })
      persistidas++
    }
    return { recibidas: cobros.length, persistidas }
  })
}

export async function ingestarTransacciones(
  tenantId: string,
  registros: TransaccionNormalizada[],
): Promise<ResultadoIngesta> {
  return withTenant(tenantId, async (tx) => {
    let persistidas = 0
    for (const r of registros) {
      await tx.transaccion.upsert({
        where: {
          tenantId_proveedor_idExterno: {
            tenantId,
            proveedor: r.proveedor,
            idExterno: r.idExterno,
          },
        },
        create: {
          tenantId,
          proveedor: r.proveedor,
          idExterno: r.idExterno,
          importeBruto: r.importeBruto,
          cuotas: r.cuotas,
          externalReference: r.externalReference,
          estado: r.estado,
          fechaHora: r.fechaHora,
          raw: r.raw as Prisma.InputJsonValue,
        },
        update: {
          importeBruto: r.importeBruto,
          cuotas: r.cuotas,
          externalReference: r.externalReference,
          estado: r.estado,
          fechaHora: r.fechaHora,
          raw: r.raw as Prisma.InputJsonValue,
        },
      })
      persistidas++
    }
    return { recibidas: registros.length, persistidas }
  })
}
