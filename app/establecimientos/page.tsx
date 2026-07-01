'use client'

import { useEffect, useState } from 'react'

interface Mapeo {
  id: string
  proveedor: string
  codigoExterno: string
  descripcion: string | null
}
interface Establecimiento {
  id: string
  nombre: string
  codTienda: string | null
  direccion: string | null
  localidad: string | null
  provincia: string | null
  cobros: number
  transacciones: number
  mapeos: Mapeo[]
}
interface Data {
  tenant: string
  proveedores: string[]
  establecimientos: Establecimiento[]
}

export default function EstablecimientosPage() {
  const [tenant, setTenant] = useState('Rochino')
  const [data, setData] = useState<Data | null>(null)
  const [cargando, setCargando] = useState(false)
  const [sync, setSync] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  // Auto-carga al entrar (mientras no hay login, el cliente por defecto es Rochino).
  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function cargar() {
    setCargando(true)
    setError(null)
    try {
      const res = await fetch(`/api/establecimientos?tenant=${encodeURIComponent(tenant)}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Error al cargar')
      setData(json as Data)
    } catch (e) {
      setError((e as Error).message)
      setData(null)
    } finally {
      setCargando(false)
    }
  }

  async function sincronizar() {
    setSync(true)
    setError(null)
    setAviso(null)
    try {
      const res = await fetch('/api/tiendas/sync', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tenant }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'No se pudo sincronizar')
      setAviso(`Tiendas sincronizadas desde HIOPOS: ${json.sincronizadas}.`)
      await cargar()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSync(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-5 flex items-end gap-3">
        <div>
          <h1 className="text-lg font-bold tracking-tight">Establecimientos</h1>
          <p className="mt-1 text-[12.5px]" style={{ color: 'var(--muted2)' }}>
            Tus tiendas HIOPOS. En cada una, mapeá el código de establecimiento/terminal de cada pasarela.
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
            onClick={sincronizar}
            disabled={sync}
            className="rounded-lg px-3 py-1.5 text-[12px] font-semibold disabled:opacity-50"
            style={{ background: 'var(--surface3)', color: 'var(--text)' }}
            title="Traer las tiendas desde HIOPOS (usa las credenciales y el Exportation ID de Tiendas)"
          >
            {sync ? 'Sincronizando…' : '↻ Sincronizar HIOPOS'}
          </button>
          <button
            onClick={cargar}
            disabled={cargando}
            className="rounded-lg px-3 py-1.5 text-[12px] font-semibold disabled:opacity-50"
            style={{ background: 'var(--cyan)', color: '#04121a' }}
          >
            {cargando ? 'Cargando…' : 'Cargar'}
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

      {data && data.establecimientos.length === 0 && (
        <div className="pc-panel px-4 py-8 text-center text-[12.5px]" style={{ color: 'var(--muted)' }}>
          Este cliente todavía no tiene tiendas. Sincronizalas desde HIOPOS (botón de arriba) o se crean solas al
          ingerir un export de HIOPOS con columna “Cód. Tienda”.
        </div>
      )}

      <div className="space-y-3">
        {data?.establecimientos.map((e) => (
          <Tarjeta key={e.id} estab={e} tenant={tenant} proveedores={data.proveedores} onChange={cargar} setError={setError} />
        ))}
      </div>
    </div>
  )
}

function Tarjeta({
  estab,
  tenant,
  proveedores,
  onChange,
  setError,
}: {
  estab: Establecimiento
  tenant: string
  proveedores: string[]
  onChange: () => void
  setError: (s: string | null) => void
}) {
  const [proveedor, setProveedor] = useState(proveedores[0] ?? 'PAYWAY')
  const [codigo, setCodigo] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [guardando, setGuardando] = useState(false)

  async function agregar() {
    if (!codigo.trim()) {
      setError('Ingresá el código de la pasarela antes de agregar.')
      return
    }
    setGuardando(true)
    setError(null)
    try {
      const res = await fetch('/api/establecimientos', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tenant, establecimientoId: estab.id, proveedor, codigoExterno: codigo, descripcion }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'No se pudo agregar')
      setCodigo('')
      setDescripcion('')
      onChange()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setGuardando(false)
    }
  }

  async function borrar(id: string) {
    setError(null)
    try {
      const res = await fetch('/api/establecimientos', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tenant, id }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'No se pudo borrar')
      onChange()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <div className="pc-panel p-4">
      <div className="flex items-center gap-3">
        <span className="text-base">🏪</span>
        <div>
          <div className="text-[13px] font-semibold" style={{ color: 'var(--text)' }}>
            {estab.nombre}
          </div>
          <div className="font-mono text-[10px]" style={{ color: 'var(--muted)' }}>
            {estab.codTienda ? `Cód. Tienda ${estab.codTienda}` : 'sin cód.'} · {estab.cobros} cobros ·{' '}
            {estab.transacciones} transacciones
          </div>
          {(estab.direccion || estab.localidad || estab.provincia) && (
            <div className="text-[10px]" style={{ color: 'var(--muted2)' }}>
              📍 {[estab.direccion, estab.localidad, estab.provincia].filter(Boolean).join(', ')}
            </div>
          )}
        </div>
      </div>

      {/* Mapeos existentes */}
      <div className="mt-3 flex flex-wrap gap-2">
        {estab.mapeos.length === 0 && (
          <span className="text-[11px]" style={{ color: 'var(--muted)' }}>
            Sin pasarelas mapeadas.
          </span>
        )}
        {estab.mapeos.map((m) => (
          <span
            key={m.id}
            className="flex items-center gap-2 rounded-md px-2.5 py-1 text-[11px]"
            style={{ background: 'var(--surface2)', border: '1px solid var(--border2)' }}
          >
            <span className="font-semibold" style={{ color: m.proveedor === 'PAYWAY' ? 'var(--cyan)' : 'var(--purple)' }}>
              {m.proveedor}
            </span>
            <span className="font-mono" style={{ color: 'var(--text)' }}>
              {m.codigoExterno}
            </span>
            {m.descripcion && <span style={{ color: 'var(--muted)' }}>· {m.descripcion}</span>}
            <button onClick={() => borrar(m.id)} className="ml-1" style={{ color: 'var(--muted)' }} title="Quitar">
              ✕
            </button>
          </span>
        ))}
      </div>

      {/* Alta de mapeo */}
      <div className="mt-3 border-t pt-3" style={{ borderColor: 'var(--border)' }}>
        <div className="mb-1.5 text-[10px]" style={{ color: 'var(--muted)' }}>
          Agregá una pasarela (podés sumar varias: otra pasarela, o varios códigos si la tienda tiene varias terminales).
        </div>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={proveedor}
          onChange={(e) => setProveedor(e.target.value)}
          className="pc-input px-2 py-1.5 text-[11px]"
        >
          {proveedores.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <input
          value={codigo}
          onChange={(e) => setCodigo(e.target.value)}
          placeholder="Código establecimiento/terminal"
          className="pc-input flex-1 px-2 py-1.5 text-[11px]"
          style={{ minWidth: 180 }}
        />
        <input
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          placeholder="Etiqueta (opc.)"
          className="pc-input px-2 py-1.5 text-[11px]"
          style={{ width: 130 }}
        />
        <button
          onClick={agregar}
          disabled={guardando}
          className="rounded-md px-3 py-1.5 text-[11px] font-semibold disabled:opacity-50"
          style={{ background: 'var(--green)', color: '#04140b' }}
        >
          {guardando ? 'Agregando…' : '+ Agregar'}
        </button>
      </div>
      </div>
    </div>
  )
}
