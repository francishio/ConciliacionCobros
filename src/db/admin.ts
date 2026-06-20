// Cliente Prisma de control plane (admin). Conecta como neondb_owner vía
// ADMIN_DATABASE_URL, que es dueño de las tablas y BYPASSA RLS. Usar SOLO
// para operaciones cross-tenant deliberadas: enumerar tenants para el
// scheduler, seed, tareas de mantenimiento. NUNCA para servir datos de un
// tenant (para eso está db + withTenant).
import { PrismaClient } from '@prisma/client'
import { env } from '../config/env'

const globalForAdmin = globalThis as unknown as {
  adminDb: PrismaClient | undefined
}

export const adminDb =
  globalForAdmin.adminDb ??
  new PrismaClient({
    datasources: { db: { url: env.adminDatabaseUrl } },
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForAdmin.adminDb = adminDb
