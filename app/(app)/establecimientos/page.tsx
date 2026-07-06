'use client'

import { useEffect, useState } from 'react'
import { useSesion } from '@/components/useSesion'

interface Mapeo {
  id: string
  proveedor: string
  codigoExterno: string
  modo: 'MANUAL' | 'API'
  tieneCred: boolean
  descripcion: string | null
}
interface Establecimiento {
  id: string
  nombre: string
  codTienda: string | null
  direccion: string | null
  localidad: string | null
  provincia: string | null
  grupo: string | null
  mapeos: Mapeo[]
}
interface Pasarela {
  codigo: string
  nombre: string
}
interface Data {
  tenant: string
  proveedores: Pasarela[]
  establecimientos: Establecimiento[]
}

export default function EstablecimientosPage() {
  const [tenant, setTenant] = useState('Rochino')
  const [data, setData] = useState<Data | null>(null)
  const [cargando, setCargando] = useState(false)
  const [sync, setSync] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [abierta, setAbierta] = useState<string | null>(null)
  const sesion = useSesion()
  const esCliente = sesion?.rol === 'CLIENTE'

  // El cliente ve su propio tenant (viene de la sesión); el super admin lo escribe.
  useEffect(() => {
    if (sesion?.rol === 'CLIENTE' && sesion.tenantNombre) setTenant(sesion.tenantNombre)
  }, [sesion])

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
    <div className="mx-auto max-w-6xl">
      <div className="mb-5 flex items-end gap-3">
        <div>
          <h1 className="text-lg font-bold tracking-tight">Establecimientos</h1>
          <p className="mt-1 text-[12.5px]" style={{ color: 'var(--muted2)' }}>
            Tus tiendas HIOPOS. Tocá una fila para mapear el código de cada pasarela.
          </p>
        </div>
        <div className="ml-auto flex items-end gap-2">
          {!esCliente && (
            <input
              value={tenant}
              onChange={(e) => setTenant(e.target.value)}
              className="pc-input px-3 py-1.5 text-[12px]"
              placeholder="Cliente"
            />
          )}
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
          Este cliente todavía no tiene tiendas. Sincronizalas desde HIOPOS (botón de arriba).
        </div>
      )}

      {data && data.establecimientos.length > 0 && (
        <div className="pc-panel overflow-hidden">
          <table className="w-full text-[12px]">
            <thead>
              <tr
                className="text-left text-[9.5px] uppercase tracking-wide"
                style={{ color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}
              >
                <th className="px-3 py-2.5 font-semibold">Código</th>
                <th className="px-3 py-2.5 font-semibold">Tienda</th>
                <th className="px-3 py-2.5 font-semibold">Dirección</th>
                <th className="px-3 py-2.5 font-semibold">Población</th>
                <th className="px-3 py-2.5 font-semibold">Provincia</th>
                <th className="px-3 py-2.5 font-semibold">Grupo</th>
                <th className="px-3 py-2.5 text-right font-semibold">Pasarelas</th>
              </tr>
            </thead>
            <tbody>
              {data.establecimientos.map((e) => (
                <FilaTienda
                  key={e.id}
                  estab={e}
                  tenant={tenant}
                  proveedores={data.proveedores}
                  abierta={abierta === e.id}
                  onToggle={() => setAbierta(abierta === e.id ? null : e.id)}
                  onChange={cargar}
                  setError={setError}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function FilaTienda({
  estab,
  tenant,
  proveedores,
  abierta,
  onToggle,
  onChange,
  setError,
}: {
  estab: Establecimiento
  tenant: string
  proveedores: Pasarela[]
  abierta: boolean
  onToggle: () => void
  onChange: () => void
  setError: (s: string | null) => void
}) {
  const [proveedor, setProveedor] = useState(proveedores[0]?.codigo ?? 'PAYWAY')
  const [codigo, setCodigo] = useState('')
  const [modo, setModo] = useState<'MANUAL' | 'API'>('MANUAL')
  const [apiCred, setApiCred] = useState('')
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
        body: JSON.stringify({ tenant, establecimientoId: estab.id, proveedor, codigoExterno: codigo, modo, apiCred, descripcion }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'No se pudo agregar')
      setCodigo('')
      setApiCred('')
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

  const celda = 'px-3 py-2.5 align-top'
  return (
    <>
      <tr
        onClick={onToggle}
        className="cursor-pointer"
        style={{ borderBottom: '1px solid var(--border)', background: abierta ? 'var(--surface2)' : 'transparent' }}
      >
        <td className={`${celda} font-mono`} style={{ color: 'var(--cyan)' }}>
          {estab.codTienda ?? '—'}
        </td>
        <td className={celda} style={{ color: 'var(--text)' }}>
          {estab.nombre}
        </td>
        <td className={celda} style={{ color: 'var(--muted2)' }}>
          {estab.direccion ?? '—'}
        </td>
        <td className={celda} style={{ color: 'var(--muted2)' }}>
          {estab.localidad ?? '—'}
        </td>
        <td className={celda} style={{ color: 'var(--muted2)' }}>
          {estab.provincia ?? '—'}
        </td>
        <td className={celda}>
          {estab.grupo ? (
            <span
              className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
              style={{ background: 'var(--surface3)', color: 'var(--muted2)' }}
            >
              {estab.grupo}
            </span>
          ) : (
            '—'
          )}
        </td>
        <td className={`${celda} text-right`} style={{ color: 'var(--muted)' }}>
          <span className="font-mono">{estab.mapeos.length}</span>
          <span className="ml-1.5 text-[10px]">{abierta ? '▲' : '▼'}</span>
        </td>
      </tr>

      {abierta && (
        <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface2)' }}>
          <td colSpan={7} className="px-4 pb-4 pt-1">
            {/* Chips de pasarelas mapeadas */}
            <div className="mb-3 flex flex-wrap gap-2">
              {estab.mapeos.length === 0 && (
                <span className="text-[11px]" style={{ color: 'var(--muted)' }}>
                  Sin pasarelas mapeadas.
                </span>
              )}
              {estab.mapeos.map((m) => (
                <span
                  key={m.id}
                  className="flex items-center gap-2 rounded-md px-2.5 py-1 text-[11px]"
                  style={{ background: 'var(--surface)', border: '1px solid var(--border2)' }}
                >
                  <span
                    className="font-semibold"
                    style={{ color: m.proveedor === 'PAYWAY' ? 'var(--cyan)' : 'var(--purple)' }}
                  >
                    {m.proveedor}
                  </span>
                  <span className="font-mono" style={{ color: 'var(--text)' }}>
                    {m.codigoExterno}
                  </span>
                  <span
                    className="rounded px-1 text-[9px] font-semibold uppercase"
                    style={{ background: 'var(--surface3)', color: m.modo === 'API' ? 'var(--green)' : 'var(--muted2)' }}
                  >
                    {m.modo === 'API' ? 'API' : 'archivo'}
                    {m.modo === 'API' && m.tieneCred ? ' 🔒' : ''}
                  </span>
                  {m.descripcion && <span style={{ color: 'var(--muted)' }}>· {m.descripcion}</span>}
                  <button onClick={() => borrar(m.id)} className="ml-1" style={{ color: 'var(--muted)' }} title="Quitar">
                    ✕
                  </button>
                </span>
              ))}
            </div>

            {/* Alta de mapeo */}
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={proveedor}
                onChange={(e) => setProveedor(e.target.value)}
                className="pc-input px-2 py-1.5 text-[11px]"
              >
                {proveedores.map((p) => (
                  <option key={p.codigo} value={p.codigo}>
                    {p.nombre}
                  </option>
                ))}
              </select>
              <select value={modo} onChange={(e) => setModo(e.target.value as 'MANUAL' | 'API')} className="pc-input px-2 py-1.5 text-[11px]">
                <option value="MANUAL">Archivo</option>
                <option value="API">API</option>
              </select>
              <input
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                placeholder="Código establecimiento/terminal"
                className="pc-input flex-1 px-2 py-1.5 text-[11px]"
                style={{ minWidth: 160 }}
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
            {modo === 'API' && (
              <div className="mt-2">
                <input
                  type="password"
                  value={apiCred}
                  onChange={(e) => setApiCred(e.target.value)}
                  placeholder="Credencial de API (token / clave de acceso a la pasarela)"
                  className="pc-input w-full px-2 py-1.5 font-mono text-[11px]"
                />
                <div className="mt-1 text-[9px]" style={{ color: 'var(--muted)' }}>
                  🔒 Se guarda cifrada; nunca se muestra de vuelta.
                </div>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  )
}
