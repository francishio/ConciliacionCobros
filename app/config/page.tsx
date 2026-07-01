'use client'

import { useEffect, useState } from 'react'

interface Cfg {
  tenant: string
  existe: boolean
  apiUser: string
  expIdVentas: string
  expIdTiendas: string
  tienePassword: boolean
}

export default function ConfigPage() {
  const [tenant, setTenant] = useState('Rochino')
  const [apiUser, setApiUser] = useState('')
  const [apiPassword, setApiPassword] = useState('')
  const [expIdVentas, setExpIdVentas] = useState('')
  const [expIdTiendas, setExpIdTiendas] = useState('')
  const [tienePassword, setTienePassword] = useState(false)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  async function cargar() {
    setCargando(true)
    setError(null)
    setAviso(null)
    try {
      const res = await fetch(`/api/config?tenant=${encodeURIComponent(tenant)}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Error al cargar')
      const c = json as Cfg
      setApiUser(c.apiUser)
      setExpIdVentas(c.expIdVentas)
      setExpIdTiendas(c.expIdTiendas)
      setTienePassword(c.tienePassword)
      setApiPassword('')
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

  async function guardar() {
    setError(null)
    setAviso(null)
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tenant, apiUser, apiPassword, expIdVentas, expIdTiendas }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'No se pudo guardar')
      setAviso('Configuración guardada.')
      await cargar()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-5 flex items-end gap-3">
        <div>
          <h1 className="text-lg font-bold tracking-tight">Configuración · HIOPOS</h1>
          <p className="mt-1 text-[12.5px]" style={{ color: 'var(--muted2)' }}>
            Credenciales del Bridge Hioffice y los Exportation IDs de este cliente.
          </p>
        </div>
        <div className="ml-auto flex items-end gap-2">
          <input
            value={tenant}
            onChange={(e) => setTenant(e.target.value)}
            className="pc-input px-3 py-1.5 text-[12px]"
            placeholder="Cliente"
          />
          <button
            onClick={cargar}
            disabled={cargando}
            className="rounded-lg px-3 py-1.5 text-[12px] font-semibold disabled:opacity-50"
            style={{ background: 'var(--surface3)', color: 'var(--text)' }}
          >
            {cargando ? '…' : 'Cambiar'}
          </button>
        </div>
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

      <div className="pc-panel space-y-4 p-6">
        <Campo label="Usuario del Bridge">
          <input
            value={apiUser}
            onChange={(e) => setApiUser(e.target.value)}
            placeholder="usuario@cliente.com"
            className="pc-input w-full px-3 py-2 text-sm"
          />
        </Campo>

        <Campo label="Contraseña del Bridge" hint={tienePassword ? 'Ya hay una guardada · dejala vacía para no cambiarla' : 'Se guarda cifrada'}>
          <input
            type="password"
            value={apiPassword}
            onChange={(e) => setApiPassword(e.target.value)}
            placeholder={tienePassword ? '•••••••• (guardada)' : 'contraseña'}
            className="pc-input w-full px-3 py-2 text-sm"
          />
        </Campo>

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo label="Exportation ID · Ventas/Cobros" hint="El que trae los cobros">
            <input
              value={expIdVentas}
              onChange={(e) => setExpIdVentas(e.target.value)}
              placeholder="ej. 1512683"
              className="pc-input w-full px-3 py-2 font-mono text-sm"
            />
          </Campo>
          <Campo label="Exportation ID · Tiendas" hint="El catálogo de establecimientos">
            <input
              value={expIdTiendas}
              onChange={(e) => setExpIdTiendas(e.target.value)}
              placeholder="ej. 1512700"
              className="pc-input w-full px-3 py-2 font-mono text-sm"
            />
          </Campo>
        </div>

        <div className="flex items-center gap-3 pt-1">
          <button
            onClick={guardar}
            className="rounded-lg px-4 py-2 text-[12px] font-semibold"
            style={{ background: 'var(--cyan)', color: '#04121a' }}
          >
            Guardar
          </button>
          <span className="text-[10.5px]" style={{ color: 'var(--muted)' }}>
            🔒 La contraseña se almacena cifrada; nunca se muestra de vuelta.
          </span>
        </div>
      </div>
    </div>
  )
}

function Campo({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-medium" style={{ color: 'var(--muted2)' }}>
        {label}
      </label>
      {children}
      {hint && (
        <div className="mt-1 text-[10px]" style={{ color: 'var(--muted)' }}>
          {hint}
        </div>
      )}
    </div>
  )
}
