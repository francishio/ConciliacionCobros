'use client'

// Flujo de acreditaciones: proyección SEMANAL (semanas en columnas, tipo de cobro
// en filas) de cuánto neto se acredita al banco, según las reglas de liquidación.
import { useEffect, useState } from 'react'
import { useSesion } from '@/components/useSesion'
import { TIPO_COBRO_LABEL } from '@/src/acreditaciones/tipo-cobro'
import { ReglasLiquidacion } from '@/components/ReglasLiquidacion'

interface Celda { n: number; bruto: number; comision: number; neto: number }
interface Semana { inicio: string; fin: string; label: string }
interface FilaTipo { tipo: string; total: Celda; porSemana: Record<string, Celda> }
interface Proyeccion {
  semanas: Semana[]
  filas: FilaTipo[]
  totalPorSemana: Record<string, Celda>
  total: Celda
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

export default function AcreditacionesPage() {
  const sesion = useSesion()
  const esCliente = sesion?.rol === 'CLIENTE'
  const [clientes, setClientes] = useState<string[]>([])
  const [tenant, setTenant] = useState('')
  const [periodo, setPeriodo] = useState(mesActual())
  const [proy, setProy] = useState<Proyeccion | null>(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [verReglas, setVerReglas] = useState(false)

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

  async function cargar() {
    if (!tenant) {
      setProy(null)
      return
    }
    setCargando(true)
    setError(null)
    try {
      const r = await fetch(`/api/acreditaciones?tenant=${encodeURIComponent(tenant)}&periodo=${periodo}`)
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? 'Error al cargar')
      setProy(j.proyeccion)
    } catch (e) {
      setError((e as Error).message)
      setProy(null)
    } finally {
      setCargando(false)
    }
  }
  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant, periodo])

  const t = proy?.total
  const celda = (n: number) => (n === 0 ? <span style={{ color: 'var(--muted)' }}>—</span> : moneda(n))

  return (
    <div className="mx-auto max-w-6xl">
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
        <button
          onClick={() => setVerReglas((v) => !v)}
          disabled={!tenant}
          className="ml-auto rounded-md border px-2.5 py-1 text-[11px] font-semibold disabled:opacity-50"
          style={{ borderColor: 'var(--border2)', color: verReglas ? 'var(--hio)' : 'var(--muted2)' }}
          title="Configurar los plazos de acreditación y comisiones por tipo de cobro"
        >
          💲 {verReglas ? 'Ocultar reglas' : 'Configurar % y plazos'}
        </button>
      </div>

      {error && <div className="pc-error mb-4 px-4 py-2.5 text-[12px]">{error}</div>}

      {verReglas && tenant && (
        <div className="pc-panel mb-4 p-4">
          <div className="mb-1 text-[12px] font-semibold">💲 Reglas de liquidación — plazos y comisiones</div>
          <div className="mb-3 text-[10.5px]" style={{ color: 'var(--muted)' }}>
            Por cada tipo de cobro: a cuántos días se acredita y qué comisión cobra la pasarela. Los cambios actualizan el flujo de abajo.
          </div>
          <ReglasLiquidacion tenant={tenant} onError={setError} onSaved={cargar} />
        </div>
      )}

      {!tenant ? (
        <div className="pc-panel p-6 text-center text-[12px]" style={{ color: 'var(--muted)' }}>Elegí un cliente para ver sus acreditaciones.</div>
      ) : cargando ? (
        <div className="pc-panel p-6 text-center text-[12px]" style={{ color: 'var(--muted)' }}>Calculando…</div>
      ) : proy && t ? (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Kpi label="Operaciones" valor={String(t.n)} />
            <Kpi label="Bruto" valor={moneda(t.bruto)} />
            <Kpi label="Comisión" valor={moneda(t.comision)} color="var(--red)" />
            <Kpi label="Neto a acreditar" valor={moneda(t.neto)} color="var(--green)" />
          </div>

          {proy.sinRegla > 0 && (
            <div className="pc-error mb-4 px-4 py-2 text-[12px]">
              ⚠ {proy.sinRegla} operación(es) sin regla de liquidación cargada (se proyectan con comisión 0). Cargá las reglas en Clientes → Pasarelas → 💲 Reglas de liquidación.
            </div>
          )}

          <div className="pc-panel overflow-hidden">
            <div className="border-b px-4 py-2 text-[12px] font-semibold" style={{ borderColor: 'var(--border)' }}>
              Neto a acreditar por semana
            </div>
            <div className="overflow-x-auto">
              <table className="pc-tabla w-full whitespace-nowrap text-[11.5px]">
                <thead>
                  <tr className="pc-thead text-[9px] uppercase tracking-wide">
                    <th className="px-2.5 py-2 text-left">Tipo de cobro</th>
                    {proy.semanas.map((s) => (
                      <th key={s.inicio} className="px-2.5 py-2 text-right" title={`${s.inicio} al ${s.fin}`}>{s.label}</th>
                    ))}
                    <th className="px-2.5 py-2 text-right" style={{ color: 'var(--hio)' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {proy.filas.length === 0 && (
                    <tr><td colSpan={proy.semanas.length + 2} className="px-2.5 py-5 text-center" style={{ color: 'var(--muted)' }}>Sin operaciones en el mes.</td></tr>
                  )}
                  {proy.filas.map((f, i) => (
                    <tr key={f.tipo} style={{ borderTop: '1px solid var(--border)', background: i % 2 ? 'var(--surface2)' : 'transparent' }}>
                      <td className="px-2.5 py-1.5 font-semibold">{TIPO_COBRO_LABEL[f.tipo] ?? f.tipo}</td>
                      {proy.semanas.map((s) => (
                        <td key={s.inicio} className="px-2.5 py-1.5 text-right font-mono" style={{ color: 'var(--muted2)' }}>
                          {celda(f.porSemana[s.inicio]?.neto ?? 0)}
                        </td>
                      ))}
                      <td className="px-2.5 py-1.5 text-right font-mono font-semibold" style={{ color: 'var(--green)' }}>{moneda(f.total.neto)}</td>
                    </tr>
                  ))}
                </tbody>
                {proy.filas.length > 0 && (
                  <tfoot>
                    <tr style={{ borderTop: '2px solid var(--border)', background: 'var(--surface2)' }}>
                      <td className="px-2.5 py-2 font-bold">Total</td>
                      {proy.semanas.map((s) => (
                        <td key={s.inicio} className="px-2.5 py-2 text-right font-mono font-bold">{celda(proy.totalPorSemana[s.inicio]?.neto ?? 0)}</td>
                      ))}
                      <td className="px-2.5 py-2 text-right font-mono font-bold" style={{ color: 'var(--green)' }}>{moneda(t.neto)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          <div className="mt-3 text-[10.5px]" style={{ color: 'var(--muted)' }}>
            Semanas de lunes a domingo, por fecha estimada de acreditación. Proyección según las reglas (plazo + comisión por tipo). No contempla feriados ni retenciones impositivas.
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
