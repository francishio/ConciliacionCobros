// Persistencia de ingesta: upsert idempotente al modelo canónico, con RLS.
// La clave (tenantId, proveedor, idExterno) garantiza que reprocesar un
// reporte actualice (no duplique). Siempre dentro de withTenant.
import type { Prisma } from '@prisma/client'
import { withTenant } from '../db/tenant'
import type { CobroNormalizado, TransaccionNormalizada } from './tipos'

export interface ResultadoIngesta {
  recibidas: number
  persistidas: number
}

// Resuelve (upsert) un Establecimiento por cada Cód. Tienda distinto y devuelve
// el mapa codTienda → establecimientoId, para anclar los cobros a su tienda.
async function resolverEstablecimientos(
  tenantId: string,
  cobros: CobroNormalizado[],
): Promise<Map<string, string>> {
  const nombres = new Map<string, string>()
  for (const c of cobros) {
    if (c.codTienda && !nombres.has(c.codTienda)) nombres.set(c.codTienda, c.tienda ?? c.codTienda)
  }
  const map = new Map<string, string>()
  if (nombres.size === 0) return map
  await withTenant(tenantId, async (tx) => {
    for (const [cod, nombre] of nombres) {
      const e = await tx.establecimiento.upsert({
        where: { tenantId_codTienda: { tenantId, codTienda: cod } },
        create: { tenantId, codTienda: cod, nombre },
        update: {}, // no pisar el nombre si ya existe
        select: { id: true },
      })
      map.set(cod, e.id)
    }
  })
  return map
}

// Mapa (proveedor|terminal) → establecimientoId, según los códigos que el cliente
// mapeó en Establecimientos. Sirve para anclar cada transacción de pasarela a su
// tienda (y así conciliar solo dentro de la misma terminal).
async function resolverEstabPasarela(tenantId: string): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  await withTenant(tenantId, async (tx) => {
    const mapeos = await tx.mapeoEstablecimientoPasarela.findMany({
      select: { proveedor: true, codigoExterno: true, establecimientoId: true },
    })
    for (const m of mapeos) map.set(`${m.proveedor}|${m.codigoExterno}`, m.establecimientoId)
  })
  return map
}

// Upsert idempotente de cobros (lado HIOPOS) por (tenantId, origenRef).
export async function ingestarCobros(
  tenantId: string,
  cobros: CobroNormalizado[],
): Promise<ResultadoIngesta> {
  const estabs = await resolverEstablecimientos(tenantId, cobros)
  return withTenant(tenantId, async (tx) => {
    let persistidas = 0
    for (const c of cobros) {
      const datos = {
        establecimientoId: c.codTienda ? estabs.get(c.codTienda) ?? null : null,
        hioposTicketId: c.hioposTicketId,
        medioPago: c.medioPago,
        codMedioPago: c.codMedioPago,
        marca: c.marca,
        tipoTarjeta: c.tipoTarjeta,
        importe: c.importe,
        cuotas: c.cuotas,
        fechaHora: c.fechaHora,
        codAutorizacion: c.codAutorizacion,
        ultimos4: c.ultimos4,
        raw: c.raw as Prisma.InputJsonValue,
      }
      await tx.cobro.upsert({
        where: { tenantId_origenRef: { tenantId, origenRef: c.origenRef } },
        create: { tenantId, origenRef: c.origenRef, ...datos },
        update: datos,
      })
      persistidas++
    }
    return { recibidas: cobros.length, persistidas }
  })
}

