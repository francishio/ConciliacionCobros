'use client'

import { useCallback, useEffect, useState } from 'react'

interface PasarelaArchivo {
  codigo: string
  nombre: string
  tieneParser: boolean
}
interface MesEstado {
  periodo: string
  cobros: number
  porPasarela: Record<string, number>
}
interface Estado {
  anio: number
  pasarelas: PasarelaArchivo[]
  meses: MesEstado[]
}

const MES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const MES_LARGO = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const nombreMes = (periodo: string) => `${MES_LARGO[Number(periodo.slice(5, 7)) - 1]} ${periodo.slice(0, 4)}`

export default function CargaPage() {
  const [anio, setAnio] = useState(() => new Date().getFullYear())
  const [estado, setEstado] = useState<Estado | null>(null)
  const [sel, setSel] = useState<string | null>(null)
  const [hiopos, setHiopos] = useState<File | null>(null)
  const [extractos, setExtractos] = useState<Record<string, File | null>>({})
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const cargarEstado = useCallback(async () => {
    try {
      const res = await fetch(`/api/carga?anio=${anio}`)
      const json = await res.json()
      if (res.ok) setEstado(json as Estado)
    } catch {
      /* ignore */
    }
  }, [anio])

  useEffect(() => {
    cargarEstado()
  }, [cargarEstado])

  function seleccionar(periodo: string) {
    setSel(periodo)
    setHiopos(null)
    setExtractos({})
    setError(null)
    setAviso(null)
  }

  const mesSel = estado?.meses.find((m) => m.periodo === sel)
  const cargados = (m: MesEstado) => m.cobros > 0 || Object.keys(m.porPasarela).length > 0

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!sel) return
    if (!hiopos) {
      setError('Subí el export de HIOPOS.')
      return
    }
    setCargando(true)
    setError(null)
    setAviso(null)
    try {
      const fd = new FormData()
      fd.set('periodo', sel)
      fd.set('hiopos', hiopos)
      for (const [codigo, f] of Object.entries(extractos)) if (f) fd.set(`extracto_${codigo}`, f)
      const res = await fetch('/api/carga', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Error en la carga')
      let msg = `✓ ${nombreMes(sel)} cargado (${json.cobros} cobros · ${json.transacciones} transacciones).`
      if (json.sinParser?.length) msg += ` Sin parser aún: ${json.sinParser.join(', ')}.`
      setAviso(msg)
      setHiopos(null)
      setExtractos({})
      await cargarEstado()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setCargando(false)
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-5 flex items-end gap-3">
        <div>
          <h1 className="text-lg font-bold tracking-tight">Cargar archivos</h1>
          <p className="mt-1 text-[12.5px]" style={{ color: 'var(--muted2)' }}>
            Estado de carga por mes. Tocá un mes para subir sus archivos.
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => setAnio((a) => a - 1)} className="rounded px-2 py-1 text-[13px]" style={{ background: 'var(--surface3)', color: 'var(--text)' }}>
            ◀
          </button>
          <span className="font-mono text-[13px] font-semibold" style={{ color: 'var(--text)' }}>
            {anio}
          </span>
          <button onClick={() => setAnio((a) => a + 1)} className="rounded px-2 py-1 text-[13px]" style={{ background: 'var(--surface3)', color: 'var(--text)' }}>
            ▶
          </button>
        </div>
      </div>

      {/* Matriz de estado */}
      {estado && (
        <div className="pc-panel overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th className="px-3 py-2 text-left font-semibold" style={{ color: 'var(--muted)' }}>
                  Fuente
                </th>
                {estado.meses.map((m, i) => {
                  const activo = m.periodo === sel
                  return (
                    <th
                      key={m.periodo}
                      onClick={() => seleccionar(m.periodo)}
                      className="cursor-pointer px-2 py-2 text-center font-semibold uppercase"
                      style={{ color: activo ? 'var(--cyan)' : 'var(--muted)', background: activo ? 'var(--surface3)' : 'transparent' }}
                    >
                      {MES_CORTO[i]}
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              <FilaMatriz label="HIOPOS" meses={estado.meses} valor={(m) => m.cobros} sel={sel} onSel={seleccionar} />
              {estado.pasarelas.map((p) => (
                <FilaMatriz
                  key={p.codigo}
                  label={p.nombre}
                  meses={estado.meses}
                  valor={(m) => m.porPasarela[p.codigo] ?? 0}
                  sel={sel}
                  onSel={seleccionar}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
      {estado && estado.pasarelas.length === 0 && (
        <div className="mt-2 text-[11px]" style={{ color: 'var(--muted)' }}>
          No tenés pasarelas en modo archivo. Agregalas (modo Archivo) en{' '}
          <span style={{ color: 'var(--cyan)' }}>Establecimientos</span>.
        </div>
      )}

      {/* Panel de subida del mes elegido */}
      {sel && mesSel && (
        <form onSubmit={onSubmit} className="pc-panel mt-5 space-y-4 p-6">
          <div className="text-[13px] font-semibold" style={{ color: 'var(--text)' }}>
            Cargar {nombreMes(sel)}
            {cargados(mesSel) && (
              <span className="ml-2 text-[10.5px] font-normal" style={{ color: 'var(--amber)' }}>
                · ya tiene datos, volver a cargar reemplaza
              </span>
            )}
          </div>

          <FileField label="Export HIOPOS (.csv)" accept=".csv" onFile={setHiopos} file={hiopos} />
          {estado && estado.pasarelas.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2">
              {estado.pasarelas.map((p) => (
                <FileField
                  key={p.codigo}
                  label={`Extracto ${p.nombre}`}
                  accept=".xlsx,.csv"
                  onFile={(f) => setExtractos((prev) => ({ ...prev, [p.codigo]: f }))}
                  file={extractos[p.codigo] ?? null}
                  nota={p.tieneParser ? undefined : 'sin parser aún'}
                  opcional
                />
              ))}
            </div>
          )}

          <button
            type="submit"
            disabled={cargando}
            className="rounded-lg px-4 py-2 text-[12px] font-semibold disabled:opacity-50"
            style={{ background: 'var(--cyan)', color: '#04121a' }}
          >
            {cargando ? 'Procesando…' : cargados(mesSel) ? 'Reemplazar y conciliar' : 'Cargar y conciliar'}
          </button>
        </form>
      )}

      {error && (
        <div className="mt-5 rounded-lg border px-4 py-3 text-[12.5px]" style={{ borderColor: '#7f1d1d', background: '#2a0a0a', color: '#fca5a5' }}>
          {error}
        </div>
      )}
      {aviso && (
        <div className="mt-5 rounded-lg border px-4 py-3 text-[12px]" style={{ borderColor: '#14532d', background: '#08220f', color: '#86efac' }}>
          {aviso} <span style={{ color: 'var(--muted2)' }}>El resultado detallado lo ves en el Dashboard.</span>
        </div>
      )}
    </div>
  )
}

function FilaMatriz({
  label,
  meses,
  valor,
  sel,
  onSel,
}: {
  label: string
  meses: MesEstado[]
  valor: (m: MesEstado) => number
  sel: string | null
  onSel: (p: string) => void
}) {
  return (
    <tr style={{ borderBottom: '1px solid var(--border)' }}>
      <td className="px-3 py-2 font-semibold" style={{ color: 'var(--text)' }}>
        {label}
      </td>
      {meses.map((m) => {
        const v = valor(m)
        const activo = m.periodo === sel
        return (
          <td
            key={m.periodo}
            onClick={() => onSel(m.periodo)}
            className="cursor-pointer px-2 py-2 text-center font-mono"
            style={{ background: activo ? 'var(--surface2)' : 'transparent', color: v > 0 ? 'var(--green)' : 'var(--muted)' }}
          >
            {v > 0 ? v : '·'}
          </td>
        )
      })}
    </tr>
  )
}

function FileField({
  label,
  accept,
  onFile,
  file,
  opcional,
  nota,
}: {
  label: string
  accept: string
  onFile: (f: File | null) => void
  file: File | null
  opcional?: boolean
  nota?: string
}) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-medium" style={{ color: 'var(--muted2)' }}>
        {label} {opcional && <span style={{ color: 'var(--muted)' }}>· opcional</span>}
        {nota && <span style={{ color: 'var(--amber)' }}> · {nota}</span>}
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
