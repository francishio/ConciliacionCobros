'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ResumenMes, type Resumen } from '@/components/ResumenMes'

export default function Home() {
  const [periodos, setPeriodos] = useState<string[]>([])
  const [periodo, setPeriodo] = useState<string>('')
  const [resumen, setResumen] = useState<Resumen | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function cargar(p?: string) {
    setCargando(true)
    setError(null)
    try {
      const q = p ? `?periodo=${encodeURIComponent(p)}` : ''
      const res = await fetch(`/api/dashboard${q}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Error al cargar')
      setPeriodos(json.periodos)
      setResumen(json.resumen)
      if (json.resumen) setPeriodo(json.resumen.periodo)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-5 flex items-end gap-3">
        <div>
          <h1 className="text-lg font-bold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-[12.5px]" style={{ color: 'var(--muted2)' }}>
            Resultado de la conciliación del mes.
          </p>
        </div>
        {periodos.length > 0 && (
          <select
            value={periodo}
            onChange={(e) => {
              setPeriodo(e.target.value)
              cargar(e.target.value)
            }}
            className="pc-input ml-auto px-3 py-1.5 text-[12px]"
          >
            {periodos.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        )}
      </div>

      {error && (
        <div
          className="mb-4 rounded-lg border px-4 py-2.5 text-[12px]"
          style={{ borderColor: '#7f1d1d', background: '#2a0a0a', color: '#fca5a5' }}
        >
          {error}
        </div>
      )}

      {!cargando && !resumen && (
        <div className="pc-panel px-4 py-12 text-center text-[12.5px]" style={{ color: 'var(--muted)' }}>
          Todavía no hay datos cargados.{' '}
          <Link href="/carga" style={{ color: 'var(--cyan)' }}>
            Cargá un mes
          </Link>{' '}
          para ver la conciliación.
        </div>
      )}

      {resumen && <ResumenMes resumen={resumen} />}
    </div>
  )
}