export async function ingestarTransacciones(
  tenantId: string,
  registros: TransaccionNormalizada[],
): Promise<ResultadoIngesta> {
  return withTenant(tenantId, async (tx) => {
    let persistidas = 0
    for (const r of registros) {
      await tx.transaccion.upsert({
        where: {
          tenantId_proveedor_idExterno: {
            tenantId,
            proveedor: r.proveedor,
            idExterno: r.idExterno,
          },
        },
        create: {
          tenantId,
          proveedor: r.proveedor,
          idExterno: r.idExterno,
          importeBruto: r.importeBruto,
          cuotas: r.cuotas,
          externalReference: r.externalReference,
          codAutorizacion: r.codAutorizacion,
          marca: r.marca ?? null,
          ultimos4: r.ultimos4 ?? null,
          tipoTarjeta: r.tipoTarjeta ?? null,
          estado: r.estado,
          fechaHora: r.fechaHora,
          raw: r.raw as Prisma.InputJsonValue,
        },
        update: {
          importeBruto: r.importeBruto,
          cuotas: r.cuotas,
          externalReference: r.externalReference,
          codAutorizacion: r.codAutorizacion,
          marca: r.marca ?? null,
          ultimos4: r.ultimos4 ?? null,
          tipoTarjeta: r.tipoTarjeta ?? null,
          estado: r.estado,
          fechaHora: r.fechaHora,
          raw: r.raw as Prisma.InputJsonValue,
        },
      })
      persistidas++
    }
    return { recibidas: registros.length, persistidas }
  })
}

// Carga masiva de transacciones en lotes (para reportes grandes, ej. Payway con
// miles de filas). Usa createMany + skipDuplicates (1 query por lote, idempotente
// por (tenantId, proveedor, idExterno)). Cada lote va en su propia transacción
// para no exceder el timeout. Apto para fuentes inmutables (transacciones ya
// presentadas); para datos que mutan (ej. estado MP) usar ingestarTransacciones.
export async function ingestarTransaccionesBulk(
  tenantId: string,
  registros: TransaccionNormalizada[],
  opciones?: { tamanoLote?: number; periodo?: string | null },
): Promise<ResultadoIngesta> {
  const tamano = opciones?.tamanoLote ?? 1000
  const periodo = opciones?.periodo ?? null
  const estabPas = await resolverEstabPasarela(tenantId)
  let persistidas = 0
  for (let i = 0; i < registros.length; i += tamano) {
    const lote = registros.slice(i, i + tamano)
    const res = await withTenant(tenantId, (tx) =>
      tx.transaccion.createMany({
        data: lote.map((r) => ({
          tenantId,
          proveedor: r.proveedor,
          idExterno: r.idExterno,
          importeBruto: r.importeBruto,
          cuotas: r.cuotas,
          externalReference: r.externalReference,
          codAutorizacion: r.codAutorizacion,
          terminal: r.terminal ?? null,
          establecimientoId: r.terminal ? estabPas.get(`${r.proveedor}|${r.terminal}`) ?? null : null,
          marca: r.marca ?? null,
          ultimos4: r.ultimos4 ?? null,
          tipoTarjeta: r.tipoTarjeta ?? null,
          estado: r.estado,
          fechaHora: r.fechaHora,
          periodo,
          raw: r.raw as Prisma.InputJsonValue,
        })),
        skipDuplicates: true,
      }),
    )
    persistidas += res.count
  }
  return { recibidas: registros.length, persistidas }
}

// Carga masiva de cobros (HIOPOS) en lotes — mismo enfoque que transacciones.
export async function ingestarCobrosBulk(
  tenantId: string,
  cobros: CobroNormalizado[],
  opciones?: { tamanoLote?: number; periodo?: string | null },
): Promise<ResultadoIngesta> {
  const tamano = opciones?.tamanoLote ?? 1000
  const periodo = opciones?.periodo ?? null
  const estabs = await resolverEstablecimientos(tenantId, cobros)
  let persistidas = 0
  for (let i = 0; i < cobros.length; i += tamano) {
    const lote = cobros.slice(i, i + tamano)
    const res = await withTenant(tenantId, (tx) =>
      tx.cobro.createMany({
        data: lote.map((c) => ({
          tenantId,
          establecimientoId: c.codTienda ? estabs.get(c.codTienda) ?? null : null,
          origenRef: c.origenRef,
          hioposTicketId: c.hioposTicketId,
          medioPago: c.medioPago,
          codMedioPago: c.codMedioPago,
          marca: c.marca,
          tipoTarjeta: c.tipoTarjeta,
          importe: c.importe,
          cuotas: c.cuotas,
          fechaHora: c.fechaHora,
          codAutorizacion: c.codAutorizacion,
          ultimos4: c.ultimos4,
          periodo,
          raw: c.raw as Prisma.InputJsonValue,
        })),
        skipDuplicates: true,
      }),
    )
    persistidas += res.count
  }
  return { recibidas: cobros.length, persistidas }
}
