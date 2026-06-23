'use client'

import { useState } from 'react'

interface Resultado {
  proveedor: string
  cobrosPendientes: number
  procesados: number
  deterministico: number
  fuzzy: number
  ok: number
  diferenciaMonto: number
  enRevision: number
  sinTransaccion: number
  noAplica: number
  sinMapeo: number
  excepciones: number
}
interface Respuesta {
  tenant: string
  cobros: number
  transacciones: number
  resultado: Resultado
}

export default function Home() {
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<Respuesta | null>(null)

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
    <main className="mx-auto max-w-3xl px-5 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">ConciliaciónCobros</h1>
        <p className="mt-1 text-sm text-gray-500">
          Conciliá los cobros de HIOPOS contra Payway. Subí el export de HIOPOS y el reporte de Payway.
        </p>
      </header>

      <form onSubmit={onSubmit} className="space-y-5 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div>
          <label className="block text-sm font-medium text-gray-700">Cliente / tienda</label>
          <input
            name="tenant"
            defaultValue="Rochino"
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-marca focus:outline-none focus:ring-1 focus:ring-marca"
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-gray-700">Export HIOPOS (.csv)</label>
            <input name="hiopos" type="file" accept=".csv" required className="mt-1 block w-full text-sm text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-gray-100 file:px-3 file:py-2 file:text-sm file:font-medium hover:file:bg-gray-200" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Reporte Payway (.xlsx)</label>
            <input name="payway" type="file" accept=".xlsx" required className="mt-1 block w-full text-sm text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-gray-100 file:px-3 file:py-2 file:text-sm file:font-medium hover:file:bg-gray-200" />
          </div>
        </div>
        <button
          type="submit"
          disabled={cargando}
          className="rounded-lg bg-marca px-4 py-2 text-sm font-semibold text-white hover:bg-marca-oscuro disabled:opacity-50"
        >
          {cargando ? 'Conciliando…' : 'Conciliar'}
        </button>
      </form>

      {error && (
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {data && <Dashboard data={data} />}
    </main>
  )
}

function Dashboard({ data }: { data: Respuesta }) {
  const r = data.resultado
  const total = r.procesados || 1
  const pct = (n: number) => Math.round((100 * n) / total)
  const tramos = [
    { label: 'Conciliado', n: r.ok, color: 'bg-emerald-500' },
    { label: 'En revisión', n: r.enRevision, color: 'bg-amber-500' },
    { label: 'Sin transacción', n: r.sinTransaccion, color: 'bg-rose-500' },
  ]

  return (
    <section className="mt-8 space-y-6">
      <p className="text-sm text-gray-500">
        <span className="font-medium text-gray-700">{data.tenant}</span> · {data.cobros} cobros HIOPOS ·{' '}
        {data.transacciones} transacciones Payway
      </p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card titulo="Conciliado" valor={r.ok} sub={`${pct(r.ok)}%`} tono="emerald" />
        <Card titulo="En revisión" valor={r.enRevision} sub={`${pct(r.enRevision)}%`} tono="amber" />
        <Card titulo="Sin transacción" valor={r.sinTransaccion} sub={`${pct(r.sinTransaccion)}%`} tono="rose" />
        <Card titulo="No aplica" valor={r.noAplica} sub="otros medios" tono="gray" />
      </div>

      <div>
        <div className="mb-1 flex justify-between text-xs text-gray-500">
          <span>{r.procesados} cobros de Payway procesados</span>
          <span>{pct(r.ok)}% automático</span>
        </div>
        <div className="flex h-3 overflow-hidden rounded-full bg-gray-100">
          {tramos.map((t) => (
            <div key={t.label} className={t.color} style={{ width: `${pct(t.n)}%` }} title={`${t.label}: ${t.n}`} />
          ))}
        </div>
      </div>

      <p className="text-xs text-gray-400">
        Excepciones abiertas: {r.excepciones}. (La cola de revisión y el detalle por cobro vienen en el próximo paso.)
      </p>
    </section>
  )
}

function Card({ titulo, valor, sub, tono }: { titulo: string; valor: number; sub: string; tono: 'emerald' | 'amber' | 'rose' | 'gray' }) {
  const tonos: Record<string, string> = {
    emerald: 'text-emerald-700',
    amber: 'text-amber-700',
    rose: 'text-rose-700',
    gray: 'text-gray-600',
  }
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-gray-400">{titulo}</div>
      <div className={`mt-1 text-2xl font-bold ${tonos[tono]}`}>{valor}</div>
      <div className="text-xs text-gray-400">{sub}</div>
    </div>
  )
}
