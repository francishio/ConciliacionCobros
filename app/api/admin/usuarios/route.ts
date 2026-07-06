// Panel super admin — usuarios de un cliente.
//   POST { accion: 'crear', tenantId, email } → crea usuario CLIENTE, devuelve
//         la contraseña generada UNA vez.
//   POST { accion: 'reset', userId }          → nueva contraseña, devuelta una vez.
// Solo SUPERADMIN.
import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import { NextResponse } from 'next/server'
import { adminDb } from '@/src/db/admin'
import { sesionActual } from '@/src/auth/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function generarPassword(): string {
  return crypto.randomBytes(9).toString('base64url')
}

export async function POST(req: Request): Promise<Response> {
  const s = await sesionActual()
  if (s?.rol !== 'SUPERADMIN') return NextResponse.json({ error: 'Requiere super admin.' }, { status: 403 })
  try {
    const b = (await req.json()) as { accion?: string; tenantId?: string; email?: string; userId?: string }

    if (b.accion === 'reset') {
      if (!b.userId) return NextResponse.json({ error: 'Falta userId.' }, { status: 400 })
      const pass = generarPassword()
      await adminDb.usuario.update({
        where: { id: b.userId },
        data: { passwordHash: await bcrypt.hash(pass, 10), activo: true },
      })
      return NextResponse.json({ password: pass })
    }

    // crear
    const email = (b.email ?? '').trim().toLowerCase()
    if (!b.tenantId || !email) return NextResponse.json({ error: 'Faltan cliente y email.' }, { status: 400 })
    const existe = await adminDb.usuario.findUnique({ where: { email }, select: { id: true } })
    if (existe) return NextResponse.json({ error: `Ya existe un usuario con el email ${email}.` }, { status: 409 })

    const pass = generarPassword()
    await adminDb.usuario.create({
      data: { email, passwordHash: await bcrypt.hash(pass, 10), rol: 'CLIENTE', tenantId: b.tenantId },
    })
    return NextResponse.json({ password: pass })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }
}
