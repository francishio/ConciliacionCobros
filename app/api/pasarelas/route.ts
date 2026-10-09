// Catálogo de pasarelas (global, no por-tenant). ABM desde Configuración →
// Catálogo de pasarelas.
//   GET    → lista todas
//   POST   { codigo?, nombre, urlApi?, orden? } → upsert por codigo
//   DELETE { codigo } → baja (si ninguna cuenta de cliente la usa)
//
// El `codigo` es la clave estable que guardan Transaccion/Mapeo/Cuenta. Si no se
// envía, se deriva del nombre (MAYÚSCULAS sin espacios).
import { NextResponse } from 'next/server'
import { adminDb } from '@/src/db/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const aCodigo = (s: string) =>
  s
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // sin acentos
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')

export async function GET(): Promise<Response> {
  try {
    const pasarelas = await adminDb.pasarela.findMany({ orderBy: [{ orden: 'asc' }, { nombre: 'asc' }] })
    return NextResponse.json({ pasarelas })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

export async function POST(req: Request): Promise<Response> {
  try {
    const b = (await req.json()) as { codigo?: string; nombre?: string; urlApi?: string; orden?: number }
    const nombre = (b.nombre ?? '').trim()
    if (!nombre) return NextResponse.json({ error: 'Falta el nombre de la pasarela.' }, { status: 400 })
    const codigo = aCodigo(b.codigo?.trim() || nombre)
    if (!codigo) return NextResponse.json({ error: 'Nombre inválido para derivar el código.' }, { status: 400 })
    const urlApi = (b.urlApi ?? '').trim() || null

    const datos = { nombre, urlApi, ...(typeof b.orden === 'number' ? { orden: b.orden } : {}) }
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

export async function DELETE(req: Request): Promise<Response> {
  try {
    const { codigo } = (await req.json()) as { codigo?: string }
    const cod = (codigo ?? '').trim()
    if (!cod) return NextResponse.json({ error: 'Falta el código.' }, { status: 400 })
    const enUso = await adminDb.cuentaPasarela.count({ where: { proveedor: cod } })
    if (enUso > 0)
      return NextResponse.json(
        { error: `No se puede eliminar: ${enUso} cuenta(s) de cliente usan esta pasarela.` },
        { status: 409 },
      )
    await adminDb.pasarela.deleteMany({ where: { codigo: cod } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }
}
