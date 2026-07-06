// Carga de un bloque mensual: recibe el mes (YYYY-MM) + export HIOPOS (csv) +
// extracto Payway (xlsx, opcional), reemplaza el bloque del mes, ingiere con
// `periodo`, concilia y devuelve el resumen del mes (KPIs + establecimientos +
// cobertura). El tenant sale de la sesión.
import { NextResponse } from 'next/server'
import { adminDb } from '@/src/db/admin'
import { resolverTenant } from '@/src/auth/session'
import { parseCobrosHiopos } from '@/src/ingesta/hiopos/cobros'
import { parseTransaccionesPayway } from '@/src/ingesta/payway'
import { ingestarCobrosBulk, ingestarTransaccionesBulk } from '@/src/ingesta/persistir'
import { conciliarOperativa } from '@/src/matching/operativa'
import { reemplazarBloqueMes } from '@/src/carga/bloque'
import { resumenMes } from '@/src/carga/resumen'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

function proveedorDeMedio(m: string): 'PAYWAY' | 'MERCADOPAGO' | null {
  if (/cr[eé]dito otras|d[eé]bito otras/i.test(m)) return 'PAYWAY'
  if (/mercado\s*pago/i.test(m)) return 'MERCADOPAGO'
  return null
}

export async function POST(req: Request): Promise<Response> {
  try {
    const form = await req.formData()
    const periodo = String(form.get('periodo') || '').trim()
    if (!/^\d{4}-\d{2}$/.test(periodo))
      return NextResponse.json({ error: 'Período inválido (usá el selector de mes).' }, { status: 400 })

    const ctx = await resolverTenant(String(form.get('tenant') || ''))
    if (!ctx) return NextResponse.json({ error: 'No se pudo resolver el cliente.' }, { status: 400 })
    const { tenantId } = ctx

    const hioposFile = form.get('hiopos')
    if (!(hioposFile instanceof File))
      return NextResponse.json({ error: 'Subí el export de HIOPOS (.csv).' }, { status: 400 })
    const paywayFile = form.get('payway')

    const cobros = parseCobrosHiopos(Buffer.from(await hioposFile.arrayBuffer()).toString('utf8'))
    const transacciones =
      paywayFile instanceof File ? parseTransaccionesPayway(Buffer.from(await paywayFile.arrayBuffer())) : []

    // Reemplaza el bloque del mes (idempotente).
    await reemplazarBloqueMes(tenantId, periodo)

    // Mapeo de medios: crea los que falten (no pisa los ya configurados).
    const medios = [...new Set(cobros.map((c) => c.medioPago))]
    for (const m of medios) {
      await adminDb.mapeoMedioPago.upsert({
        where: { tenantId_medioPago: { tenantId, medioPago: m } },
        create: { tenantId, medioPago: m, proveedor: proveedorDeMedio(m) },
        update: {},
      })
    }
    await adminDb.matchingProfile.upsert({
      where: { tenantId },
      create: { tenantId, ventanaMin: 600, tolMonto: '0' },
      update: {},
    })

    await ingestarCobrosBulk(tenantId, cobros, { periodo })
    if (transacciones.length) await ingestarTransaccionesBulk(tenantId, transacciones, { periodo })
    await conciliarOperativa(tenantId, 'PAYWAY')

    const resumen = await resumenMes(tenantId, periodo)
    return NextResponse.json(resumen)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
