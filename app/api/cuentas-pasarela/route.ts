// Cuentas de pasarela de un cliente = el lugar ÚNICO de credenciales.
// Una fila por comercio/cuenta (Clover usa token por-MID). La credencial se
// guarda CIFRADA (AES-256-GCM) y nunca se devuelve.
//   GET    ?tenant= → cuentas del cliente (sin credencial) + catálogo de pasarelas
//   POST   { tenant, proveedor, modo, identificador?, descripcion?, credencial? }
//          → upsert por (tenant, proveedor, identificador). credencial vacía = conservar.
//   DELETE { tenant, id } → baja
import { NextResponse } from 'next/server'
import { adminDb } from '@/src/db/admin'
import { resolverTenant } from '@/src/auth/session'
import { cifrar } from '@/src/config/crypto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url)
    const ctx = await resolverTenant(url.searchParams.get('tenant'))
    if (!ctx) return NextResponse.json({ error: 'No se pudo resolver el cliente.' }, { status: 400 })
    const { tenantId } = ctx

    const [cuentas, pasarelas, establecimientos, mediosCobros, mediosMapeo, mediosTerminales] = await Promise.all([
      adminDb.cuentaPasarela.findMany({
        where: { tenantId },
        orderBy: [{ proveedor: 'asc' }, { identificador: 'asc' }],
        select: {
          id: true,
          proveedor: true,
          modo: true,
          identificador: true,
          descripcion: true,
          activo: true,
          credencialEnc: true,
          establecimientoId: true,
          terminal: true,
          establecimiento: { select: { nombre: true, codTienda: true } },
        },
      }),
      adminDb.pasarela.findMany({ orderBy: { orden: 'asc' }, select: { codigo: true, nombre: true } }),
      adminDb.establecimiento.findMany({
        where: { tenantId },
        orderBy: [{ codTienda: 'asc' }, { nombre: 'asc' }],
        select: { id: true, nombre: true, codTienda: true },
      }),
      // Medios de pago vistos en las ventas HIOPOS del cliente (para elegir cuáles mapean a cada pasarela)
      adminDb.cobro.groupBy({ by: ['codMedioPago', 'medioPago'], where: { tenantId, codMedioPago: { not: null } } }),
      adminDb.mapeoMedioPago.findMany({ where: { tenantId }, select: { codMedioPago: true, medioPago: true, proveedor: true } }),
      // Terminales (Cód. Terminal + Alias) por tienda, vistas en las ventas.
      adminDb.cobro.groupBy({ by: ['establecimientoId', 'codTerminal', 'aliasTerminal'], where: { tenantId, codTerminal: { not: null } } }),
    ])

    // Terminales por establecimiento
    const termMap = new Map<string, { cod: string; alias: string | null }[]>()
    for (const t of mediosTerminales) {
      if (!t.establecimientoId || !t.codTerminal) continue
      const arr = termMap.get(t.establecimientoId) ?? []
      if (!arr.some((x) => x.cod === t.codTerminal)) arr.push({ cod: t.codTerminal, alias: t.aliasTerminal })
      termMap.set(t.establecimientoId, arr)
    }

    // Unión de medios (de ventas + de mapeos ya hechos) → código, nombre, proveedor actual.
    const mediosMap = new Map<string, { codMedioPago: string; medioPago: string; proveedor: string | null }>()
    for (const m of mediosCobros) {
      if (m.codMedioPago) mediosMap.set(m.codMedioPago, { codMedioPago: m.codMedioPago, medioPago: m.medioPago, proveedor: null })
    }
    for (const m of mediosMapeo) {
      const prev = mediosMap.get(m.codMedioPago)
      mediosMap.set(m.codMedioPago, { codMedioPago: m.codMedioPago, medioPago: prev?.medioPago ?? m.medioPago, proveedor: m.proveedor })
    }
    const medios = [...mediosMap.values()].sort((a, b) => a.codMedioPago.localeCompare(b.codMedioPago, undefined, { numeric: true }))

    return NextResponse.json({
      tenant: ctx.nombre,
      pasarelas,
      establecimientos: establecimientos.map((e) => ({ ...e, terminales: termMap.get(e.id) ?? [] })),
      medios,
      cuentas: cuentas.map((c) => ({
        id: c.id,
        proveedor: c.proveedor,
        modo: c.modo,
        identificador: c.identificador,
        descripcion: c.descripcion,
        activo: c.activo,
        tieneCred: !!c.credencialEnc,
        establecimientoId: c.establecimientoId,
        establecimientoNombre: c.establecimiento?.nombre ?? null,
        terminal: c.terminal,
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
      id?: string // si viene, se edita esa cuenta por id (permite cambiar el identificador/MID)
      proveedor?: string
      modo?: 'MANUAL' | 'API'
      identificador?: string
      descripcion?: string
      credencial?: string
      establecimientoId?: string | null
      terminal?: string
      medios?: string[] // códigos de Medio Pago (HIOPOS) que mapean a esta pasarela
    }
    const ctx = await resolverTenant(b.tenant)
    if (!ctx) return NextResponse.json({ error: 'No se pudo resolver el cliente.' }, { status: 400 })
    const { tenantId } = ctx

    const proveedor = (b.proveedor ?? '').trim()
    if (!proveedor) return NextResponse.json({ error: 'Elegí la pasarela.' }, { status: 400 })
    const modo: 'MANUAL' | 'API' = b.modo === 'API' ? 'API' : 'MANUAL'
    const identificador = (b.identificador ?? '').trim()
    if (modo === 'API' && !identificador)
      return NextResponse.json({ error: 'En modo API indicá el identificador de la cuenta (ej. MID de Clover).' }, { status: 400 })

    const editId = (b.id ?? '').trim() || null
    // La cuenta que se edita (si viene id) — valida pertenencia al cliente.
    const actual = editId
      ? await adminDb.cuentaPasarela.findFirst({ where: { id: editId, tenantId }, select: { id: true, credencialEnc: true } })
      : null
    if (editId && !actual) return NextResponse.json({ error: 'Cuenta no encontrada.' }, { status: 404 })

    const cred = (b.credencial ?? '').trim()
    if (modo === 'API' && cred === '') {
      // sin credencial: válido solo si la cuenta ya tenía una (editando otros campos)
      const ya = editId
        ? actual
        : await adminDb.cuentaPasarela.findUnique({
            where: { tenantId_proveedor_identificador: { tenantId, proveedor, identificador } },
            select: { credencialEnc: true },
          })
      if (!ya?.credencialEnc)
        return NextResponse.json({ error: 'En modo API cargá el token/credencial de la cuenta.' }, { status: 400 })
    }

    // Mapeo opcional del dispositivo: terminal requiere establecimiento.
    const establecimientoId = (b.establecimientoId ?? '') || null
    const terminal = (b.terminal ?? '').trim() || null
    if (terminal && !establecimientoId)
      return NextResponse.json({ error: 'Para mapear una terminal, elegí primero el establecimiento.' }, { status: 400 })
    if (establecimientoId) {
      const e = await adminDb.establecimiento.findFirst({ where: { id: establecimientoId, tenantId }, select: { id: true } })
      if (!e) return NextResponse.json({ error: 'El establecimiento no pertenece a este cliente.' }, { status: 400 })
    }

    const credencialEnc = cred ? cifrar(cred) : undefined
    const base = {
      modo,
      descripcion: (b.descripcion ?? '').trim() || null,
      establecimientoId,
      terminal,
      activo: true,
      ...(credencialEnc ? { credencialEnc } : {}),
    }

    // Chequeo de unicidad (tenant, proveedor, identificador) para no colisionar
    // con OTRA cuenta (al crear, o al editar cambiando proveedor/identificador).
    const colision = await adminDb.cuentaPasarela.findUnique({
      where: { tenantId_proveedor_identificador: { tenantId, proveedor, identificador } },
      select: { id: true },
    })
    if (colision && colision.id !== editId)
      return NextResponse.json({ error: `Ya existe una cuenta ${proveedor} con el identificador "${identificador || '(vacío)'}".` }, { status: 409 })

    if (editId) {
      await adminDb.cuentaPasarela.update({ where: { id: editId }, data: { proveedor, identificador, ...base } })
    } else {
      await adminDb.cuentaPasarela.create({ data: { tenantId, proveedor, identificador, ...base, credencialEnc: credencialEnc ?? null } })
    }

    // Medios de pago (HIOPOS) → esta pasarela. El mapeo es por (tenant, código):
    // los listados quedan en este proveedor; los que estaban en este proveedor y
    // ya no vienen, se desmapean (proveedor = null).
    if (Array.isArray(b.medios)) {
      const codigos = [...new Set(b.medios.map((c) => (c ?? '').trim()).filter(Boolean))]
      // Nombres de medio desde las ventas (para el upsert).
      const nombres = new Map<string, string>()
      const vistos = await adminDb.cobro.groupBy({ by: ['codMedioPago', 'medioPago'], where: { tenantId, codMedioPago: { in: codigos } } })
      for (const v of vistos) if (v.codMedioPago) nombres.set(v.codMedioPago, v.medioPago)
      for (const cod of codigos) {
        await adminDb.mapeoMedioPago.upsert({
          where: { tenantId_codMedioPago: { tenantId, codMedioPago: cod } },
          create: { tenantId, codMedioPago: cod, medioPago: nombres.get(cod) ?? cod, proveedor },
          update: { proveedor, ...(nombres.has(cod) ? { medioPago: nombres.get(cod) as string } : {}) },
        })
      }
      await adminDb.mapeoMedioPago.updateMany({
        where: { tenantId, proveedor, codMedioPago: { notIn: codigos.length ? codigos : ['\u0000'] } },
        data: { proveedor: null },
      })
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }
}

export async function DELETE(req: Request): Promise<Response> {
  try {
    const b = (await req.json()) as { tenant?: string; id?: string }
    const ctx = await resolverTenant(b.tenant)
    if (!ctx) return NextResponse.json({ error: 'No se pudo resolver el cliente.' }, { status: 400 })
    const id = (b.id ?? '').trim()
    if (!id) return NextResponse.json({ error: 'Falta el id.' }, { status: 400 })
    // Scope defensivo por tenant (adminDb no aplica RLS).
    const cuenta = await adminDb.cuentaPasarela.findFirst({ where: { id, tenantId: ctx.tenantId }, select: { id: true } })
    if (!cuenta) return NextResponse.json({ error: 'Cuenta no encontrada.' }, { status: 404 })
    await adminDb.cuentaPasarela.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }
}
