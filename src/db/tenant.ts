// Ejecuta `fn` dentro de una transacción con el contexto de tenant seteado,
// de modo que RLS filtre por ese tenant. Toda operación de datos de un tenant
// debe pasar por acá.
//
// set_config(..., true) deja la variable local a la transacción: se limpia al
// terminar y es compatible con el pooling de pgbouncer (todas las sentencias
// de la transacción viajan por la misma conexión).
import type { Prisma } from '@prisma/client'
import { db } from './client'

export async function withTenant<T>(
  tenantId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  opciones?: { timeoutMs?: number; maxWaitMs?: number },
): Promise<T> {
  return db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant', ${tenantId}, true)`
      return fn(tx)
    },
    // Batches de ingesta/conciliación hacen muchas escrituras secuenciales con
    // la latencia de Neon; el default de 5s se queda corto. (TODO perf: agrupar
    // escrituras con createMany/updateMany para acortar la transacción.)
    { timeout: opciones?.timeoutMs ?? 120_000, maxWait: opciones?.maxWaitMs ?? 15_000 },
  )
}
