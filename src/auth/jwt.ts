// Firma/verificación del token de sesión (JWT HS256 con `jose`).
// Edge-safe: NO importa nada de Node ni next/headers → se puede usar tanto en el
// middleware (Edge) como en el server (Node). El secreto va en AUTH_SECRET.
import { SignJWT, jwtVerify } from 'jose'

export const SESSION_COOKIE = 'cc_sesion'

export interface Sesion {
  userId: string
  email: string
  rol: 'SUPERADMIN' | 'CLIENTE'
  tenantId: string | null // null para SUPERADMIN
  tenantNombre: string | null
}

function secreto(): Uint8Array {
  const s = process.env.AUTH_SECRET
  if (!s) throw new Error('Falta AUTH_SECRET en el entorno.')
  return new TextEncoder().encode(s)
}

export async function firmarSesion(s: Sesion): Promise<string> {
  return new SignJWT({ ...s })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(secreto())
}

export async function verificarSesion(token: string | undefined | null): Promise<Sesion | null> {
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, secreto())
    return {
      userId: String(payload.userId),
      email: String(payload.email),
      rol: payload.rol === 'SUPERADMIN' ? 'SUPERADMIN' : 'CLIENTE',
      tenantId: (payload.tenantId as string | null) ?? null,
      tenantNombre: (payload.tenantNombre as string | null) ?? null,
    }
  } catch {
    return null
  }
}
