// Login: valida email + contraseña (bcrypt) y setea la cookie de sesión.
import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { adminDb } from '@/src/db/admin'
import { firmarSesion, SESSION_COOKIE } from '@/src/auth/jwt'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request): Promise<Response> {
  try {
    const { email, password } = (await req.json()) as { email?: string; password?: string }
    const mail = (email ?? '').trim().toLowerCase()
    if (!mail || !password) return NextResponse.json({ error: 'Completá email y contraseña.' }, { status: 400 })

    const u = await adminDb.usuario.findUnique({
      where: { email: mail },
      include: { tenant: { select: { nombre: true } } },
    })
    // Mensaje genérico para no revelar si el email existe.
    if (!u || !u.activo || !(await bcrypt.compare(password, u.passwordHash)))
      return NextResponse.json({ error: 'Credenciales inválidas.' }, { status: 401 })

    await adminDb.usuario.update({ where: { id: u.id }, data: { ultimoLogin: new Date() } })
    const token = await firmarSesion({
      userId: u.id,
      email: u.email,
      rol: u.rol,
      tenantId: u.tenantId,
      tenantNombre: u.tenant?.nombre ?? null,
    })

    const res = NextResponse.json({ rol: u.rol, redirect: u.rol === 'SUPERADMIN' ? '/pasarelas' : '/' })
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    })
    return res
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
