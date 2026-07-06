// Sincroniza las VENTAS/COBROS de un mes directo desde HIOPOS (Bridge, con el
// Exportation ID de Ventas + el rango del mes). Reemplaza solo los cobros del mes
// (no toca los extractos de pasarela), re-concilia y devuelve el resumen.
import { NextResponse } from 'next/server'
import { adminDb } from '@/src/db/admin'
import { resolverTenant } from '@/src/auth/session'
import { descifrar } from '@/src/config/crypto'
import { HioposBridgeClient } from '@/src/ingesta/hiopos/bridge'
import { parseCobrosHiopos } from '@/src/ingesta/hiopos/cobros'
import { cargarCobrosHiopos } from '@/src/carga/cobros'
import { reconciliarMes, limpiarSinPeriodo } from '@/src/carga/bloque'
import { resumenMes } from '@/src/carga/resumen'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

// Rango del mes YYYY-MM → { desde: YYYY-MM-01, hasta: YYYY-MM-<último día> }.
function rangoMes(periodo: string): { desde: string; hasta: string } {
  const [y, m] = periodo.split('-').map(Number)
  const ultimo = new Date(y, m, 0).getDate()
  return { desde: `${periodo}-01`, hasta: `${periodo}-${String(ultimo).padStart(2, '0')}` }
}

export async function POST(req: Request): Promise<Response> {
  try {
    const { tenant, periodo } = (await req.json()) as { tenant?: string; periodo?: string }
    if (!periodo || !/^\d{4}-\d{2}$/.test(periodo))
      return NextResponse.json({ error: 'Período inválido.' }, { status: 400 })

    const ctx = await resolverTenant(tenant)
    if (!ctx) return NextResponse.json({ error: 'No se pudo resolver el cliente.' }, { status: 400 })
    const { tenantId } = ctx

    const t = await adminDb.tenant.findUnique({ where: { id: tenantId }, select: { configHiopos: true } })
    const cfg = t?.configHiopos
    if (!cfg?.apiUser || !cfg.apiPasswordEnc)
      return NextResponse.json({ error: 'Faltan las credenciales de HIOPOS (Configuración).' }, { status: 400 })
    if (!cfg.expIdVentas)
      return NextResponse.json({ error: 'Falta el Exportation ID de Ventas (Configuración).' }, { status: 400 })

    const { desde, hasta } = rangoMes(periodo)
    const client = new HioposBridgeClient({ email: cfg.apiUser, password: descifrar(cfg.apiPasswordEnc) })
    // El Bridge es intermitente (a veces devuelve vacío): más reintentos.
    const docs = await client.exportar(
      { exportationId: cfg.expIdVentas, startDate: desde, endDate: hasta },
      { reintentosVacios: 6, demoraMs: 3000 },
    )
    if (docs.length === 0)
      return NextResponse.json(
        { error: 'El Bridge no devolvió datos (suele ser intermitente). Probá de nuevo en unos segundos.' },
        { status: 502 },
      )

    const cobros = parseCobrosHiopos(docs[0].contenido)

    await limpiarSinPeriodo(tenantId)
    await cargarCobrosHiopos(tenantId, periodo, cobros)
    await reconciliarMes(tenantId, periodo)

    const resumen = await resumenMes(tenantId, periodo)
    return NextResponse.json({ ...resumen, cobrosSincronizados: cobros.length })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
