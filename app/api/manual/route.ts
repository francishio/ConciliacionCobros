// API de conciliación manual (grilla doble).
//   GET  ?tenant=Rochino  → cobros sin conciliar + transacciones sueltas (Payway)
//   POST { tenant, cobroId, transaccionId } → confirma el match manual 1:1
//
// MVP: el tenant se resuelve por nombre (sin login todavía), igual que /conciliar.
import { NextResponse } from 'next/server'
import { adminDb } from '@/src/db/admin'
import { listarNoConciliados, confirmarMatchManual } from '@/src/matching/manual'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function tenantIdPorNombre(nombre: string): Promise<string | null> {
  const t = await adminDb.tenant.findFirst({ where: { nombre }, select: { id: true } })
  return t?.id ?? null
}

export async function GET(req: Request): Promise<Response> {
  try {
    const nombre = new URL(req.url).searchParams.get('tenant')?.trim() || 'Demo'
    const tenantId = await tenantIdPorNombre(nombre)
    if (!tenantId) return NextResponse.json({ error: `No existe el cliente "${nombre}".` }, { status: 404 })

    const { cobros, transacciones } = await listarNoConciliados(tenantId, 'PAYWAY')
    return NextResponse.json({
      tenant: nombre,
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
    const nombre = (body.tenant ?? '').trim() || 'Demo'
    if (!body.cobroId || !body.transaccionId)
      return NextResponse.json({ error: 'Faltan cobroId y/o transaccionId.' }, { status: 400 })

    const tenantId = await tenantIdPorNombre(nombre)
    if (!tenantId) return NextResponse.json({ error: `No existe el cliente "${nombre}".` }, { status: 404 })

    const r = await confirmarMatchManual(tenantId, body.cobroId, body.transaccionId)
    return NextResponse.json(r)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }
}
