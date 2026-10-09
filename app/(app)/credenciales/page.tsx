'use client'

// Pasarelas y credenciales del cliente: el lugar ÚNICO donde se cargan las
// credenciales de cada pasarela (una fila por cuenta/comercio). La credencial se
// guarda cifrada y nunca se muestra de vuelta.
import { useEffect, useState } from 'react'
import { useSesion } from '@/components/useSesion'

interface Cuenta {
  id: string
  proveedor: string
  modo: 'MANUAL' | 'API'
  identificador: string
  descripcion: string | null
  activo: boolean
  tieneCred: boolean
}
interface Pasarela {
  codigo: string
  nombre: string
}
interface Data {
  tenant: string
  pasarelas: Pasarela[]
  cuentas: Cuenta[]
}

export default function CredencialesPage() {
  const [tenant, setTenant] = useState('DINEGA')
  const [data, setData] = useState<Data | null>(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const sesion = useSesion()
  const esCliente = sesion?.rol === 'CLIENTE'

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
      const res = await fetch(`/api/cuentas-pasarela?tenant=${encodeURIComponent(tenant)}`)
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

  async function borrar(id: string) {
    setError(null)
    try {
      const res = await fetch('/api/cuentas-pasarela', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tenant, id }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'No se pudo borrar')
      await cargar()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-5 flex items-end gap-3">
        <div>
          <h1 className="text-lg font-bold tracking-tight">Pasarelas y credenciales</h1>
          <p className="mt-1 text-[12.5px]" style={{ color: 'var(--muted2)' }}>
            Una cuenta por comercio. La credencial (token) se guarda cifrada y no se vuelve a mostrar.
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

      {data && (
        <>
          {/* Cuentas existentes */}
          <div className="pc-panel mb-4 overflow-hidden">
            <table className="pc-tabla w-full text-[12px]">
              <thead>
                <tr
                  className="text-left text-[9.5px] uppercase tracking-wide"
                  style={{ color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}
                >
                  <th className="px-3 py-2.5 font-semibold">Pasarela</th>
                  <th className="px-3 py-2.5 font-semibold">Modo</th>
                  <th className="px-3 py-2.5 font-semibold">Identificador (MID / cuenta)</th>
                  <th className="px-3 py-2.5 font-semibold">Etiqueta</th>
                  <th className="px-3 py-2.5 font-semibold">Credencial</th>
                  <th className="px-3 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {data.cuentas.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-[12px]" style={{ color: 'var(--muted)' }}>
                      Todavía no hay cuentas de pasarela. Agregá una abajo.
                    </td>
                  </tr>
                )}
                {data.cuentas.map((c) => {
                  const nombre = data.pasarelas.find((p) => p.codigo === c.proveedor)?.nombre ?? c.proveedor
                  return (
                    <tr key={c.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td className="px-3 py-2.5 font-semibold" style={{ color: 'var(--purple)' }}>
                        {nombre}
                      </td>
                      <td className="px-3 py-2.5">
                        <span
                          className="rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase"
                          style={{ background: 'var(--surface3)', color: c.modo === 'API' ? 'var(--green)' : 'var(--muted2)' }}
                        >
                          {c.modo === 'API' ? 'API' : 'archivo'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 font-mono" style={{ color: 'var(--text)' }}>
                        {c.identificador || '—'}
                      </td>
                      <td className="px-3 py-2.5" style={{ color: 'var(--muted2)' }}>
                        {c.descripcion || '—'}
                      </td>
                      <td className="px-3 py-2.5">
                        {c.modo === 'API' ? (
                          c.tieneCred ? (
                            <span style={{ color: 'var(--green)' }}>🔒 cargada</span>
                          ) : (
                            <span style={{ color: '#fca5a5' }}>falta</span>
                          )
                        ) : (
                          <span style={{ color: 'var(--muted)' }}>—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <button onClick={() => borrar(c.id)} style={{ color: 'var(--muted)' }} title="Quitar">
                          ✕
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Alta / edición */}
          <AltaCuenta tenant={tenant} pasarelas={data.pasarelas} onChange={cargar} setError={setError} />
        </>
      )}
    </div>
  )
}

function AltaCuenta({
  tenant,
  pasarelas,
  onChange,
  setError,
}: {
  tenant: string
  pasarelas: Pasarela[]
  onChange: () => void
  setError: (s: string | null) => void
}) {
  const [proveedor, setProveedor] = useState(pasarelas[0]?.codigo ?? '')
  const [modo, setModo] = useState<'MANUAL' | 'API'>('API')
  const [identificador, setIdentificador] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [credencial, setCredencial] = useState('')
  const [guardando, setGuardando] = useState(false)

  async function guardar() {
    setGuardando(true)
    setError(null)
    try {
      const res = await fetch('/api/cuentas-pasarela', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tenant, proveedor, modo, identificador, descripcion, credencial }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'No se pudo guardar')
      setIdentificador('')
      setDescripcion('')
      setCredencial('')
      onChange()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="pc-panel p-4">
      <div className="mb-3 text-[11px] font-bold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
        Agregar / actualizar cuenta
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select value={proveedor} onChange={(e) => setProveedor(e.target.value)} className="pc-input px-2 py-1.5 text-[11px]">
          {pasarelas.map((p) => (
            <option key={p.codigo} value={p.codigo}>
              {p.nombre}
            </option>
          ))}
        </select>
        <select value={modo} onChange={(e) => setModo(e.target.value as 'MANUAL' | 'API')} className="pc-input px-2 py-1.5 text-[11px]">
          <option value="API">API</option>
          <option value="MANUAL">Archivo</option>
        </select>
        <input
          value={identificador}
          onChange={(e) => setIdentificador(e.target.value)}
          placeholder={modo === 'API' ? 'Identificador (ej. MID de Clover)' : 'Identificador (opcional)'}
          className="pc-input flex-1 px-2 py-1.5 font-mono text-[11px]"
          style={{ minWidth: 200 }}
        />
        <input
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          placeholder="Etiqueta (ej. EL AERO - H5)"
          className="pc-input px-2 py-1.5 text-[11px]"
          style={{ width: 170 }}
        />
      </div>
      {modo === 'API' && (
        <div className="mt-2">
          <input
            type="password"
            value={credencial}
            onChange={(e) => setCredencial(e.target.value)}
            placeholder="Token / credencial de acceso a la pasarela"
            className="pc-input w-full px-2 py-1.5 font-mono text-[11px]"
          />
          <div className="mt-1 text-[9px]" style={{ color: 'var(--muted)' }}>
            🔒 Se guarda cifrada; nunca se muestra de vuelta. Al editar, dejala vacía para conservar la actual.
          </div>
        </div>
      )}
      <div className="mt-3">
        <button
          onClick={guardar}
          disabled={guardando}
          className="rounded-md px-3 py-1.5 text-[11px] font-semibold disabled:opacity-50"
          style={{ background: 'var(--green)', color: '#04140b' }}
        >
          {guardando ? 'Guardando…' : 'Guardar cuenta'}
        </button>
      </div>
    </div>
  )
}
