// Sincroniza el catálogo de tiendas desde HIOPOS usando la exportación de Tiendas
// configurada (Exportation ID + credenciales cifradas en ConfigHiopos).
//   POST { tenant } → login→launch→logout en el Bridge, parsea y hace upsert de
//   Establecimiento por Cód. Tienda. Devuelve cuántas sincronizó.
import { NextResponse } from 'next/server'
import { adminDb } from '@/src/db/admin'
import { resolverTenant } from '@/src/auth/session'
import { descifrar } from '@/src/config/crypto'
import { HioposBridgeClient } from '@/src/ingesta/hiopos/bridge'
import { parseTiendas } from '@/src/ingesta/hiopos/tiendas'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

function hoy(): string {
  return new Date().toISOString().slice(0, 10)
}

export async function POST(req: Request): Promise<Response> {
  try {
    const { tenant } = (await req.json()) as { tenant?: string }
    const ctx = await resolverTenant(tenant)
    if (!ctx) return NextResponse.json({ error: 'No se pudo resolver el cliente.' }, { status: 400 })

    const t = await adminDb.tenant.findUnique({ where: { id: ctx.tenantId }, select: { id: true, configHiopos: true } })
    if (!t) return NextResponse.json({ error: 'Cliente inexistente.' }, { status: 404 })
    const cfg = t.configHiopos
    if (!cfg?.apiUser || !cfg.apiPasswordEnc)
      return NextResponse.json({ error: 'Faltan las credenciales de HIOPOS (Configuración).' }, { status: 400 })
    if (!cfg.expIdTiendas)
      return NextResponse.json({ error: 'Falta el Exportation ID de Tiendas (Configuración).' }, { status: 400 })

    const client = new HioposBridgeClient({ email: cfg.apiUser, password: descifrar(cfg.apiPasswordEnc) })
    const docs = await client.exportar({ exportationId: cfg.expIdTiendas, startDate: '2000-01-01', endDate: hoy() })
    if (docs.length === 0)
      return NextResponse.json(
        { error: 'El Bridge no devolvió datos (suele ser intermitente). Probá de nuevo en unos segundos.' },
        { status: 502 },
      )

    const tiendas = parseTiendas(docs[0].contenido, docs[0].type)
    if (tiendas.length === 0)
      return NextResponse.json({ error: 'La exportación no trajo tiendas.' }, { status: 422 })

    for (const t2 of tiendas) {
      const datos = {
        nombre: t2.nombre,
        tipo: t2.tipo,
        nombreFiscal: t2.nombreFiscal,
        cuit: t2.cuit,
        direccion: t2.direccion,
        localidad: t2.localidad,
        provincia: t2.provincia,
        codigoPostal: t2.codigoPostal,
        grupo: t2.grupo,
        telefono: t2.telefono,
        email: t2.email,
        raw: t2.raw,
        activo: true,
      }
      await adminDb.establecimiento.upsert({
        where: { tenantId_codTienda: { tenantId: t.id, codTienda: t2.codTienda } },
        create: { tenantId: t.id, codTienda: t2.codTienda, ...datos },
        update: datos,
      })
    }

    return NextResponse.json({ sincronizadas: tiendas.length })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
