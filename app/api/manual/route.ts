// API de conciliación manual (grilla doble).
//   GET  ?tenant=Rochino  → cobros sin conciliar + transacciones sueltas (Payway)
//   POST { tenant, cobroId, transaccionId } → confirma el match manual 1:1
//
// El tenant sale de la sesión (CLIENTE → el suyo; SUPERADMIN → ?tenant=).
import { NextResponse } from 'next/server'
import { resolverTenant } from '@/src/auth/session'
import { listarNoConciliados, confirmarMatchManual } from '@/src/matching/manual'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request): Promise<Response> {
  try {
    const ctx = await resolverTenant(new URL(req.url).searchParams.get('tenant'))
    if (!ctx) return NextResponse.json({ error: 'No se pudo resolver el cliente.' }, { status: 400 })

    const { cobros, transacciones } = await listarNoConciliados(ctx.tenantId, 'PAYWAY')
    return NextResponse.json({
      tenant: ctx.nombre,
      cobros: cobros.map((c) => ({
        id: c.id,
        fechaHora: c.fechaHora,
        importe: c.importe.toString(),
        medioPago: c.medioPago,
        marca: c.marca,
        ultimos4: c.ultimos4,
        tipoTarjeta: c.tipoTarjeta,
        cuotas: c.cuotas,
        estadoOp: c.estadoOp,
      })),
      transacciones: transacciones.map((t) => ({
        id: t.id,
        fechaHora: t.fechaHora,
        importe: t.importeBruto.toString(),
        marca: t.marca,
        ultimos4: t.ultimos4,
        tipoTarjeta: t.tipoTarjeta,
        cuotas: t.cuotas,
        codAutorizacion: t.codAutorizacion,
        idExterno: t.idExterno,
      })),
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

export async function POST(req: Request): Promise<Response> {
  try {
    const body = (await req.json()) as { tenant?: string; cobroId?: string; transaccionId?: string }
    if (!body.cobroId || !body.transaccionId)
      return NextResponse.json({ error: 'Faltan cobroId y/o transaccionId.' }, { status: 400 })

    const ctx = await resolverTenant(body.tenant)
    if (!ctx) return NextResponse.json({ error: 'No se pudo resolver el cliente.' }, { status: 400 })

    const r = await confirmarMatchManual(ctx.tenantId, body.cobroId, body.transaccionId)
    return NextResponse.json(r)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }
}
