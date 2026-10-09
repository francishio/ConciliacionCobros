// Sugerencias de los usuarios.
//   GET    → CLIENTE: solo las suyas · SUPERADMIN: todas (con el usuario)
//   POST   { descripcion } → el usuario actual crea una sugerencia (estado NUEVO)
//   PATCH  { id, comentarioHio?, estado? } → SOLO SUPERADMIN (comentario + estado)
import { NextResponse } from 'next/server'
import { adminDb } from '@/src/db/admin'
import { sesionActual } from '@/src/auth/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ESTADOS = ['NUEVO', 'ACEPTADO', 'RECHAZADO', 'IMPLEMENTADO'] as const

export async function GET(): Promise<Response> {
  try {
    const s = await sesionActual()
    if (!s) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 })
    const esAdmin = s.rol === 'SUPERADMIN'

    const filas = await adminDb.sugerencia.findMany({
      where: esAdmin ? {} : { usuarioId: s.userId },
      orderBy: { creadoEn: 'desc' },
      select: {
        id: true,
        descripcion: true,
        comentarioHio: true,
        estado: true,
        creadoEn: true,
        usuario: { select: { email: true } },
      },
    })

    return NextResponse.json({
      esAdmin,
      sugerencias: filas.map((f) => ({
        id: f.id,
        usuario: f.usuario.email,
        fecha: f.creadoEn,
        descripcion: f.descripcion,
        comentarioHio: f.comentarioHio,
        estado: f.estado,
      })),
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

export async function POST(req: Request): Promise<Response> {
  try {
    const s = await sesionActual()
    if (!s) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 })
    const { descripcion } = (await req.json()) as { descripcion?: string }
    const d = (descripcion ?? '').trim()
    if (!d) return NextResponse.json({ error: 'Escribí la sugerencia.' }, { status: 400 })

    await adminDb.sugerencia.create({ data: { usuarioId: s.userId, descripcion: d } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }
}

export async function DELETE(req: Request): Promise<Response> {
  try {
    const s = await sesionActual()
    if (!s) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 })
    const { id } = (await req.json()) as { id?: string }
    const sid = (id ?? '').trim()
    if (!sid) return NextResponse.json({ error: 'Falta el id.' }, { status: 400 })

    // El usuario borra solo las suyas; el SUPERADMIN, cualquiera.
    const where = s.rol === 'SUPERADMIN' ? { id: sid } : { id: sid, usuarioId: s.userId }
    const existe = await adminDb.sugerencia.findFirst({ where, select: { id: true } })
    if (!existe) return NextResponse.json({ error: 'Sugerencia no encontrada.' }, { status: 404 })
    await adminDb.sugerencia.delete({ where: { id: sid } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }
}

export async function PATCH(req: Request): Promise<Response> {
  try {
    const s = await sesionActual()
    if (s?.rol !== 'SUPERADMIN')
      return NextResponse.json({ error: 'Solo ICG puede comentar / cambiar el estado.' }, { status: 403 })

    const b = (await req.json()) as { id?: string; comentarioHio?: string; estado?: string }
    const id = (b.id ?? '').trim()
    if (!id) return NextResponse.json({ error: 'Falta el id.' }, { status: 400 })

    const data: { comentarioHio?: string | null; estado?: (typeof ESTADOS)[number] } = {}
    if (b.comentarioHio !== undefined) data.comentarioHio = (b.comentarioHio ?? '').trim() || null
    if (b.estado !== undefined) {
      if (!ESTADOS.includes(b.estado as (typeof ESTADOS)[number]))
        return NextResponse.json({ error: 'Estado inválido.' }, { status: 400 })
      data.estado = b.estado as (typeof ESTADOS)[number]
    }
    await adminDb.sugerencia.update({ where: { id }, data })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }
}
