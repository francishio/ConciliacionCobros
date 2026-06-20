// Entrypoint del worker de conciliación.
// Por ahora solo valida entorno y conectividad con Neon. El scheduler
// (cron + cola) y el motor de matching se enganchan en pasos siguientes.
import { env } from './config/env'
import { db } from './db/client'

async function main(): Promise<void> {
  console.log(`[ConciliacionCobros] arrancando en modo ${env.nodeEnv}`)

  // Verificación de conectividad con la base
  await db.$queryRaw`SELECT 1`
  console.log('[ConciliacionCobros] conexión a Neon OK')

  // TODO: enganchar scheduler (operativa batch diario, financiera ventana móvil)
  //       y motor de matching — ver docs/arquitectura-conciliacion-v1.md §5/§6/§7
}

main()
  .catch((err) => {
    console.error('[ConciliacionCobros] error fatal:', err)
    process.exitCode = 1
  })
  .finally(async () => {
    await db.$disconnect()
  })
