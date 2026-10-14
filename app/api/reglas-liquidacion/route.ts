// Reglas de liquidación por cliente: plazo + comisión por (pasarela, tipo de cobro).
//   GET  ?tenant= → reglas guardadas + las pasarelas que usa el cliente
//   POST { tenant, proveedor, tipoCobro, plazoDias, habiles, comisionPct } → upsert
// Solo SUPERADMIN (es config comercial del cliente).
import { NextResponse } from 'next/server'
import { adminDb } from '@/src/db/admin'
import { sesionActual, resolverTenant } from '@/src/auth/session'
import { TIPOS_COBRO } from '@/src/acreditaciones/tipo-cobro'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function guard(tenantParam: string | null | undefined) {
  const s = await sesionActual()
  if (s?.rol !== 'SUPERADMIN') return { error: 'Requiere super admin.', status: 403 as const }
  const ctx = await resolverTenant(tenantParam)
  if (!ctx) return { error: 'No se pudo resolver el cliente.', status: 400 as const }
  return { ctx }
}

export async function GET(req: Request): Promise<Response> {
  try {
    const g = await guard(new URL(req.url).searchParams.get('tenant'))
    if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })
    const { tenantId } = g.ctx

    const [reglas, cuentas, catalogo] = await Promise.all([
      adminDb.reglaLiquidacion.findMany({
        where: { tenantId },
        select: { proveedor: true, tipoCobro: true, plazoDias: true, habiles: true, comisionPct: true },
      }),
      adminDb.cuentaPasarela.findMany({ where: { tenantId, activo: true }, select: { proveedor: true } }),
      adminDb.pasarela.findMany({ orderBy: { orden: 'asc' }, select: { codigo: true, nombre: true } }),
    ])
    const codigos = [...new Set(cuentas.map((c) => c.proveedor))]
    const nombre = new Map(catalogo.map((p) => [p.codigo, p.nombre]))
    const pasarelas = codigos.map((c) => ({ codigo: c, nombre: nombre.get(c) ?? c }))

    return NextResponse.json({
      tipos: TIPOS_COBRO,
      pasarelas,
      reglas: reglas.map((r) => ({ ...r, comisionPct: Number(r.comisionPct) })),
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

export async function POST(req: Request): Promise<Response> {
  try {
    const b = (await req.json()) as {
      tenant?: string
      proveedor?: string
      tipoCobro?: string
      plazoDias?: number
      habiles?: boolean
      comisionPct?: number
    }
    const g = await guard(b.tenant)
    if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })
    const { tenantId } = g.ctx

    const proveedor = (b.proveedor ?? '').trim()
    const tipoCobro = (b.tipoCobro ?? '').trim().toUpperCase()
    if (!proveedor || !TIPOS_COBRO.includes(tipoCobro as (typeof TIPOS_COBRO)[number]))
      return NextResponse.json({ error: 'Pasarela o tipo de cobro inválido.' }, { status: 400 })

    const plazoDias = Math.max(0, Math.round(Number(b.plazoDias ?? 0)))
    const habiles = !!b.habiles
    const comisionPct = Math.max(0, Number(b.comisionPct ?? 0))
    if (!Number.isFinite(plazoDias) || !Number.isFinite(comisionPct))
      return NextResponse.json({ error: 'Plazo o comisión inválidos.' }, { status: 400 })

    await adminDb.reglaLiquidacion.upsert({
      where: { tenantId_proveedor_tipoCobro: { tenantId, proveedor, tipoCobro } },
      create: { tenantId, proveedor, tipoCobro, plazoDias, habiles, comisionPct },
      update: { plazoDias, habiles, comisionPct },
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }
}
