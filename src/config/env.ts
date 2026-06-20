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
  databaseUrl: requireEnv('DATABASE_URL'),
  directUrl: requireEnv('DIRECT_URL'),
  nodeEnv: process.env.NODE_ENV ?? 'development',
} as const
