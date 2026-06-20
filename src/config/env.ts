// Carga y valida las variables de entorno. Importar este módulo primero
// garantiza que dotenv corra antes de leer cualquier variable.
import 'dotenv/config'

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value || value.trim() === '') {
    throw new Error(`Falta la variable de entorno requerida: ${name}`)
  }
  return value
}

export const env = {
  // Runtime / data plane — rol app_runtime (RLS aplicada)
  databaseUrl: requireEnv('DATABASE_URL'),
  // Migraciones — neondb_owner, conexión directa
  directUrl: requireEnv('DIRECT_URL'),
  // Control plane / admin (cross-tenant) — neondb_owner, bypassa RLS
  adminDatabaseUrl: requireEnv('ADMIN_DATABASE_URL'),
  nodeEnv: process.env.NODE_ENV ?? 'development',
} as const
