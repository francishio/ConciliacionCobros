// Inicio del login con Google: genera state/nonce, los guarda en cookies y
// redirige al consentimiento de Google.
import { NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { buildAuthUrl, googleConfigured, callbackUri } from '@/src/auth/google-oauth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request): Promise<Response> {
  // Si se entró por un permalink de deploy (xxxx--sitio.netlify.app) el redirect_uri
  // no coincidiría con el registrado en Google. Con APP_CANONICAL_HOST seteado,
  // mandamos el flujo al dominio canónico para que todo use el mismo host.
  const canonical = process.env.APP_CANONICAL_HOST
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || ''
  if (canonical && host.endsWith('.netlify.app') && host !== canonical) {
    return NextResponse.redirect(`https://${canonical}/api/auth/google/start`)
  }
  if (!googleConfigured()) {
    return NextResponse.redirect(new URL('/login?error=google_config', req.url))
  }

  const redirectUri = callbackUri(req)
  const state = crypto.randomBytes(16).toString('hex')
  const nonce = crypto.randomBytes(16).toString('hex')

  const res = NextResponse.redirect(buildAuthUrl(redirectUri, state, nonce))
  const opts = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/', maxAge: 600 }
  res.cookies.set('g_state', state, opts)
  res.cookies.set('g_nonce', nonce, opts)
  return res
}
