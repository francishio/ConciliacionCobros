'use client'

import { useEffect, useState } from 'react'

interface Pasarela {
  codigo: string
  nombre: string
  tipoIngesta: string
  habilitada: boolean
  alias: string
  modo: 'MANUAL' | 'API'
  tieneCred: boolean
}

export default function MisPasarelasPage() {
  const [pasarelas, setPasarelas] = useState<Pasarela[]>([])
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  async function cargar() {
    setError(null)
    try {
      const res = await fetch('/api/mis-pasarelas')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Error al cargar')
      setPasarelas(json.pasarelas as Pasarela[])
    } catch (e) {
      setError((e as Error).message)
    }
  }

  useEffect(() => {
    cargar()
  }, [])

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-5">
        <h1 className="text-lg font-bold tracking-tight">Pasarelas</h1>
        <p className="mt-1 text-[12.5px]" style={{ color: 'var(--muted2)' }}>
          Elegí qué pasarelas usás, con qué nombre las ves en los informes, y si las cargás por archivo o por API.
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border px-4 py-2.5 text-[12px]" style={{ borderColor: '#7f1d1d', background: '#2a0a0a', color: '#fca5a5' }}>
          {error}
        </div>
      )}
      {aviso && (
        <div className="mb-4 rounded-lg border px-4 py-2.5 text-[12px]" style={{ borderColor: '#14532d', background: '#08220f', color: '#86efac' }}>
          {aviso}
        </div>
      )}

      <div className="space-y-3">
        {pasarelas.map((p) => (
          <FilaPasarela key={p.codigo} p={p} onSaved={cargar} setAviso={setAviso} setError={setError} />
        ))}
        {pasarelas.length === 0 && (
          <div className="pc-panel px-4 py-8 text-center text-[12.5px]" style={{ color: 'var(--muted)' }}>
            No hay pasarelas en el catálogo. Pedile al administrador que las habilite.
          </div>
        )}
      </div>
    </div>
  )
}

function FilaPasarela({
  p,
  onSaved,
  setAviso,
  setError,
}: {
  p: Pasarela
  onSaved: () => void
  setAviso: (s: string | null) => void
  setError: (s: string | null) => void
}) {
  const [habilitada, setHabilitada] = useState(p.habilitada)
  const [alias, setAlias] = useState(p.alias)
  const [modo, setModo] = useState<'MANUAL' | 'API'>(p.modo)
  const [cred, setCred] = useState('')
  const [guardando, setGuardando] = useState(false)

  async function guardar() {
    if (!alias.trim()) {
      setError('Poné un alias para la pasarela.')
      return
    }
    setGuardando(true)
    setError(null)
    setAviso(null)
    try {
      const res = await fetch('/api/mis-pasarelas', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pasarelaCodigo: p.codigo, alias, modo, activo: habilitada, apiCred: cred }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'No se pudo guardar')
      setAviso(`${alias} guardada.`)
      setCred('')
      onSaved()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="pc-panel p-4" style={{ opacity: habilitada ? 1 : 0.65 }}>
      <div className="flex items-center gap-3">
        <button
          onClick={() => setHabilitada(!habilitada)}
          className="rounded px-2 py-1 text-[10.5px] font-semibold"
          style={
            habilitada
              ? { background: '#08220f', color: '#86efac', border: '1px solid #14532d' }
              : { background: 'var(--surface2)', color: 'var(--muted)', border: '1px solid var(--border2)' }
          }
        >
          {habilitada ? 'En uso' : 'No uso'}
        </button>
        <div>
          <div className="text-[13px] font-semibold" style={{ color: 'var(--text)' }}>
            {p.nombre}
          </div>
          <div className="font-mono text-[9px]" style={{ color: 'var(--muted)' }}>
            {p.codigo}
          </div>
        </div>
      </div>

      {habilitada && (
        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_140px]">
          <div>
            <label className="mb-1 block text-[10px] font-medium" style={{ color: 'var(--muted2)' }}>
              Alias (nombre en informes)
            </label>
            <input value={alias} onChange={(e) => setAlias(e.target.value)} className="pc-input w-full px-2 py-1.5 text-[12px]" />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-medium" style={{ color: 'var(--muted2)' }}>
              Modo
            </label>
            <select
              value={modo}
              onChange={(e) => setModo(e.target.value as 'MANUAL' | 'API')}
              className="pc-input w-full px-2 py-1.5 text-[12px]"
            >
              <option value="MANUAL">Archivo manual</option>
              <option value="API">API</option>
            </select>
          </div>

          {modo === 'API' && (
            <div className="sm:col-span-2">
              <label className="mb-1 block text-[10px] font-medium" style={{ color: 'var(--muted2)' }}>
                Credencial de API {p.tieneCred ? '· ya hay una guardada (dejala vacía para no cambiarla)' : '(token / clave)'}
              </label>
              <input
                type="password"
                value={cred}
                onChange={(e) => setCred(e.target.value)}
                placeholder={p.tieneCred ? '•••••••• (guardada)' : 'token de acceso'}
                className="pc-input w-full px-2 py-1.5 font-mono text-[12px]"
              />
              <div className="mt-1 text-[9px]" style={{ color: 'var(--muted)' }}>
                🔒 Se guarda cifrada; nunca se muestra de vuelta.
              </div>
            </div>
          )}
        </div>
      )}

      <div className="mt-3 flex justify-end">
        <button
          onClick={guardar}
          disabled={guardando}
          className="rounded-md px-3 py-1.5 text-[11px] font-semibold disabled:opacity-50"
          style={{ background: 'var(--cyan)', color: '#04121a' }}
        >
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </div>
  )
}
