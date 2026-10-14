'use client'

// Flujo de acreditaciones: proyección de cuándo y cuánto neto se acredita al
// banco, sobre las ventas del mes, según las reglas de liquidación del cliente.
import { useEffect, useState } from 'react'
import { useSesion } from '@/components/useSesion'

interface DiaAcred { fecha: string; n: number; bruto: number; comision: number; neto: number }
interface TipoAcred { tipo: string; n: number; bruto: number; comision: number; neto: number }
interface Proyeccion {
  porDia: DiaAcred[]
  porTipo: TipoAcred[]
  totales: { n: number; bruto: number; comision: number; neto: number }
  sinRegla: number
}

const mesActual = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
function mover(p: string, delta: number): string {
  const [y, m] = p.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const mesLabel = (p: string) => {
  const [y, m] = p.split('-').map(Number)
  return `${MESES[m - 1]} ${y}`
}
const moneda = (n: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)
const TIPO_LABEL: Record<string, string> = { DEBITO: 'Débito', CREDITO: 'Crédito', QR: 'QR / billeteras', PREPAGA: 'Prepaga', OTRO: 'Otro', DEVOLUCION: 'Devolución' }
const fmtFecha = (s: string) => {
  const [y, m, d] = s.split('-')
  return `${d}/${m}/${y}`
}

export default function AcreditacionesPage() {
  const sesion = useSesion()
  const esCliente = sesion?.rol === 'CLIENTE'
  const [clientes, setClientes] = useState<string[]>([])
  const [tenant, setTenant] = useState('')
  const [periodo, setPeriodo] = useState(mesActual())
  const [proy, setProy] = useState<Proyeccion | null>(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!sesion) return
    if (sesion.rol === 'CLIENTE') {
      if (sesion.tenantNombre) setTenant(sesion.tenantNombre)
    } else {
      fetch('/api/admin/clientes')
        .then((r) => r.json())
        .then((j) => setClientes((j.clientes ?? []).map((c: { nombre: string }) => c.nombre)))
        .catch(() => {})
    }
  }, [sesion])

  useEffect(() => {
    if (!tenant) {
      setProy(null)
      return
    }
    setCargando(true)
    setError(null)
    fetch(`/api/acreditaciones?tenant=${encodeURIComponent(tenant)}&periodo=${periodo}`)
      .then(async (r) => {
        const j = await r.json()
        if (!r.ok) throw new Error(j.error ?? 'Error al cargar')
        setProy(j.proyeccion)
      })
      .catch((e) => {
        setError((e as Error).message)
        setProy(null)
      })
      .finally(() => setCargando(false))
  }, [tenant, periodo])

  const t = proy?.totales
  return (
    <div className="mx-auto max-w-5xl">
      <div className="pc-panel mb-4 flex flex-wrap items-center gap-2 p-3">
        {!esCliente && (
          <select value={tenant} onChange={(e) => setTenant(e.target.value)} className="pc-input px-2 py-1.5 text-[12px]" style={{ minWidth: 150 }}>
            <option value="">Elegí un cliente…</option>
            {clientes.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        )}
        <div className="flex items-center gap-1">
          <button onClick={() => setPeriodo(mover(periodo, -1))} className="rounded-md border px-2 py-1 text-[12px]" style={{ borderColor: 'var(--border2)' }}>◀</button>
          <span className="min-w-[72px] text-center text-[12.5px] font-semibold">{mesLabel(periodo)}</span>
          <button onClick={() => setPeriodo(mover(periodo, 1))} className="rounded-md border px-2 py-1 text-[12px]" style={{ borderColor: 'var(--border2)' }}>▶</button>
        </div>
        <div className="ml-auto text-[11px]" style={{ color: 'var(--muted)' }}>Proyección sobre las ventas del mes</div>
      </div>

      {error && <div className="pc-error mb-4 px-4 py-2.5 text-[12px]">{error}</div>}

      {!tenant ? (
        <div className="pc-panel p-6 text-center text-[12px]" style={{ color: 'var(--muted)' }}>Elegí un cliente para ver sus acreditaciones.</div>
      ) : cargando ? (
        <div className="pc-panel p-6 text-center text-[12px]" style={{ color: 'var(--muted)' }}>Calculando…</div>
      ) : proy && t ? (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Kpi label="Ventas" valor={String(t.n)} />
            <Kpi label="Bruto" valor={moneda(t.bruto)} />
            <Kpi label="Comisión" valor={moneda(t.comision)} color="var(--red)" />
            <Kpi label="Neto a acreditar" valor={moneda(t.neto)} color="var(--green)" />
          </div>

          {proy.sinRegla > 0 && (
            <div className="pc-error mb-4 px-4 py-2 text-[12px]">
              ⚠ {proy.sinRegla} venta(s) sin regla de liquidación cargada (se proyectan con plazo 0 y comisión 0). Cargá las reglas en Clientes → Pasarelas → 💲 Reglas de liquidación.
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <div className="pc-panel overflow-hidden">
              <div className="border-b px-4 py-2 text-[12px] font-semibold" style={{ borderColor: 'var(--border)' }}>Flujo por fecha de acreditación</div>
              <div className="overflow-x-auto">
                <table className="pc-tabla w-full text-[11.5px]">
                  <thead>
                    <tr className="pc-thead text-[9px] uppercase tracking-wide">
                      <th className="px-2.5 py-2 text-left">Fecha</th>
                      <th className="px-2.5 py-2 text-center">Ventas</th>
                      <th className="px-2.5 py-2 text-right">Bruto</th>
                      <th className="px-2.5 py-2 text-right">Neto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {proy.porDia.length === 0 && (
                      <tr><td colSpan={4} className="px-2.5 py-5 text-center" style={{ color: 'var(--muted)' }}>Sin ventas en el mes.</td></tr>
                    )}
                    {proy.porDia.map((d, i) => (
                      <tr key={d.fecha} style={{ borderTop: '1px solid var(--border)', background: i % 2 ? 'var(--surface2)' : 'transparent' }}>
                        <td className="px-2.5 py-1.5 font-semibold">{fmtFecha(d.fecha)}</td>
                        <td className="px-2.5 py-1.5 text-center">{d.n}</td>
                        <td className="px-2.5 py-1.5 text-right font-mono" style={{ color: 'var(--muted2)' }}>{moneda(d.bruto)}</td>
                        <td className="px-2.5 py-1.5 text-right font-mono font-semibold" style={{ color: 'var(--green)' }}>{moneda(d.neto)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="pc-panel overflow-hidden">
              <div className="border-b px-4 py-2 text-[12px] font-semibold" style={{ borderColor: 'var(--border)' }}>Por tipo de cobro</div>
              <div className="overflow-x-auto">
                <table className="pc-tabla w-full text-[11.5px]">
                  <thead>
                    <tr className="pc-thead text-[9px] uppercase tracking-wide">
                      <th className="px-2.5 py-2 text-left">Tipo</th>
                      <th className="px-2.5 py-2 text-center">Ventas</th>
                      <th className="px-2.5 py-2 text-right">Bruto</th>
                      <th className="px-2.5 py-2 text-right">Comisión</th>
                      <th className="px-2.5 py-2 text-right">Neto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {proy.porTipo.length === 0 && (
                      <tr><td colSpan={5} className="px-2.5 py-5 text-center" style={{ color: 'var(--muted)' }}>—</td></tr>
                    )}
                    {proy.porTipo.map((x, i) => (
                      <tr key={x.tipo} style={{ borderTop: '1px solid var(--border)', background: i % 2 ? 'var(--surface2)' : 'transparent' }}>
                        <td className="px-2.5 py-1.5 font-semibold">{TIPO_LABEL[x.tipo] ?? x.tipo}</td>
                        <td className="px-2.5 py-1.5 text-center">{x.n}</td>
                        <td className="px-2.5 py-1.5 text-right font-mono" style={{ color: 'var(--muted2)' }}>{moneda(x.bruto)}</td>
                        <td className="px-2.5 py-1.5 text-right font-mono" style={{ color: 'var(--red)' }}>{moneda(x.comision)}</td>
                        <td className="px-2.5 py-1.5 text-right font-mono font-semibold" style={{ color: 'var(--green)' }}>{moneda(x.neto)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="mt-3 text-[10.5px]" style={{ color: 'var(--muted)' }}>
            Proyección estimada según las reglas cargadas (plazo + comisión por tipo). No contempla feriados ni retenciones impositivas. Se concilia contra la liquidación real cuando se cargue.
          </div>
        </>
      ) : null}
    </div>
  )
}

function Kpi({ label, valor, color }: { label: string; valor: string; color?: string }) {
  return (
    <div className="pc-panel px-3 py-2">
      <div className="text-[9.5px] uppercase tracking-wide" style={{ color: 'var(--muted)' }}>{label}</div>
      <div className="text-[17px] font-bold" style={{ color: color ?? 'var(--text)' }}>{valor}</div>
    </div>
  )
}
