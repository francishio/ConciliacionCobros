// Persistencia de ingesta: upsert idempotente al modelo canónico, con RLS.
// La clave (tenantId, proveedor, idExterno) garantiza que reprocesar un
// reporte actualice (no duplique). Siempre dentro de withTenant.
import type { Prisma } from '@prisma/client'
import { withTenant } from '../db/tenant'
import type { TransaccionNormalizada } from './tipos'

export interface ResultadoIngesta {
  recibidas: number
  persistidas: number
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
