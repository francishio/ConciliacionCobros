// Panel super admin — clientes (tenants).
//   GET  → lista de clientes con estado de credenciales HIOPOS, #tiendas y usuarios
//   POST { nombre } → alta de cliente
// Solo SUPERADMIN (middleware lo gatea; se re-chequea acá por defensa).
import { NextResponse } from 'next/server'
import { adminDb } from '@/src/db/admin'
import { sesionActual } from '@/src/auth/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function guard(): Promise<Response | null> {
  const s = await sesionActual()
  if (s?.rol !== 'SUPERADMIN') return NextResponse.json({ error: 'Requiere super admin.' }, { status: 403 })
  return null
}

export async function GET(): Promise<Response> {
  const no = await guard()
  if (no) return no
  try {
    const [tenants, pasarelas, cuentas, ultVenta, ultCobro] = await Promise.all([
      adminDb.tenant.findMany({
        orderBy: { nombre: 'asc' },
        select: {
          id: true,
          nombre: true,
          numeroBD: true,
          configHiopos: { select: { apiUser: true, apiPasswordEnc: true, expIdVentas: true } },
          usuarios: { select: { id: true, email: true, activo: true }, orderBy: { creadoEn: 'asc' } },
          _count: { select: { establecimientos: true } },
        },
      }),
      adminDb.pasarela.findMany({ orderBy: { orden: 'asc' }, select: { codigo: true, nombre: true } }),
      adminDb.cuentaPasarela.groupBy({ by: ['tenantId', 'proveedor'] }),
      adminDb.cobro.groupBy({ by: ['tenantId'], _max: { fechaHora: true } }),
      adminDb.transaccion.groupBy({ by: ['tenantId'], _max: { fechaHora: true } }),
    ])

    // Mapas por tenant
    const asignadas = new Map<string, Set<string>>()
    for (const c of cuentas) {
      const s = asignadas.get(c.tenantId) ?? new Set<string>()
      s.add(c.proveedor)
      asignadas.set(c.tenantId, s)
    }
    const ventaDe = new Map(ultVenta.map((v) => [v.tenantId, v._max.fechaHora]))
    const cobroDe = new Map(ultCobro.map((v) => [v.tenantId, v._max.fechaHora]))

    return NextResponse.json({
      pasarelas,
      clientes: tenants.map((t) => ({
        id: t.id,
        nombre: t.nombre,
        numeroBD: t.numeroBD ?? null,
        tiendas: t._count.establecimientos,
        credHiopos: !!t.configHiopos?.apiPasswordEnc,
        apiUser: t.configHiopos?.apiUser ?? null,
        expIdVentas: t.configHiopos?.expIdVentas ?? null,
        usuarios: t.usuarios,
        pasarelasAsignadas: [...(asignadas.get(t.id) ?? [])],
        ultimaVentaHio: ventaDe.get(t.id) ?? null,
        ultimoCobroPasarela: cobroDe.get(t.id) ?? null,
      })),
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

export async function POST(req: Request): Promise<Response> {
  const no = await guard()
  if (no) return no
  try {
    const { nombre } = (await req.json()) as { nombre?: string }
    const n = (nombre ?? '').trim()
    if (!n) return NextResponse.json({ error: 'Falta el nombre del cliente.' }, { status: 400 })
    const ya = await adminDb.tenant.findFirst({ where: { nombre: n }, select: { id: true } })
    if (ya) return NextResponse.json({ error: `Ya existe un cliente "${n}".` }, { status: 409 })
    const t = await adminDb.tenant.create({ data: { nombre: n }, select: { id: true } })
    return NextResponse.json({ id: t.id })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }
}
