'use client'

import { useEffect, useState } from 'react'

interface Pasarela {
  id: string
  codigo: string
  nombre: string
  tipoIngesta: string
  activo: boolean
  orden: number
}

const colorTipo: Record<string, string> = {
  ARCHIVO: 'var(--cyan)',
  API: 'var(--green)',
  PENDIENTE: 'var(--muted2)',
}

export default function PasarelasPage() {
  const [pasarelas, setPasarelas] = useState<Pasarela[]>([])
  const [tipos, setTipos] = useState<string[]>(['ARCHIVO', 'API', 'PENDIENTE'])
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  // Alta
  const [codigo, setCodigo] = useState('')
  const [nombre, setNombre] = useState('')
  const [tipoIngesta, setTipoIngesta] = useState('ARCHIVO')

  async function cargar() {
    setError(null)
    try {
      const res = await fetch('/api/pasarelas')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Error al cargar')
      setPasarelas(json.pasarelas)
      setTipos(json.tipos)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  useEffect(() => {
    cargar()
  }, [])

  async function guardar(body: Record<string, unknown>, okMsg: string) {
    setError(null)
    setAviso(null)
    try {
      const res = await fetch('/api/pasarelas', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'No se pudo guardar')
      setAviso(okMsg)
      await cargar()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function agregar() {
    if (!codigo.trim() || !nombre.trim()) {
      setError('Completá código y nombre.')
      return
    }
    await guardar({ codigo, nombre, tipoIngesta }, 'Pasarela guardada.')
    setCodigo('')
    setNombre('')
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-5">
        <h1 className="text-lg font-bold tracking-tight">Pasarelas de cobro</h1>
        <p className="mt-1 text-[12.5px]" style={{ color: 'var(--muted2)' }}>
          Catálogo global de pasarelas. Se usan al mapear códigos por establecimiento y para validar cobertura.
        </p>
      </div>

      {error && (
        <div
          className="mb-4 rounded-lg border px-4 py-2.5 text-[12px]"
          style={{ borderColor: '#7f1d1d', background: '#2a0a0a', color: '#fca5a5' }}
        >
          {error}
        </div>
      )}
      {aviso && (
        <div
          className="mb-4 rounded-lg border px-4 py-2.5 text-[12px]"
          style={{ borderColor: '#14532d', background: '#08220f', color: '#86efac' }}
        >
          {aviso}
        </div>
      )}

      <div className="pc-panel mb-5 overflow-hidden">
        <table className="w-full text-[12px]">
          <thead>
            <tr
              className="text-left text-[9.5px] uppercase tracking-wide"
              style={{ color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}
            >
              <th className="px-3 py-2.5 font-semibold">Código</th>
              <th className="px-3 py-2.5 font-semibold">Nombre</th>
              <th className="px-3 py-2.5 font-semibold">Ingesta</th>
              <th className="px-3 py-2.5 text-right font-semibold">Estado</th>
            </tr>
          </thead>
          <tbody>
            {pasarelas.map((p) => (
              <tr key={p.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td className="px-3 py-2.5 font-mono" style={{ color: 'var(--cyan)' }}>
                  {p.codigo}
                </td>
                <td className="px-3 py-2.5" style={{ color: 'var(--text)' }}>
                  {p.nombre}
                </td>
                <td className="px-3 py-2.5">
                  <span
                    className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
                    style={{ background: 'var(--surface3)', color: colorTipo[p.tipoIngesta] ?? 'var(--muted2)' }}
                  >
                    {p.tipoIngesta}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right">
                  <button
                    onClick={() => guardar({ codigo: p.codigo, nombre: p.nombre, tipoIngesta: p.tipoIngesta, activo: !p.activo }, p.activo ? 'Pasarela desactivada.' : 'Pasarela activada.')}
                    className="rounded px-2 py-1 text-[10.5px] font-semibold"
                    style={
                      p.activo
                        ? { background: '#08220f', color: '#86efac', border: '1px solid #14532d' }
                        : { background: 'var(--surface2)', color: 'var(--muted)', border: '1px solid var(--border2)' }
                    }
                    title="Activar / desactivar"
                  >
                    {p.activo ? 'Activa' : 'Inactiva'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Alta */}
      <div className="pc-panel p-4">
        <div className="mb-2 text-[11px] font-semibold">Agregar pasarela</div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            placeholder="Código (ej. CLOVER)"
            className="pc-input px-2 py-1.5 font-mono text-[11px]"
            style={{ width: 150 }}
          />
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Nombre visible (ej. Clover / Fiserv)"
            className="pc-input flex-1 px-2 py-1.5 text-[11px]"
            style={{ minWidth: 180 }}
          />
          <select
            value={tipoIngesta}
            onChange={(e) => setTipoIngesta(e.target.value)}
            className="pc-input px-2 py-1.5 text-[11px]"
          >
            {tipos.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <button
            onClick={agregar}
            className="rounded-md px-3 py-1.5 text-[11px] font-semibold"
            style={{ background: 'var(--green)', color: '#04140b' }}
          >
            + Agregar
          </button>
        </div>
        <div className="mt-2 text-[10px]" style={{ color: 'var(--muted)' }}>
          El código se guarda en MAYÚSCULAS sin espacios. “Ingesta” es informativo: ARCHIVO / API / PENDIENTE (una
          pasarela nueva no se concilia hasta tener su adaptador de ingesta).
        </div>
      </div>
    </div>
  )
}
