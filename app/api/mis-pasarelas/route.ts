// Config de pasarelas del cliente (tenant de la sesión).
//   GET  → catálogo activo cruzado con la config del cliente (alias, modo, cred).
//   POST { pasarelaCodigo, alias, modo, activo?, apiCred? } → upsert.
// La credencial de API se guarda cifrada y nunca se devuelve.
import { NextResponse } from 'next/server'
import { adminDb } from '@/src/db/admin'
import { resolverTenant } from '@/src/auth/session'
import { cifrar } from '@/src/config/crypto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(): Promise<Response> {
  try {
    const ctx = await resolverTenant()
    if (!ctx) return NextResponse.json({ error: 'No se pudo resolver el cliente.' }, { status: 400 })

    const [catalogo, config] = await Promise.all([
      adminDb.pasarela.findMany({
        where: { activo: true },
        orderBy: { orden: 'asc' },
        select: { codigo: true, nombre: true, tipoIngesta: true },
      }),
      adminDb.tenantPasarela.findMany({ where: { tenantId: ctx.tenantId } }),
    ])
    const porCodigo = new Map(config.map((c) => [c.pasarelaCodigo, c]))

    return NextResponse.json({
      pasarelas: catalogo.map((p) => {
        const c = porCodigo.get(p.codigo)
        return {
          codigo: p.codigo,
          nombre: p.nombre,
          tipoIngesta: p.tipoIngesta,
          habilitada: !!c && c.activo,
          alias: c?.alias ?? p.nombre,
          modo: c?.modo ?? 'MANUAL',
          tieneCred: !!c?.apiCredEnc,
        }
      }),
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

export async function POST(req: Request): Promise<Response> {
  try {
    const b = (await req.json()) as {
      pasarelaCodigo?: string
      alias?: string
      modo?: string
      activo?: boolean
      apiCred?: string
    }
    const ctx = await resolverTenant()
    if (!ctx) return NextResponse.json({ error: 'No se pudo resolver el cliente.' }, { status: 400 })

    const codigo = (b.pasarelaCodigo ?? '').trim()
    const alias = (b.alias ?? '').trim()
    const modo = b.modo === 'API' ? 'API' : 'MANUAL'
    if (!codigo || !alias) return NextResponse.json({ error: 'Faltan pasarela y alias.' }, { status: 400 })

    const pasarela = await adminDb.pasarela.findUnique({ where: { codigo }, select: { activo: true } })
    if (!pasarela || !pasarela.activo)
      return NextResponse.json({ error: `Pasarela inválida o inactiva: ${codigo}.` }, { status: 400 })

    const cred = (b.apiCred ?? '').trim()
    const datos = {
      alias,
      modo: modo as 'MANUAL' | 'API',
      activo: b.activo ?? true,
      // MANUAL → sin credencial; API con credencial nueva → cifrar; API sin
      // credencial nueva → conservar la guardada.
      ...(modo === 'MANUAL' ? { apiCredEnc: null } : cred ? { apiCredEnc: cifrar(cred) } : {}),
    }

    await adminDb.tenantPasarela.upsert({
      where: { tenantId_pasarelaCodigo: { tenantId: ctx.tenantId, pasarelaCodigo: codigo } },
      create: { tenantId: ctx.tenantId, pasarelaCodigo: codigo, ...datos },
      update: datos,
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }
}
