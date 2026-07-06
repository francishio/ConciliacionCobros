// Mapeo Medio de Pago (HIOPOS) → pasarela, por cliente. Los medios se derivan de
// las ventas cargadas (Cód. Medio Pago + nombre); el cliente asigna cada uno a
// una pasarela o a "No conciliable". Al guardar, re-concilia los meses con datos.
import { NextResponse } from 'next/server'
import { adminDb } from '@/src/db/admin'
import { resolverTenant } from '@/src/auth/session'
import { reconciliarMes } from '@/src/carga/bloque'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function GET(req: Request): Promise<Response> {
  try {
    const ctx = await resolverTenant(new URL(req.url).searchParams.get('tenant'))
    if (!ctx) return NextResponse.json({ error: 'No se pudo resolver el cliente.' }, { status: 400 })
    const { tenantId } = ctx

    const [grupos, mapeos, pasarelas] = await Promise.all([
      adminDb.cobro.groupBy({
        by: ['codMedioPago', 'medioPago'],
        where: { tenantId, codMedioPago: { not: null } },
        _count: { _all: true },
      }),
      adminDb.mapeoMedioPago.findMany({ where: { tenantId }, select: { codMedioPago: true, proveedor: true } }),
      adminDb.pasarela.findMany({ where: { activo: true }, orderBy: { orden: 'asc' }, select: { codigo: true, nombre: true } }),
    ])

    const provDe = new Map(mapeos.map((m) => [m.codMedioPago, m.proveedor]))
    const medios = grupos
      .map((g) => ({
        codMedioPago: g.codMedioPago as string,
        medioPago: g.medioPago,
        cobros: g._count._all,
        proveedor: provDe.get(g.codMedioPago as string) ?? null,
      }))
      .sort((a, b) => b.cobros - a.cobros)

    return NextResponse.json({ pasarelas, medios })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

export async function POST(req: Request): Promise<Response> {
  try {
    const b = (await req.json()) as {
      tenant?: string
      medios?: { codMedioPago: string; medioPago: string; proveedor: string | null }[]
    }
    const ctx = await resolverTenant(b.tenant)
    if (!ctx) return NextResponse.json({ error: 'No se pudo resolver el cliente.' }, { status: 400 })
    const { tenantId } = ctx
    const medios = b.medios ?? []

    const validas = new Set((await adminDb.pasarela.findMany({ select: { codigo: true } })).map((p) => p.codigo))
    for (const m of medios) {
      const prov = (m.proveedor ?? '').trim() || null
      if (prov && !validas.has(prov))
        return NextResponse.json({ error: `Pasarela inválida: ${prov}.` }, { status: 400 })
      if (!m.codMedioPago) continue
      await adminDb.mapeoMedioPago.upsert({
        where: { tenantId_codMedioPago: { tenantId, codMedioPago: m.codMedioPago } },
        create: { tenantId, codMedioPago: m.codMedioPago, medioPago: m.medioPago, proveedor: prov },
        update: { proveedor: prov, medioPago: m.medioPago },
      })
    }

    // Re-concilia los meses con datos para reflejar el cambio.
    const periodos = (
      await adminDb.cobro.findMany({
        where: { tenantId, periodo: { not: null } },
        distinct: ['periodo'],
        select: { periodo: true },
      })
    )
      .map((p) => p.periodo)
      .filter((p): p is string => !!p)
    for (const p of periodos) await reconciliarMes(tenantId, p)

    return NextResponse.json({ ok: true, periodos: periodos.length })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }
}
