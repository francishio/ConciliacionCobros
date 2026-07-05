// Catálogo de pasarelas (global, no por-tenant). Administrable desde
// Configuración → Pasarelas.
//   GET  → lista todas (activas e inactivas)
//   POST { codigo, nombre, tipoIngesta?, activo?, orden? } → upsert por codigo
//
// El `codigo` es la clave estable que guardan Transaccion/Mapeo/Liquidacion.
// Se normaliza a MAYÚSCULAS sin espacios para que sea estable.
import { NextResponse } from 'next/server'
import { adminDb } from '@/src/db/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TIPOS = ['ARCHIVO', 'API', 'PENDIENTE']

export async function GET(): Promise<Response> {
  try {
    const pasarelas = await adminDb.pasarela.findMany({ orderBy: [{ orden: 'asc' }, { nombre: 'asc' }] })
    return NextResponse.json({ pasarelas, tipos: TIPOS })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

export async function POST(req: Request): Promise<Response> {
  try {
    const b = (await req.json()) as {
      codigo?: string
      nombre?: string
      tipoIngesta?: string
      activo?: boolean
      orden?: number
    }
    const codigo = (b.codigo ?? '')
      .trim()
      .toUpperCase()
      .replace(/\s+/g, '_')
    const nombre = (b.nombre ?? '').trim()
    if (!codigo || !nombre) return NextResponse.json({ error: 'Faltan código y nombre.' }, { status: 400 })
    const tipoIngesta = TIPOS.includes(b.tipoIngesta ?? '') ? (b.tipoIngesta as string) : 'PENDIENTE'

    const datos = {
      nombre,
      tipoIngesta,
      activo: b.activo ?? true,
      ...(typeof b.orden === 'number' ? { orden: b.orden } : {}),
    }
    await adminDb.pasarela.upsert({
      where: { codigo },
      create: { codigo, ...datos, orden: b.orden ?? 100 },
      update: datos,
    })
    return NextResponse.json({ ok: true, codigo })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }
}
