// Callback de Google: valida el code, saca el email verificado y, si existe como
// Usuario activo (lista blanca), abre la sesión propia de la app (cookie cc_sesion).
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { exchangeCode, verifyIdToken, callbackUri } from '@/src/auth/google-oauth'
import { adminDb } from '@/src/db/admin'
import { firmarSesion, SESSION_COOKIE } from '@/src/auth/jwt'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function fail(req: Request, code: string) {
  const res = NextResponse.redirect(new URL(`/login?error=${code}`, req.url))
  res.cookies.set('g_state', '', { path: '/', maxAge: 0 })
  res.cookies.set('g_nonce', '', { path: '/', maxAge: 0 })
  return res
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const gErr = url.searchParams.get('error') // Google puede volver con ?error=access_denied

  const jar = cookies()
  const savedState = jar.get('g_state')?.value
  const nonce = jar.get('g_nonce')?.value

  if (gErr) { console.error('google callback: Google devolvió error=', gErr); return fail(req, 'google_denied') }
  if (!code || !state) { console.error('google callback: falta code/state'); return fail(req, 'google_resp') }
  if (!savedState || !nonce) { console.error('google callback: se perdió la cookie g_state/g_nonce'); return fail(req, 'google_cookie') }
  if (state !== savedState) { console.error('google callback: state no coincide'); return fail(req, 'google_state') }

  let email: string
  try {
    const redirectUri = callbackUri(req)
    const idToken = await exchangeCode(code, redirectUri)
    email = await verifyIdToken(idToken, nonce)
  } catch (e) {
    console.error('google callback exchange/verify:', e instanceof Error ? e.message : e)
    return fail(req, 'google_verify')
  }

  // Lista blanca: el email debe existir como Usuario activo (lo da de alta el admin).
  const u = await adminDb.usuario.findUnique({
    where: { email },
    include: { tenant: { select: { nombre: true } } },
  })
  if (!u || !u.activo) { console.error('google callback: email sin alta activa:', email); return fail(req, 'noauth') }

  await adminDb.usuario.update({ where: { id: u.id }, data: { ultimoLogin: new Date() } })
  const token = await firmarSesion({
    userId: u.id,
    email: u.email,
    rol: u.rol,
    tenantId: u.tenantId,
    tenantNombre: u.tenant?.nombre ?? null,
  })

  const destino = u.rol === 'SUPERADMIN' ? '/pasarelas' : '/conciliacion'
  const res = NextResponse.redirect(new URL(destino, req.url))
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  })
  res.cookies.set('g_state', '', { path: '/', maxAge: 0 })
  res.cookies.set('g_nonce', '', { path: '/', maxAge: 0 })
  return res
}
