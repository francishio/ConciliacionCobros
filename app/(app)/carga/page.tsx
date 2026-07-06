'use client'

import { useEffect, useState } from 'react'
import { ResumenMes, type Resumen } from '@/components/ResumenMes'

export default function CargaPage() {
  const [periodo, setPeriodo] = useState(() => new Date().toISOString().slice(0, 7))
  const [hiopos, setHiopos] = useState<File | null>(null)
  const [payway, setPayway] = useState<File | null>(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resumen, setResumen] = useState<Resumen | null>(null)
  const [recienCargado, setRecienCargado] = useState(false)

  // Al entrar, arranca en el último mes con datos (si hay alguno).
  useEffect(() => {
    fetch('/api/dashboard')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j?.periodos?.length) setPeriodo(j.periodos[0])
      })
      .catch(() => {})
  }, [])

  // Al cambiar de mes, trae lo que ya está cargado para ese mes (si hay).
  useEffect(() => {
    let vivo = true
    setRecienCargado(false)
    fetch(`/api/dashboard?periodo=${encodeURIComponent(periodo)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (vivo) setResumen(j?.resumen ?? null)
      })
      .catch(() => {})
    return () => {
      vivo = false
    }
  }, [periodo])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!hiopos) {
      setError('Subí el export de HIOPOS.')
      return
    }
    setCargando(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.set('periodo', periodo)
      fd.set('hiopos', hiopos)
      if (payway) fd.set('payway', payway)
      const res = await fetch('/api/carga', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Error en la carga')
      setResumen(json as Resumen)
      setRecienCargado(true)
      setHiopos(null)
      setPayway(null)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setCargando(false)
    }
  }

  const yaHayDatos = !!resumen && resumen.cobros > 0

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-5">
        <h1 className="text-lg font-bold tracking-tight">Cargar archivos</h1>
        <p className="mt-1 text-[12.5px]" style={{ color: 'var(--muted2)' }}>
          Elegí el mes y subí el export de HIOPOS (todas las pasarelas) y los extractos. Volver a cargar el mismo mes
          reemplaza el bloque.
        </p>
      </div>

      <form onSubmit={onSubmit} className="pc-panel space-y-5 p-6">
        <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
          <div>
            <label className="mb-1 block text-[11px] font-medium" style={{ color: 'var(--muted2)' }}>
              Mes
            </label>
            <input
              type="month"
              value={periodo}
              onChange={(e) => setPeriodo(e.target.value)}
              className="pc-input w-full px-3 py-2 text-sm"
            />
          </div>
        </div>

        {yaHayDatos && !recienCargado && (
          <div
            className="rounded-lg border px-3 py-2 text-[11.5px]"
            style={{ borderColor: 'var(--border2)', background: 'var(--surface2)', color: 'var(--muted2)' }}
          >
            Este mes ya tiene datos cargados ({resumen!.cobros} cobros · {resumen!.transacciones} transacciones). Volver
            a cargar <b style={{ color: 'var(--text)' }}>reemplaza</b> el bloque.
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <FileField label="Export HIOPOS (.csv)" accept=".csv" onFile={setHiopos} file={hiopos} />
          <FileField label="Extracto Payway (.xlsx)" accept=".xlsx" onFile={setPayway} file={payway} opcional />
        </div>
        <button
          type="submit"
          disabled={cargando}
          className="rounded-lg px-4 py-2 text-[12px] font-semibold disabled:opacity-50"
          style={{ background: 'var(--cyan)', color: '#04121a' }}
        >
          {cargando ? 'Procesando…' : yaHayDatos ? 'Reemplazar y conciliar' : 'Cargar y conciliar'}
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

      {resumen && (
        <div className="mt-6">
          <div className="mb-2 text-[11px] font-semibold" style={{ color: recienCargado ? 'var(--green)' : 'var(--muted)' }}>
            {recienCargado ? '✓ Cargado y conciliado' : 'Datos actuales de este mes'}
          </div>
          <ResumenMes resumen={resumen} />
        </div>
      )}
    </div>
  )
}

function FileField({
  label,
  accept,
  onFile,
  file,
  opcional,
}: {
  label: string
  accept: string
  onFile: (f: File | null) => void
  file: File | null
  opcional?: boolean
}) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-medium" style={{ color: 'var(--muted2)' }}>
        {label} {opcional && <span style={{ color: 'var(--muted)' }}>· opcional</span>}
      </label>
      <input
        type="file"
        accept={accept}
        onChange={(e) => onFile(e.target.files?.[0] ?? null)}
        className="block w-full text-[12px] file:mr-3 file:rounded-md file:border-0 file:px-3 file:py-2 file:text-[12px] file:font-medium"
        style={{ color: 'var(--muted2)' }}
      />
      {file && (
        <div className="mt-1 font-mono text-[10px]" style={{ color: 'var(--muted)' }}>
          {file.name}
        </div>
      )}
    </div>
  )
}
