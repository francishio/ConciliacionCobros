'use client'

import { useState } from 'react'
import { useSesion } from '@/components/useSesion'

interface Resultado {
  proveedor: string
  procesados: number
  ok: number
  diferenciaMonto: number
  enRevision: number
  sinTransaccion: number
  noAplica: number
  excepciones: number
}
interface EstablecimientoResumen {
  id: string
  nombre: string
  codTienda: string | null
  ok: number
  diferenciaMonto: number
  enRevision: number
  sinTransaccion: number
  total: number
}
interface Respuesta {
  tenant: string
  cobros: number
  transacciones: number
  resultado: Resultado
  establecimientos: EstablecimientoResumen[]
}

export default function Home() {
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<Respuesta | null>(null)
  const sesion = useSesion()
  const esCliente = sesion?.rol === 'CLIENTE'

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setCargando(true)
    setError(null)
    setData(null)
    try {
      const res = await fetch('/api/conciliar', { method: 'POST', body: new FormData(e.currentTarget) })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Error en la conciliación')
      setData(json as Respuesta)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setCargando(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-5">
        <h1 className="text-lg font-bold tracking-tight">Conciliación operativa</h1>
        <p className="mt-1 text-[12.5px]" style={{ color: 'var(--muted2)' }}>
          Subí el export de HIOPOS y el reporte de Payway para cruzar los cobros.
        </p>
      </div>

      <form onSubmit={onSubmit} className="pc-panel space-y-5 p-6">
        {esCliente ? (
          <div>
            <label className="mb-1 block text-[11px] font-medium" style={{ color: 'var(--muted2)' }}>
              Cliente
            </label>
            <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
              {sesion?.tenantNombre}
            </div>
          </div>
        ) : (
          <div>
            <label className="mb-1 block text-[11px] font-medium" style={{ color: 'var(--muted2)' }}>
              Cliente / empresa
            </label>
            <input name="tenant" defaultValue="" placeholder="Nombre del cliente" className="pc-input w-full px-3 py-2 text-sm" />
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <FileField name="hiopos" label="Export HIOPOS (.csv)" accept=".csv" />
          <FileField name="payway" label="Reporte Payway (.xlsx)" accept=".xlsx" />
        </div>
        <button
          type="submit"
          disabled={cargando}
          className="rounded-lg px-4 py-2 text-[12px] font-semibold disabled:opacity-50"
          style={{ background: 'var(--cyan)', color: '#04121a' }}
        >
          {cargando ? 'Conciliando…' : 'Conciliar'}
        </button>
      </form>

      {error && (
        <div
          className="mt-5 rounded-lg border px-4 py-3 text-[12.5px]"
          style={{ borderColor: '#7f1d1d', background: '#2a0a0a', color: '#fca5a5' }}
        >
          {error}
        </div>
      )}

      {data && <Dashboard data={data} />}
    </div>
  )
}

function FileField({ name, label, accept }: { name: string; label: string; accept: string }) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-medium" style={{ color: 'var(--muted2)' }}>
        {label}
      </label>
      <input
        name={name}
        type="file"
        accept={accept}
        required
        className="block w-full text-[12px] file:mr-3 file:rounded-md file:border-0 file:px-3 file:py-2 file:text-[12px] file:font-medium"
        style={{ color: 'var(--muted2)' }}
      />
    </div>
  )
}

function Dashboard({ data }: { data: Respuesta }) {
  const r = data.resultado
  const total = r.procesados || 1
  const pct = (n: number) => Math.round((100 * n) / total)
  const tramos = [
    { n: r.ok, color: 'var(--green)' },
    { n: r.enRevision, color: 'var(--amber)' },
    { n: r.sinTransaccion, color: 'var(--red)' },
  ]

  return (
    <section className="mt-7 space-y-5">
      <p className="font-mono text-[11px]" style={{ color: 'var(--muted)' }}>
        <span style={{ color: 'var(--text)' }}>{data.tenant}</span> · {data.cobros} cobros HIOPOS ·{' '}
        {data.transacciones} transacciones Payway
      </p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Conciliado" valor={r.ok} sub={`${pct(r.ok)}%`} color="var(--green)" />
        <Kpi label="En revisión" valor={r.enRevision} sub={`${pct(r.enRevision)}%`} color="var(--amber)" />
        <Kpi label="Sin transacción" valor={r.sinTransaccion} sub={`${pct(r.sinTransaccion)}%`} color="var(--red)" />
        <Kpi label="No aplica" valor={r.noAplica} sub="otros medios" color="var(--muted2)" />
      </div>

      <div className="pc-panel p-4">
        <div className="mb-2 flex justify-between text-[10.5px]" style={{ color: 'var(--muted)' }}>
          <span>{r.procesados} cobros de Payway procesados</span>
          <span style={{ color: 'var(--green)' }}>{pct(r.ok)}% automático</span>
        </div>
        <div className="flex h-3 overflow-hidden rounded-full" style={{ background: 'var(--surface3)' }}>
          {tramos.map((t, i) => (
            <div key={i} style={{ width: `${pct(t.n)}%`, background: t.color }} />
          ))}
        </div>
        <p className="mt-3 text-[10.5px]" style={{ color: 'var(--muted)' }}>
          {r.excepciones} excepciones abiertas · la cola de revisión (grilla doble) y el detalle por cobro vienen en el
          próximo paso.
        </p>
      </div>

      {data.establecimientos.length > 0 && <PorEstablecimiento filas={data.establecimientos} />}
    </section>
  )
}

function PorEstablecimiento({ filas }: { filas: EstablecimientoResumen[] }) {
  return (
    <div className="pc-panel overflow-hidden">
      <div className="border-b px-4 py-2.5 text-[11px] font-semibold" style={{ borderColor: 'var(--border)' }}>
        Por establecimiento
      </div>
      <table className="w-full text-[11.5px]">
        <thead>
          <tr style={{ color: 'var(--muted)' }} className="text-[9.5px] uppercase tracking-wide">
            <th className="px-4 py-2 text-left font-semibold">Tienda</th>
            <th className="px-3 py-2 text-right font-semibold">Conciliado</th>
            <th className="px-3 py-2 text-right font-semibold">Revisión</th>
            <th className="px-3 py-2 text-right font-semibold">Sin trans.</th>
            <th className="px-4 py-2 text-right font-semibold">% auto</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((e) => {
            const revision = e.enRevision + e.diferenciaMonto
            const pct = e.total ? Math.round((100 * e.ok) / e.total) : 0
            return (
              <tr key={e.id} className="border-t" style={{ borderColor: 'var(--border)' }}>
                <td className="px-4 py-2">
                  <div style={{ color: 'var(--text)' }}>{e.nombre}</div>
                  {e.codTienda && (
                    <div className="font-mono text-[9px]" style={{ color: 'var(--muted)' }}>
                      #{e.codTienda}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2 text-right font-mono" style={{ color: 'var(--green)' }}>
                  {e.ok}
                </td>
                <td className="px-3 py-2 text-right font-mono" style={{ color: revision ? 'var(--amber)' : 'var(--muted)' }}>
                  {revision}
                </td>
                <td
                  className="px-3 py-2 text-right font-mono"
                  style={{ color: e.sinTransaccion ? 'var(--red)' : 'var(--muted)' }}
                >
                  {e.sinTransaccion}
                </td>
                <td className="px-4 py-2 text-right font-mono" style={{ color: 'var(--muted2)' }}>
                  {pct}%
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function Kpi({ label, valor, sub, color }: { label: string; valor: number; sub: string; color: string }) {
  return (
    <div className="pc-panel relative overflow-hidden p-4">
      <div className="absolute inset-x-0 top-0 h-0.5" style={{ background: color }} />
      <div className="text-[9.5px] font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
        {label}
      </div>
      <div className="mt-1.5 font-mono text-2xl font-semibold" style={{ color }}>
        {valor}
      </div>
      <div className="text-[9.5px]" style={{ color: 'var(--muted)' }}>
        {sub}
      </div>
    </div>
  )
}
