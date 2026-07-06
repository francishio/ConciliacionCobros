// Carga de un bloque mensual: mes (YYYY-MM) + export HIOPOS (csv) + un extracto
// por pasarela que el cliente usa en modo archivo. Reemplaza el bloque, ingiere
// con `periodo`, concilia cada pasarela y devuelve el resumen del mes.
//   GET  → pasarelas del cliente en modo archivo (para armar los inputs)
//   POST → mes + hiopos + extracto_<codigo> por pasarela
import { NextResponse } from 'next/server'
import { adminDb } from '@/src/db/admin'
import { resolverTenant } from '@/src/auth/session'
import { parseCobrosHiopos } from '@/src/ingesta/hiopos/cobros'
import { parseTransaccionesPayway } from '@/src/ingesta/payway'
import { ingestarCobrosBulk, ingestarTransaccionesBulk } from '@/src/ingesta/persistir'
import { conciliarOperativa } from '@/src/matching/operativa'
import { reemplazarBloqueMes, limpiarSinPeriodo } from '@/src/carga/bloque'
import { resumenMes } from '@/src/carga/resumen'
import type { TransaccionNormalizada } from '@/src/ingesta/tipos'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

// Parsers de extracto por pasarela (codigo → parser de archivo). Cada pasarela
// nueva necesita su parser acá para poder ingerir su extracto.
const PARSERS: Record<string, (buf: Buffer) => TransaccionNormalizada[]> = {
  PAYWAY: (buf) => parseTransaccionesPayway(buf),
}

function proveedorDeMedio(m: string): 'PAYWAY' | 'MERCADOPAGO' | null {
  if (/cr[eé]dito otras|d[eé]bito otras/i.test(m)) return 'PAYWAY'
  if (/mercado\s*pago/i.test(m)) return 'MERCADOPAGO'
  return null
}

// Pasarelas del cliente en modo archivo (distinct proveedor de los mapeos MANUAL).
async function pasarelasArchivo(tenantId: string) {
  const mapeos = await adminDb.mapeoEstablecimientoPasarela.findMany({
    where: { tenantId, modo: 'MANUAL' },
    distinct: ['proveedor'],
    select: { proveedor: true },
  })
  const codigos = mapeos.map((m) => m.proveedor)
  if (codigos.length === 0) return []
  const catalogo = await adminDb.pasarela.findMany({
    where: { codigo: { in: codigos } },
    orderBy: { orden: 'asc' },
    select: { codigo: true, nombre: true },
  })
  return catalogo.map((p) => ({ codigo: p.codigo, nombre: p.nombre, tieneParser: !!PARSERS[p.codigo] }))
}

export async function GET(req: Request): Promise<Response> {
  try {
    const ctx = await resolverTenant(new URL(req.url).searchParams.get('tenant'))
    if (!ctx) return NextResponse.json({ error: 'No se pudo resolver el cliente.' }, { status: 400 })
    return NextResponse.json({ pasarelas: await pasarelasArchivo(ctx.tenantId) })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
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

    const cobros = parseCobrosHiopos(Buffer.from(await hioposFile.arrayBuffer()).toString('utf8'))

    // Un extracto por pasarela: form key = extracto_<codigo>.
    const transacciones: TransaccionNormalizada[] = []
    const sinParser: string[] = []
    for (const [key, val] of form.entries()) {
      if (!key.startsWith('extracto_') || !(val instanceof File)) continue
      const codigo = key.slice('extracto_'.length)
      const parser = PARSERS[codigo]
      if (!parser) {
        sinParser.push(codigo)
        continue
      }
      transacciones.push(...parser(Buffer.from(await val.arrayBuffer())))
    }

    // Limpia legacy sin período + reemplaza el bloque del mes.
    await limpiarSinPeriodo(tenantId)
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

    // Concilia cada pasarela conciliable del cliente.
    const provs = await adminDb.mapeoMedioPago.findMany({
      where: { tenantId, proveedor: { not: null } },
      distinct: ['proveedor'],
      select: { proveedor: true },
    })
    for (const p of provs) if (p.proveedor) await conciliarOperativa(tenantId, p.proveedor)

    const resumen = await resumenMes(tenantId, periodo)
    return NextResponse.json({ ...resumen, sinParser })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
