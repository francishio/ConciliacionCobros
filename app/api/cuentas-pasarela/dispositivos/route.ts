// Dispositivos de una cuenta de pasarela (Clover): listar, releer de la API y
// mapear cada uno a tienda + terminal de HIOPOS. Solo SUPERADMIN.
//   GET  ?tenant=&cuentaId=            → dispositivos guardados
//   POST { action:'sync', tenant, cuentaId }  → relee Clover y upsertea (auto-sugiere tienda)
//   POST { action:'map', tenant, id, establecimientoId, codTerminal } → guarda el mapeo
import { NextResponse } from 'next/server'
import { adminDb } from '@/src/db/admin'
import { sesionActual, resolverTenant } from '@/src/auth/session'
import { descifrar } from '@/src/config/crypto'
import { verificarComercioClover } from '@/src/ingesta/clover'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CLOVER_BASE_AR = 'https://api.la.clover.com'

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

async function ctxFrom(tenantParam: string | null | undefined) {
  const s = await sesionActual()
  if (s?.rol !== 'SUPERADMIN') return { error: 'Requiere super admin.', status: 403 as const }
  const ctx = await resolverTenant(tenantParam)
  if (!ctx) return { error: 'No se pudo resolver el cliente.', status: 400 as const }
  return { ctx }
}

async function listar(tenantId: string, cuentaId: string) {
  const devs = await adminDb.dispositivoPasarela.findMany({
    where: { tenantId, cuentaPasarelaId: cuentaId },
    orderBy: [{ deviceNombre: 'asc' }],
    select: {
      id: true, deviceId: true, deviceNombre: true, serial: true, modelo: true,
      establecimientoId: true, codTerminal: true,
      establecimiento: { select: { nombre: true } },
    },
  })
  return devs.map((d) => ({ ...d, establecimientoNombre: d.establecimiento?.nombre ?? null, establecimiento: undefined }))
}

export async function GET(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url)
    const g = await ctxFrom(url.searchParams.get('tenant'))
    if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })
    const cuentaId = (url.searchParams.get('cuentaId') ?? '').trim()
    if (!cuentaId) return NextResponse.json({ error: 'Falta cuentaId.' }, { status: 400 })
    return NextResponse.json({ dispositivos: await listar(g.ctx.tenantId, cuentaId) })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

export async function POST(req: Request): Promise<Response> {
  try {
    const b = (await req.json()) as {
      action?: string; tenant?: string; cuentaId?: string
      id?: string; establecimientoId?: string | null; codTerminal?: string | null
    }
    const g = await ctxFrom(b.tenant)
    if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })
    const tenantId = g.ctx.tenantId

    if (b.action === 'map') {
      if (!b.id) return NextResponse.json({ error: 'Falta el id del dispositivo.' }, { status: 400 })
      const dev = await adminDb.dispositivoPasarela.findFirst({ where: { id: b.id, tenantId }, select: { id: true } })
      if (!dev) return NextResponse.json({ error: 'Dispositivo no encontrado.' }, { status: 404 })
      const establecimientoId = (b.establecimientoId ?? '') || null
      const codTerminal = (b.codTerminal ?? '').trim() || null
      if (codTerminal && !establecimientoId)
        return NextResponse.json({ error: 'Para mapear una terminal, elegí primero la tienda.' }, { status: 400 })
      await adminDb.dispositivoPasarela.update({ where: { id: b.id }, data: { establecimientoId, codTerminal } })
      return NextResponse.json({ ok: true })
    }

    if (b.action === 'sync') {
      if (!b.cuentaId) return NextResponse.json({ error: 'Falta cuentaId.' }, { status: 400 })
      const cuenta = await adminDb.cuentaPasarela.findFirst({
        where: { id: b.cuentaId, tenantId, proveedor: 'CLOVER' },
        select: { identificador: true, credencialEnc: true },
      })
      if (!cuenta) return NextResponse.json({ error: 'Cuenta Clover no encontrada.' }, { status: 404 })
      if (!cuenta.credencialEnc) return NextResponse.json({ error: 'La cuenta no tiene token guardado.' }, { status: 400 })

      const pasarela = await adminDb.pasarela.findUnique({ where: { codigo: 'CLOVER' }, select: { urlApi: true } })
      const baseUrl = pasarela?.urlApi?.trim() || CLOVER_BASE_AR
      const info = await verificarComercioClover({ baseUrl, merchantId: cuenta.identificador, token: descifrar(cuenta.credencialEnc) })

      // Para auto-sugerir tienda: establecimientos del cliente por nombre normalizado.
      const estabs = await adminDb.establecimiento.findMany({ where: { tenantId }, select: { id: true, nombre: true, codTienda: true } })
      const sugerirEstab = (nombreDisp: string): string | null => {
        const n = norm(nombreDisp)
        const hits = estabs.filter((e) => e.nombre && n.includes(norm(e.nombre)))
        return hits.length === 1 ? hits[0].id : null
      }

      let nuevos = 0
      for (const d of info.dispositivos) {
        if (!d.id) continue
        const existe = await adminDb.dispositivoPasarela.findUnique({
          where: { cuentaPasarelaId_deviceId: { cuentaPasarelaId: b.cuentaId, deviceId: d.id } },
          select: { id: true },
        })
        if (existe) {
          // Actualiza info de display, NO pisa el mapeo que el usuario ya hizo.
          await adminDb.dispositivoPasarela.update({
            where: { id: existe.id },
            data: { deviceNombre: d.nombre, serial: d.serial, modelo: d.modelo },
          })
        } else {
          nuevos++
          await adminDb.dispositivoPasarela.create({
            data: {
              tenantId, cuentaPasarelaId: b.cuentaId, deviceId: d.id,
              deviceNombre: d.nombre, serial: d.serial, modelo: d.modelo,
              establecimientoId: d.nombre ? sugerirEstab(d.nombre) : null,
            },
          })
        }
      }
      return NextResponse.json({ dispositivos: await listar(tenantId, b.cuentaId), nuevos, comercio: info.nombre })
    }

    return NextResponse.json({ error: 'Acción inválida.' }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }
}
