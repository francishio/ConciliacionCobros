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
import { ingestarTransaccionesBulk } from '@/src/ingesta/persistir'
import { reemplazarTransMes, reconciliarMes, limpiarSinPeriodo } from '@/src/carga/bloque'
import { cargarCobrosHiopos } from '@/src/carga/cobros'
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
    const url = new URL(req.url)
    const ctx = await resolverTenant(url.searchParams.get('tenant'))
    if (!ctx) return NextResponse.json({ error: 'No se pudo resolver el cliente.' }, { status: 400 })
    const { tenantId } = ctx
    const anio = Number(url.searchParams.get('anio')) || new Date().getFullYear()

    const [pasarelas, cobrosPorMes, transPorMes] = await Promise.all([
      pasarelasArchivo(tenantId),
      adminDb.cobro.groupBy({
        by: ['periodo'],
        where: { tenantId, periodo: { startsWith: `${anio}-` } },
        _count: { _all: true },
      }),
      adminDb.transaccion.groupBy({
        by: ['periodo', 'proveedor'],
        where: { tenantId, periodo: { startsWith: `${anio}-` } },
        _count: { _all: true },
      }),
    ])

    const meses = Array.from({ length: 12 }, (_, i) => {
      const periodo = `${anio}-${String(i + 1).padStart(2, '0')}`
      const cobros = cobrosPorMes.find((c) => c.periodo === periodo)?._count._all ?? 0
      const porPasarela: Record<string, number> = {}
      for (const t of transPorMes) if (t.periodo === periodo) porPasarela[t.proveedor] = t._count._all
      return { periodo, cobros, porPasarela }
    })

    return NextResponse.json({ anio, pasarelas, meses })
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
    const hayHiopos = hioposFile instanceof File

    // Un extracto por pasarela (form key = extracto_<codigo>), agrupado por pasarela.
    const extractos = new Map<string, TransaccionNormalizada[]>()
    const sinParser: string[] = []
    for (const [key, val] of form.entries()) {
      if (!key.startsWith('extracto_') || !(val instanceof File)) continue
      const codigo = key.slice('extracto_'.length)
      const parser = PARSERS[codigo]
      if (!parser) {
        sinParser.push(codigo)
        continue
      }
      const txs = parser(Buffer.from(await val.arrayBuffer()))
      extractos.set(codigo, [...(extractos.get(codigo) ?? []), ...txs])
    }

    if (!hayHiopos && extractos.size === 0)
      return NextResponse.json({ error: 'Subí el HIOPOS y/o al menos un extracto.' }, { status: 400 })

    await limpiarSinPeriodo(tenantId)

    // Carga POR FUENTE: cada una reemplaza solo lo suyo del mes.
    if (hayHiopos) {
      const cobros = parseCobrosHiopos(Buffer.from(await hioposFile.arrayBuffer()).toString('utf8'))
      await cargarCobrosHiopos(tenantId, periodo, cobros)
    }
    for (const [codigo, txs] of extractos) {
      await reemplazarTransMes(tenantId, periodo, codigo)
      if (txs.length) await ingestarTransaccionesBulk(tenantId, txs, { periodo })
    }

    await reconciliarMes(tenantId, periodo)
    const resumen = await resumenMes(tenantId, periodo)
    return NextResponse.json({ ...resumen, sinParser })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
