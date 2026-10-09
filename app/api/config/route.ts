// API de configuración por cliente: credenciales del Bridge Hioffice (HIOPOS) +
// el Exportation ID (ventas de medios integrados).
//   GET  ?tenant=Rochino   → config SIN la password (solo si está seteada)
//   POST { tenant, apiUser, apiPassword?, expIdVentas? }
//         → upsert. Si apiPassword viene vacío, se conserva la guardada.
//
// La password nunca se devuelve. Se guarda cifrada (AES-256-GCM). El tenant se
// crea si no existe (esta pantalla puede ser el punto de entrada de un cliente).
import { NextResponse } from 'next/server'
import { adminDb } from '@/src/db/admin'
import { cifrar } from '@/src/config/crypto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request): Promise<Response> {
  try {
    const nombre = new URL(req.url).searchParams.get('tenant')?.trim() || 'Demo'
    const tenant = await adminDb.tenant.findFirst({
      where: { nombre },
      select: { id: true, numeroBD: true, configHiopos: true },
    })
    const cfg = tenant?.configHiopos
    return NextResponse.json({
      tenant: nombre,
      existe: !!tenant,
      numeroBD: tenant?.numeroBD ?? '',
      apiUser: cfg?.apiUser ?? '',
      expIdVentas: cfg?.expIdVentas ?? '',
      tienePassword: !!cfg?.apiPasswordEnc,
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

export async function POST(req: Request): Promise<Response> {
  try {
    const b = (await req.json()) as {
      tenant?: string
      numeroBD?: string
      apiUser?: string
      apiPassword?: string
      expIdVentas?: string
    }
    const nombre = (b.tenant ?? '').trim() || 'Demo'
    const apiUser = (b.apiUser ?? '').trim()
    if (!apiUser) return NextResponse.json({ error: 'Falta el usuario del Bridge.' }, { status: 400 })

    const numeroBD = (b.numeroBD ?? '').trim() || null
    const tenant =
      (await adminDb.tenant.findFirst({ where: { nombre }, select: { id: true } })) ??
      (await adminDb.tenant.create({ data: { nombre }, select: { id: true } }))
    await adminDb.tenant.update({ where: { id: tenant.id }, data: { numeroBD } })

    const passwordEnc = (b.apiPassword ?? '').trim() ? cifrar((b.apiPassword ?? '').trim()) : undefined
    const datos = {
      apiUser,
      expIdVentas: (b.expIdVentas ?? '').trim() || null,
      ...(passwordEnc ? { apiPasswordEnc: passwordEnc } : {}),
    }

    await adminDb.configHiopos.upsert({
      where: { tenantId: tenant.id },
      create: { tenantId: tenant.id, ...datos },
      update: datos,
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }
}
