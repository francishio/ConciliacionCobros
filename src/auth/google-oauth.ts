// "Ingresar con Google" (OpenID Connect). Flujo a mano, reutilizando la sesión
// propia de la app. La lista blanca es la tabla Usuario (por email, debe estar
// activo). Mismo patrón que las otras apps de ICG.
import { jwtVerify, createRemoteJWKSet } from 'jose'

const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token'
const JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'))

export function googleConfigured(): boolean {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
}

/**
 * Origen público real de la request. Detrás del proxy de Netlify, `req.url` puede
 * venir como http o con un host interno; usamos x-forwarded-proto/host para que el
 * redirect_uri coincida con el registrado (https en Netlify, http en localhost).
 */
export function requestOrigin(req: Request): string {
  const h = req.headers
  const host = h.get('x-forwarded-host') || h.get('host') || new URL(req.url).host
  const proto = h.get('x-forwarded-proto') || (host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https')
  return `${proto}://${host}`
}

/** redirect_uri canónico (mismo en start y en callback). */
export function callbackUri(req: Request): string {
  return `${requestOrigin(req)}/api/auth/google/callback`
}

/** URL de autorización de Google (redirige al consentimiento). */
export function buildAuthUrl(redirectUri: string, state: string, nonce: string): string {
  const u = new URL(GOOGLE_AUTH)
  u.searchParams.set('client_id', process.env.GOOGLE_CLIENT_ID!)
  u.searchParams.set('redirect_uri', redirectUri)
  u.searchParams.set('response_type', 'code')
  u.searchParams.set('scope', 'openid email profile')
  u.searchParams.set('state', state)
  u.searchParams.set('nonce', nonce)
  u.searchParams.set('prompt', 'select_account')
  return u.toString()
}

/** Intercambia el code por tokens (server-side, con client_secret). Devuelve el id_token. */
export async function exchangeCode(code: string, redirectUri: string): Promise<string> {
  const body = new URLSearchParams({
    code,
    client_id: process.env.GOOGLE_CLIENT_ID!,
    client_secret: process.env.GOOGLE_CLIENT_SECRET!,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  })
  const res = await fetch(GOOGLE_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!res.ok) throw new Error(`Google token error ${res.status}`)
  const j = (await res.json()) as { id_token?: string }
  if (!j.id_token) throw new Error('Respuesta de Google sin id_token')
  return j.id_token
}

/** Verifica firma/iss/aud/nonce del id_token contra las claves de Google. Devuelve el email. */
export async function verifyIdToken(idToken: string, nonce: string): Promise<string> {
  const { payload } = await jwtVerify(idToken, JWKS, {
    issuer: ['https://accounts.google.com', 'accounts.google.com'],
    audience: process.env.GOOGLE_CLIENT_ID!,
  })
  if (payload.nonce !== nonce) throw new Error('nonce inválido')
  if (payload.email_verified !== true) throw new Error('email no verificado por Google')
  const email = String(payload.email ?? '').trim().toLowerCase()
  if (!email) throw new Error('id_token sin email')
  return email
}
