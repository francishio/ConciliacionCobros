// Protege todas las rutas: sin sesión → /login (páginas) o 401 (APIs).
// Las rutas de super admin (config y catálogo de pasarelas) requieren rol
// SUPERADMIN. Corre en Edge → usa solo `jose` (jwt.ts), nada de Node.
import { NextResponse, type NextRequest } from 'next/server'
import { SESSION_COOKIE, verificarSesion } from '@/src/auth/jwt'

const RUTAS_ADMIN = ['/config', '/pasarelas']

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const s = await verificarSesion(req.cookies.get(SESSION_COOKIE)?.value)

  if (!s) {
    if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 })
    const url = req.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  const esAdmin =
    RUTAS_ADMIN.some((r) => pathname === r || pathname.startsWith(r + '/')) ||
    pathname.startsWith('/api/config') ||
    pathname.startsWith('/api/pasarelas')
  if (esAdmin && s.rol !== 'SUPERADMIN') {
    if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'Requiere super admin.' }, { status: 403 })
    const url = req.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!login|api/auth|_next/static|_next/image|favicon.ico).*)'],
}
