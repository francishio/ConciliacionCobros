// Cliente Prisma de runtime (data plane). Conecta como app_runtime vía
// DATABASE_URL, así que TODAS sus queries quedan sujetas a RLS: hay que
// setear el contexto del tenant con withTenant() antes de tocar datos.
// Mismo patrón singleton probado en gastronomia-app.
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
