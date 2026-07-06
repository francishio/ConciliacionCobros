// API de establecimientos + mapeo de pasarelas.
//   GET    ?tenant=Rochino                  → tiendas con sus mapeos de pasarela
//   POST   { tenant, establecimientoId, proveedor, codigoExterno, descripcion? }
//                                            → agrega un código de pasarela a una tienda
//   DELETE { tenant, id }                    → borra un mapeo
//
// El tenant sale de la sesión: CLIENTE → el suyo; SUPERADMIN → ?tenant=.
import { NextResponse } from 'next/server'
import { adminDb } from '@/src/db/admin'
import { resolverTenant } from '@/src/auth/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request): Promise<Response> {
  try {
    const ctx = await resolverTenant(new URL(req.url).searchParams.get('tenant'))
    if (!ctx) return NextResponse.json({ error: 'No se pudo resolver el cliente.' }, { status: 400 })
    const { tenantId, nombre } = ctx

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
    const codigoExterno = (b.codigoExterno ?? '').trim()
    const proveedor = (b.proveedor ?? '').trim()
    if (!b.establecimientoId || !proveedor || !codigoExterno)
      return NextResponse.json({ error: 'Faltan establecimiento, proveedor y/o código.' }, { status: 400 })
    const pasarela = await adminDb.pasarela.findUnique({ where: { codigo: proveedor }, select: { activo: true } })
    if (!pasarela || !pasarela.activo)
      return NextResponse.json({ error: `Pasarela inválida o inactiva: ${proveedor}.` }, { status: 400 })

    const ctx = await resolverTenant(b.tenant)
    if (!ctx) return NextResponse.json({ error: 'No se pudo resolver el cliente.' }, { status: 400 })
    const { tenantId } = ctx

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
    if (!b.id) return NextResponse.json({ error: 'Falta el id del mapeo.' }, { status: 400 })

    const ctx = await resolverTenant(b.tenant)
    if (!ctx) return NextResponse.json({ error: 'No se pudo resolver el cliente.' }, { status: 400 })

    await adminDb.mapeoEstablecimientoPasarela.deleteMany({ where: { id: b.id, tenantId: ctx.tenantId } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }
}
