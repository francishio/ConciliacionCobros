// POST /api/auth/hio  { t, s, e }  → ingreso desde el menú de HIOFFICE (SSO, sin contraseña).
//   t = $$$SESSION_TOKEN$$$, s = $$$SERVER_NAME$$$, e = $$$USER_EMAIL$$$ (los manda /hio, leídos del "#").
// Valida el token contra HIOFFICE, resuelve el companyId real, lo mapea al cliente (Tenant)
// por Tenant.hiofficeCompanyId y abre la sesión de la app (rol CLIENTE, via='hio').
// La cookie se fija en esta respuesta 200 (NO en un redirect: Netlify descarta cookies en redirects).
import { NextResponse } from 'next/server'
import { adminDb } from '@/src/db/admin'
import { firmarSesion, SESSION_COOKIE } from '@/src/auth/jwt'
import { cookieSesion } from '@/src/auth/cookies'
import { empresaDeTokenHio, ErrorHio } from '@/src/auth/hioffice'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request): Promise<Response> {
  const b = (await req.json().catch(() => ({}))) as { t?: string; s?: string; e?: string }
  try {
    const { companyId } = await empresaDeTokenHio({ token: String(b.t ?? ''), server: String(b.s ?? '') })

    // Empresa de HIOFFICE → cliente de Conciliación. Si no está vinculada, el admin
    // la vincula en Config → Clientes (el mensaje le da el companyId a cargar).
    const tenant = await adminDb.tenant.findUnique({
      where: { hiofficeCompanyId: companyId },
      select: { id: true, nombre: true },
    })
    if (!tenant) {
      return NextResponse.json(
        {
          ok: false,
          error: `Esta empresa de HIOFFICE (id ${companyId}) todavía no está vinculada a ningún cliente de Conciliación. Pedile al administrador que la vincule en Config → Clientes (campo "Empresa HIOFFICE").`,
        },
        { status: 403 },
      )
    }

    // Identidad estable de la sesión SSO: un usuario técnico por empresa (rol CLIENTE).
    // passwordHash inválido a propósito → nunca puede entrar por usuario/contraseña.
    const emailSso = `hioffice-${companyId}@sso.hioffice`
    let u = await adminDb.usuario.findUnique({ where: { email: emailSso }, select: { id: true, tenantId: true } })
    if (!u) {
      u = await adminDb.usuario.create({
        data: { email: emailSso, passwordHash: '!sso', nombre: 'HIOFFICE', rol: 'CLIENTE', tenantId: tenant.id, activo: true },
        select: { id: true, tenantId: true },
      })
    } else if (u.tenantId !== tenant.id) {
      // El mapeo de la empresa cambió de cliente: reasigná el usuario técnico.
      await adminDb.usuario.update({ where: { id: u.id }, data: { tenantId: tenant.id, activo: true } })
    }
    await adminDb.usuario.update({ where: { id: u.id }, data: { ultimoLogin: new Date() } }).catch(() => {})

    const token = await firmarSesion({
      userId: u.id,
      email: emailSso,
      rol: 'CLIENTE',
      tenantId: tenant.id,
      tenantNombre: tenant.nombre,
      via: 'hio',
    })
    const res = NextResponse.json({ ok: true, tenant: tenant.nombre })
    const c = cookieSesion(60 * 60 * 24 * 7)
    res.cookies.set(SESSION_COOKIE, token, c)
    return res
  } catch (e) {
    const msg = e instanceof ErrorHio ? e.message : `No se pudo validar la sesión de HIOFFICE: ${(e as Error).message}`
    return NextResponse.json({ ok: false, error: msg }, { status: 401 })
  }
}
