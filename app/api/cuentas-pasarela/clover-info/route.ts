// Probar conexión con Clover: con el MID + token (nuevos, del formulario) o con
// una cuenta ya guardada (cuentaId → se descifra el token), devuelve el nombre
// del comercio y la lista de dispositivos. Solo SUPERADMIN. No persiste nada.
import { NextResponse } from 'next/server'
import { adminDb } from '@/src/db/admin'
import { sesionActual, resolverTenant } from '@/src/auth/session'
import { descifrar } from '@/src/config/crypto'
import { verificarComercioClover } from '@/src/ingesta/clover'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CLOVER_BASE_AR = 'https://api.la.clover.com'

export async function POST(req: Request): Promise<Response> {
  try {
    const s = await sesionActual()
    if (s?.rol !== 'SUPERADMIN') return NextResponse.json({ error: 'Requiere super admin.' }, { status: 403 })

    const b = (await req.json()) as { tenant?: string; cuentaId?: string; mid?: string; token?: string }
    let mid = (b.mid ?? '').trim()
    let token = (b.token ?? '').trim()

    // Cuenta guardada: tomamos su MID y, si no vino token nuevo, el guardado.
    if (b.cuentaId) {
      const ctx = await resolverTenant(b.tenant)
      if (!ctx) return NextResponse.json({ error: 'No se pudo resolver el cliente.' }, { status: 400 })
      const cuenta = await adminDb.cuentaPasarela.findFirst({
        where: { id: b.cuentaId, tenantId: ctx.tenantId },
        select: { identificador: true, credencialEnc: true },
      })
      if (!cuenta) return NextResponse.json({ error: 'Cuenta no encontrada.' }, { status: 404 })
      if (!mid) mid = cuenta.identificador
      if (!token) {
        if (!cuenta.credencialEnc) return NextResponse.json({ error: 'La cuenta no tiene token guardado. Pegá uno para probar.' }, { status: 400 })
        token = descifrar(cuenta.credencialEnc)
      }
    }

    if (!mid || !token) return NextResponse.json({ error: 'Faltan el MID y/o el token.' }, { status: 400 })

    const pasarela = await adminDb.pasarela.findUnique({ where: { codigo: 'CLOVER' }, select: { urlApi: true } })
    const baseUrl = pasarela?.urlApi?.trim() || CLOVER_BASE_AR
    const info = await verificarComercioClover({ baseUrl, merchantId: mid, token })
    return NextResponse.json(info)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }
}
