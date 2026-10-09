// Sincroniza las transacciones de CLOVER de un mes vía su API, para cada mapeo
// CLOVER (modo API) del cliente. Reemplaza solo las transacciones Clover del mes
// (no toca HIOPOS ni otras pasarelas), re-concilia y devuelve el resumen.
//
// Credencial por cuenta de pasarela del cliente: identificador = Merchant ID
// (MID); credencialEnc = token. Base URL fija para Argentina (api.la.clover.com);
// se hará configurable si hace falta otra región.
import { NextResponse } from 'next/server'
import { adminDb } from '@/src/db/admin'
import { resolverTenant } from '@/src/auth/session'
import { descifrar } from '@/src/config/crypto'
import { obtenerPagosClover, obtenerRefundsClover } from '@/src/ingesta/clover'
import { ingestarTransaccionesBulk } from '@/src/ingesta/persistir'
import { reemplazarTransMes, reconciliarMes, limpiarSinPeriodo } from '@/src/carga/bloque'
import { resumenMes } from '@/src/carga/resumen'
import type { TransaccionNormalizada } from '@/src/ingesta/tipos'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

const CLOVER_BASE_AR = 'https://api.la.clover.com'

// Rango del mes en hora local de Argentina (UTC-3), expresado en UTC.
function rangoMesAr(periodo: string): { desde: Date; hasta: Date } {
  const [y, m] = periodo.split('-').map(Number)
  return {
    desde: new Date(Date.UTC(y, m - 1, 1, 3, 0, 0, 0)), // 00:00 AR del día 1
    hasta: new Date(Date.UTC(y, m, 1, 3, 0, 0, 0) - 1), // 23:59:59.999 AR del último día
  }
}

export async function POST(req: Request): Promise<Response> {
  try {
    const { tenant, periodo } = (await req.json()) as { tenant?: string; periodo?: string }
    if (!periodo || !/^\d{4}-\d{2}$/.test(periodo))
      return NextResponse.json({ error: 'Período inválido.' }, { status: 400 })

    const ctx = await resolverTenant(tenant)
    if (!ctx) return NextResponse.json({ error: 'No se pudo resolver el cliente.' }, { status: 400 })
    const { tenantId } = ctx

    const [cuentas, pasarela] = await Promise.all([
      adminDb.cuentaPasarela.findMany({
        where: { tenantId, proveedor: 'CLOVER', modo: 'API', activo: true, credencialEnc: { not: null } },
        select: { identificador: true, credencialEnc: true },
      }),
      adminDb.pasarela.findUnique({ where: { codigo: 'CLOVER' }, select: { urlApi: true } }),
    ])
    if (cuentas.length === 0)
      return NextResponse.json(
        { error: 'No hay cuentas Clover (API) con credencial configurada en Pasarelas.' },
        { status: 400 },
      )

    const baseUrl = pasarela?.urlApi?.trim() || CLOVER_BASE_AR
    const rango = rangoMesAr(periodo)
    const todas: TransaccionNormalizada[] = []
    let refunds = 0
    for (const c of cuentas) {
      const cfg = { baseUrl, merchantId: c.identificador, token: descifrar(c.credencialEnc as string) }
      todas.push(...(await obtenerPagosClover(cfg, rango)))
      const devs = await obtenerRefundsClover(cfg, rango) // devoluciones (en negativo)
      refunds += devs.length
      todas.push(...devs)
    }

    await limpiarSinPeriodo(tenantId)
    await reemplazarTransMes(tenantId, periodo, 'CLOVER')
    if (todas.length) await ingestarTransaccionesBulk(tenantId, todas, { periodo })
    await reconciliarMes(tenantId, periodo)

    const resumen = await resumenMes(tenantId, periodo)
    return NextResponse.json({ ...resumen, cloverSincronizadas: todas.length, cloverDevoluciones: refunds })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
