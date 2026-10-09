// Panel super admin — usuarios de un cliente.
//   POST { accion: 'crear', tenantId, email, password? } → crea usuario CLIENTE.
//   POST { accion: 'reset', userId, password? }           → cambia la contraseña.
// La `password` es opcional: si no viene (o viene vacía), se genera una aleatoria.
// En ambos casos se devuelve la contraseña usada (se muestra una vez). Solo SUPERADMIN.
import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import { NextResponse } from 'next/server'
import { adminDb } from '@/src/db/admin'
import { sesionActual } from '@/src/auth/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MIN_PASS = 6
function generarPassword(): string {
  return crypto.randomBytes(9).toString('base64url')
}

export async function POST(req: Request): Promise<Response> {
  const s = await sesionActual()
  if (s?.rol !== 'SUPERADMIN') return NextResponse.json({ error: 'Requiere super admin.' }, { status: 403 })
  try {
    const b = (await req.json()) as { accion?: string; tenantId?: string; email?: string; userId?: string; password?: string }

    // Contraseña: la que puso el admin (si es válida) o una generada.
    const elegida = (b.password ?? '').trim()
    if (elegida && elegida.length < MIN_PASS)
      return NextResponse.json({ error: `La contraseña debe tener al menos ${MIN_PASS} caracteres.` }, { status: 400 })
    const pass = elegida || generarPassword()
    const generada = !elegida

    if (b.accion === 'reset') {
      if (!b.userId) return NextResponse.json({ error: 'Falta userId.' }, { status: 400 })
      await adminDb.usuario.update({
        where: { id: b.userId },
        data: { passwordHash: await bcrypt.hash(pass, 10), activo: true },
      })
      return NextResponse.json({ password: pass, generada })
    }

    // crear
    const email = (b.email ?? '').trim().toLowerCase()
    if (!b.tenantId || !email) return NextResponse.json({ error: 'Faltan cliente y email.' }, { status: 400 })
    const existe = await adminDb.usuario.findUnique({ where: { email }, select: { id: true } })
    if (existe) return NextResponse.json({ error: `Ya existe un usuario con el email ${email}.` }, { status: 409 })

    await adminDb.usuario.create({
      data: { email, passwordHash: await bcrypt.hash(pass, 10), rol: 'CLIENTE', tenantId: b.tenantId },
    })
    return NextResponse.json({ password: pass, generada })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }
}
