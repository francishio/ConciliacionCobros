// API de establecimientos + mapeo de pasarelas.
//   GET    ?tenant=Rochino                  → tiendas con sus mapeos de pasarela
//   POST   { tenant, establecimientoId, proveedor, codigoExterno, descripcion? }
//                                            → agrega un código de pasarela a una tienda
//   DELETE { tenant, id }                    → borra un mapeo
//
// MVP: el tenant se resuelve por nombre (sin login todavía).
import { NextResponse } from 'next/server'
import { adminDb } from '@/src/db/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function tenantIdPorNombre(nombre: string): Promise<string | null> {
  const t = await adminDb.tenant.findFirst({ where: { nombre }, select: { id: true } })
  return t?.id ?? null
}

export async function GET(req: Request): Promise<Response> {
  try {
    const nombre = new URL(req.url).searchParams.get('tenant')?.trim() || 'Demo'
    const tenantId = await tenantIdPorNombre(nombre)
    if (!tenantId) return NextResponse.json({ error: `No existe el cliente "${nombre}".` }, { status: 404 })

    const [establecimientos, pasarelas] = await Promise.all([
      adminDb.establecimiento.findMany({
        where: { tenantId },
        orderBy: [{ codTienda: 'asc' }, { nombre: 'asc' }],
        include: {
          mapeosPasarela: { orderBy: { creadoEn: 'asc' } },
          _count: { select: { cobros: true, transacciones: true } },
        },
      }),
      adminDb.pasarela.findMany({
        where: { activo: true },
        orderBy: { orden: 'asc' },
        select: { codigo: true, nombre: true },
      }),
    ])

    return NextResponse.json({
      tenant: nombre,
      proveedores: pasarelas,
      establecimientos: establecimientos.map((e) => ({
        id: e.id,
        nombre: e.nombre,
        codTienda: e.codTienda,
        direccion: e.direccion,
        localidad: e.localidad,
        provincia: e.provincia,
        grupo: e.grupo,
        cobros: e._count.cobros,
        transacciones: e._count.transacciones,
        mapeos: e.mapeosPasarela.map((m) => ({
          id: m.id,
          proveedor: m.proveedor,
          codigoExterno: m.codigoExterno,
          descripcion: m.descripcion,
        })),
      })),
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

export async function POST(req: Request): Promise<Response> {
  try {
    const b = (await req.json()) as {
      tenant?: string
      establecimientoId?: string
      proveedor?: string
      codigoExterno?: string
      descripcion?: string
    }
    const nombre = (b.tenant ?? '').trim() || 'Demo'
    const codigoExterno = (b.codigoExterno ?? '').trim()
    const proveedor = (b.proveedor ?? '').trim()
    if (!b.establecimientoId || !proveedor || !codigoExterno)
      return NextResponse.json({ error: 'Faltan establecimiento, proveedor y/o código.' }, { status: 400 })
    const pasarela = await adminDb.pasarela.findUnique({ where: { codigo: proveedor }, select: { activo: true } })
    if (!pasarela || !pasarela.activo)
      return NextResponse.json({ error: `Pasarela inválida o inactiva: ${proveedor}.` }, { status: 400 })

    const tenantId = await tenantIdPorNombre(nombre)
    if (!tenantId) return NextResponse.json({ error: `No existe el cliente "${nombre}".` }, { status: 404 })

    // El código debe pertenecer a una sola tienda (unique tenant+proveedor+código).
    const ya = await adminDb.mapeoEstablecimientoPasarela.findFirst({
      where: { tenantId, proveedor, codigoExterno },
      include: { establecimiento: { select: { nombre: true } } },
    })
    if (ya)
      return NextResponse.json(
        { error: `El código ${codigoExterno} ya está asignado a "${ya.establecimiento.nombre}".` },
        { status: 409 },
      )

    const m = await adminDb.mapeoEstablecimientoPasarela.create({
      data: {
        tenantId,
        establecimientoId: b.establecimientoId,
        proveedor,
        codigoExterno,
        descripcion: (b.descripcion ?? '').trim() || null,
      },
      select: { id: true },
    })
    return NextResponse.json({ id: m.id })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }
}

export async function DELETE(req: Request): Promise<Response> {
  try {
    const b = (await req.json()) as { tenant?: string; id?: string }
    const nombre = (b.tenant ?? '').trim() || 'Demo'
    if (!b.id) return NextResponse.json({ error: 'Falta el id del mapeo.' }, { status: 400 })

    const tenantId = await tenantIdPorNombre(nombre)
    if (!tenantId) return NextResponse.json({ error: `No existe el cliente "${nombre}".` }, { status: 404 })

    await adminDb.mapeoEstablecimientoPasarela.deleteMany({ where: { id: b.id, tenantId } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }
}
