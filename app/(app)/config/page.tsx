'use client'

// Clientes (super admin): consolida los datos del cliente (nombre + nº BD +
// credenciales HIOPOS), las pasarelas asignadas (cuentas MID+token con mapeo
// opcional a establecimiento/terminal) y los usuarios de acceso.
import { useEffect, useMemo, useState } from 'react'

interface Usuario {
  id: string
  email: string
  activo: boolean
}
interface Cliente {
  id: string
  nombre: string
  numeroBD: string | null
  tiendas: number
  credHiopos: boolean
  apiUser: string | null
  expIdVentas: string | null
  usuarios: Usuario[]
  pasarelasAsignadas: string[]
  ultimaVentaHio: string | null
  ultimoCobroPasarela: string | null
}
interface PasarelaCat {
  codigo: string
  nombre: string
}

function fmtFecha(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

export default function AdminClientesPage() {
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [pasarelasCat, setPasarelasCat] = useState<PasarelaCat[]>([])
  const [selId, setSelId] = useState<string | null>(null)
  // Qué panel de edición está abierto (uno por vez; se abre al clickear su columna)
  const [panel, setPanel] = useState<null | 'datos' | 'pasarelas' | 'usuarios'>(null)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [passNueva, setPassNueva] = useState<{ email: string; password: string; generada: boolean } | null>(null)

  const [nuevoNombre, setNuevoNombre] = useState('')

  // Datos del cliente seleccionado
  const [numeroBD, setNumeroBD] = useState('')
  const [apiUser, setApiUser] = useState('')
  const [apiPassword, setApiPassword] = useState('')
  const [expIdVentas, setExpIdVentas] = useState('')
  const [tienePassword, setTienePassword] = useState(false)

  const [nuevoEmail, setNuevoEmail] = useState('')
  const [nuevaPass, setNuevaPass] = useState('')

  const sel = clientes.find((c) => c.id === selId) ?? null

  // Orden + filtros de la tabla
  const [sortKey, setSortKey] = useState('nombre')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [fId, setFId] = useState('')
  const [fBD, setFBD] = useState('')
  const [fNombre, setFNombre] = useState('')
  const [fHio, setFHio] = useState<'' | 'si' | 'no'>('')
  const [fPas, setFPas] = useState<Record<string, '' | 'si' | 'no'>>({})

  function toggleSort(k: string) {
    if (sortKey === k) setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    else {
      setSortKey(k)
      setSortDir('asc')
    }
  }
  const flecha = (k: string) => (sortKey === k ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '')

  function valor(c: Cliente, k: string): string | number {
    if (k === 'id') return c.id
    if (k === 'numeroBD') return c.numeroBD ?? ''
    if (k === 'nombre') return c.nombre.toLowerCase()
    if (k === 'hiopos') return c.credHiopos ? 1 : 0
    if (k === 'usuarios') return c.usuarios.length
    if (k === 'ultVenta') return c.ultimaVentaHio ?? ''
    if (k === 'ultCobro') return c.ultimoCobroPasarela ?? ''
    if (k.startsWith('pas:')) return c.pasarelasAsignadas.includes(k.slice(4)) ? 1 : 0
    return ''
  }

  const visibles = useMemo(() => {
    const arr = clientes.filter((c) => {
      if (fId && !c.id.toLowerCase().includes(fId.toLowerCase())) return false
      if (fBD && !(c.numeroBD ?? '').toLowerCase().includes(fBD.toLowerCase())) return false
      if (fNombre && !c.nombre.toLowerCase().includes(fNombre.toLowerCase())) return false
      if (fHio && (c.credHiopos ? 'si' : 'no') !== fHio) return false
      for (const [cod, v] of Object.entries(fPas)) {
        if (v && (c.pasarelasAsignadas.includes(cod) ? 'si' : 'no') !== v) return false
      }
      return true
    })
    arr.sort((a, b) => {
      const va = valor(a, sortKey)
      const vb = valor(b, sortKey)
      const cmp =
        typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb))
      return sortDir === 'asc' ? cmp : -cmp
    })
    return arr
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientes, sortKey, sortDir, fId, fBD, fNombre, fHio, fPas])

  async function cargar() {
    setError(null)
    try {
      const res = await fetch('/api/admin/clientes')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Error al cargar')
      setClientes(json.clientes as Cliente[])
      setPasarelasCat(json.pasarelas as PasarelaCat[])
    } catch (e) {
      setError((e as Error).message)
    }
  }

  useEffect(() => {
    cargar()
  }, [])

  function seleccionar(c: Cliente) {
    setSelId(c.id)
    setError(null)
    setAviso(null)
    setPassNueva(null)
    setNumeroBD(c.numeroBD ?? '')
    setApiUser(c.apiUser ?? '')
    setExpIdVentas(c.expIdVentas ?? '')
    setTienePassword(c.credHiopos)
    setApiPassword('')
    setNuevoEmail('')
  }

  // Abre un panel (datos/pasarelas/usuarios) para un cliente. Abrir uno cierra el
  // anterior (es un solo panel por vez).
  function abrirPanel(c: Cliente, p: 'datos' | 'pasarelas' | 'usuarios') {
    seleccionar(c)
    setPanel(p)
  }

  async function crearCliente() {
    if (!nuevoNombre.trim()) return
    setError(null)
    setAviso(null)
    try {
      const res = await fetch('/api/admin/clientes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ nombre: nuevoNombre }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'No se pudo crear')
      setNuevoNombre('')
      setAviso('Cliente creado.')
      await cargar()
      setSelId(json.id)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function guardarDatos() {
    if (!sel) return
    setError(null)
    setAviso(null)
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tenant: sel.nombre, numeroBD, apiUser, apiPassword, expIdVentas }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'No se pudo guardar')
      setAviso('Datos del cliente guardados.')
      setApiPassword('')
      await cargar()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function usuarioAccion(body: Record<string, unknown>, emailRef: string) {
    setError(null)
    setAviso(null)
    setPassNueva(null)
    try {
      const res = await fetch('/api/admin/usuarios', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'No se pudo')
      setPassNueva({ email: emailRef, password: json.password, generada: !!json.generada })
      setNuevaPass('')
      await cargar()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function eliminarUsuario(u: Usuario) {
    if (!window.confirm(`¿Eliminar al usuario ${u.email}? No podrá ingresar más. No se puede deshacer.`)) return
    setError(null)
    setAviso(null)
    setPassNueva(null)
    try {
      const res = await fetch('/api/admin/usuarios', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId: u.id }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'No se pudo eliminar')
      setAviso(`Usuario ${u.email} eliminado.`)
      await cargar()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  function copiarPass(txt: string) {
    navigator.clipboard
      ?.writeText(txt)
      .then(() => setAviso('Contraseña copiada al portapapeles.'))
      .catch(() => {})
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-5">
        <h1 className="text-lg font-bold tracking-tight">Clientes</h1>
        <p className="mt-1 text-[12.5px]" style={{ color: 'var(--muted2)' }}>
          Datos del cliente, credenciales HIOPOS, pasarelas asignadas y usuarios de acceso.
        </p>
      </div>

      {error && <div className="pc-error mb-4 px-4 py-2.5 text-[12px]">{error}</div>}
      {aviso && <div className="pc-ok mb-4 px-4 py-2.5 text-[12px]">{aviso}</div>}

      {/* Tabla panorámica de clientes */}
      <div className="pc-panel mb-4 overflow-x-auto">
        <table className="pc-tabla w-full text-[11.5px]">
          <thead>
            <tr className="pc-thead text-left text-[9px] uppercase tracking-wide">
              <th onClick={() => toggleSort('id')} className="cursor-pointer select-none px-2.5 py-2 font-semibold">
                ID{flecha('id')}
              </th>
              <th onClick={() => toggleSort('numeroBD')} className="cursor-pointer select-none px-2.5 py-2 font-semibold">
                Nº BD{flecha('numeroBD')}
              </th>
              <th onClick={() => toggleSort('nombre')} className="cursor-pointer select-none px-2.5 py-2 font-semibold">
                Cliente{flecha('nombre')}
              </th>
              <th onClick={() => toggleSort('hiopos')} className="cursor-pointer select-none px-2.5 py-2 text-center font-semibold">
                HIOPOS{flecha('hiopos')}
              </th>
              {pasarelasCat.map((p) => (
                <th
                  key={p.codigo}
                  onClick={() => toggleSort(`pas:${p.codigo}`)}
                  className="cursor-pointer select-none px-2.5 py-2 text-center font-semibold"
                >
                  {p.nombre}
                  {flecha(`pas:${p.codigo}`)}
                </th>
              ))}
              <th onClick={() => toggleSort('usuarios')} className="cursor-pointer select-none px-2.5 py-2 text-center font-semibold">
                Usuarios{flecha('usuarios')}
              </th>
              <th onClick={() => toggleSort('ultVenta')} className="cursor-pointer select-none px-2.5 py-2 font-semibold">
                Últ. venta HIO{flecha('ultVenta')}
              </th>
              <th onClick={() => toggleSort('ultCobro')} className="cursor-pointer select-none px-2.5 py-2 font-semibold">
                Últ. cobro pas.{flecha('ultCobro')}
              </th>
            </tr>
            {/* Fila de filtros */}
            <tr style={{ background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>
              <td className="px-1.5 py-1.5">
                <input value={fId} onChange={(e) => setFId(e.target.value)} placeholder="filtrar" className="pc-input w-full px-1.5 py-1 text-[10px]" />
              </td>
              <td className="px-1.5 py-1.5">
                <input value={fBD} onChange={(e) => setFBD(e.target.value)} placeholder="filtrar" className="pc-input w-full px-1.5 py-1 text-[10px]" />
              </td>
              <td className="px-1.5 py-1.5">
                <input value={fNombre} onChange={(e) => setFNombre(e.target.value)} placeholder="filtrar" className="pc-input w-full px-1.5 py-1 text-[10px]" />
              </td>
              <td className="px-1.5 py-1.5">
                <select value={fHio} onChange={(e) => setFHio(e.target.value as '' | 'si' | 'no')} className="pc-input w-full px-1 py-1 text-[10px]">
                  <option value="">Todos</option>
                  <option value="si">✓</option>
                  <option value="no">✗</option>
                </select>
              </td>
              {pasarelasCat.map((p) => (
                <td key={p.codigo} className="px-1.5 py-1.5">
                  <select
                    value={fPas[p.codigo] ?? ''}
                    onChange={(e) => setFPas({ ...fPas, [p.codigo]: e.target.value as '' | 'si' | 'no' })}
                    className="pc-input w-full px-1 py-1 text-[10px]"
                  >
                    <option value="">Todas</option>
                    <option value="si">✓</option>
                    <option value="no">✗</option>
                  </select>
                </td>
              ))}
              <td></td>
              <td></td>
              <td></td>
            </tr>
          </thead>
          <tbody>
            {visibles.length === 0 && (
              <tr>
                <td colSpan={5 + pasarelasCat.length} className="px-2.5 py-4 text-center" style={{ color: 'var(--muted)' }}>
                  Sin resultados con esos filtros.
                </td>
              </tr>
            )}
            {visibles.map((c) => {
              const on = c.id === selId
              return (
                <tr
                  key={c.id}
                  style={{ borderTop: '1px solid var(--border)', background: on ? 'var(--surface3)' : 'transparent' }}
                >
                  <td className="px-2.5 py-2 font-mono text-[10px]" style={{ color: 'var(--muted)' }} title={c.id}>
                    {c.id.slice(0, 8)}
                  </td>
                  <td className="px-2.5 py-2 font-mono" style={{ color: 'var(--muted2)' }}>
                    {c.numeroBD || '—'}
                  </td>
                  <td className="px-2.5 py-2 font-semibold" style={{ color: on ? 'var(--hio)' : 'var(--text)' }}>
                    {c.nombre}
                  </td>
                  <td
                    onClick={() => abrirPanel(c, 'datos')}
                    className="cursor-pointer px-2.5 py-2 text-center hover:bg-black/5"
                    title="Editar datos y credenciales HIOPOS"
                  >
                    {c.credHiopos ? (
                      <span style={{ color: 'var(--green)' }}>✓</span>
                    ) : (
                      <span className="font-semibold" style={{ color: 'var(--red)' }}>
                        ✗ cargar
                      </span>
                    )}
                  </td>
                  {pasarelasCat.map((p) => {
                    const tiene = c.pasarelasAsignadas.includes(p.codigo)
                    return (
                      <td
                        key={p.codigo}
                        onClick={() => abrirPanel(c, 'pasarelas')}
                        className="cursor-pointer px-2.5 py-2 text-center hover:bg-black/5"
                        title={tiene ? 'Asignada · editar pasarelas' : 'Dar de alta pasarela'}
                      >
                        {tiene ? <span style={{ color: 'var(--hio)' }}>✓</span> : <span style={{ color: 'var(--muted)' }}>+ alta</span>}
                      </td>
                    )
                  })}
                  <td
                    onClick={() => abrirPanel(c, 'usuarios')}
                    className="cursor-pointer px-2.5 py-2 text-center hover:bg-black/5"
                    style={{ color: 'var(--muted2)' }}
                    title="Ver / crear usuarios"
                  >
                    {c.usuarios.length}
                  </td>
                  <td className="px-2.5 py-2" style={{ color: 'var(--muted2)' }}>
                    {fmtFecha(c.ultimaVentaHio)}
                  </td>
                  <td className="px-2.5 py-2" style={{ color: 'var(--muted2)' }}>
                    {fmtFecha(c.ultimoCobroPasarela)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <div className="flex items-center gap-2 border-t p-2.5" style={{ borderColor: 'var(--border)' }}>
          <input
            value={nuevoNombre}
            onChange={(e) => setNuevoNombre(e.target.value)}
            placeholder="Nuevo cliente"
            className="pc-input px-2 py-1.5 text-[11px]"
            style={{ width: 200 }}
          />
          <button onClick={crearCliente} className="pc-btn px-3 py-1.5 text-[11px]">
            + Crear cliente
          </button>
        </div>
      </div>

      {sel && panel === 'datos' && (
        <div className="space-y-4">
            {/* Datos + HIOPOS */}
            <div className="pc-panel p-5">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-[12px] font-semibold">{sel.nombre} · Datos y credenciales HIOPOS</div>
                <button
                  onClick={() => setPanel(null)}
                  className="rounded-md border px-2.5 py-1 text-[11px] font-semibold"
                  style={{ borderColor: 'var(--border2)', color: 'var(--muted2)' }}
                >
                  ✕ Cerrar
                </button>
              </div>
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Campo label="Número de base de datos">
                    <input
                      value={numeroBD}
                      onChange={(e) => setNumeroBD(e.target.value)}
                      placeholder="ej. 1234"
                      className="pc-input w-full px-3 py-2 font-mono text-sm"
                    />
                  </Campo>
                  <Campo label="Usuario del Bridge">
                    <input
                      value={apiUser}
                      onChange={(e) => setApiUser(e.target.value)}
                      placeholder="usuario@cliente.com"
                      className="pc-input w-full px-3 py-2 text-sm"
                    />
                  </Campo>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Campo label="Contraseña del Bridge" hint={tienePassword ? 'Ya hay una · vacía = no cambiar' : 'Se guarda cifrada'}>
                    <input
                      type="password"
                      value={apiPassword}
                      onChange={(e) => setApiPassword(e.target.value)}
                      placeholder={tienePassword ? '•••••••• (guardada)' : 'contraseña'}
                      className="pc-input w-full px-3 py-2 text-sm"
                    />
                  </Campo>
                  <Campo label="Exportation ID (ventas integradas)">
                    <input
                      value={expIdVentas}
                      onChange={(e) => setExpIdVentas(e.target.value)}
                      placeholder="ej. 1513955"
                      className="pc-input w-full px-3 py-2 font-mono text-sm"
                    />
                  </Campo>
                </div>
                <button onClick={guardarDatos} className="pc-btn px-4 py-2 text-[12px]">
                  Guardar datos
                </button>
              </div>
            </div>
        </div>
      )}

      {sel && panel === 'pasarelas' && (
        <div className="space-y-4">
          <PasarelasCliente tenant={sel.nombre} onError={setError} onClose={() => setPanel(null)} />
        </div>
      )}

      {sel && panel === 'usuarios' && (
        <div className="space-y-4">
            {/* Usuarios */}
            <div className="pc-panel p-5">
              <div className="mb-1 flex items-center justify-between">
                <div className="text-[12px] font-semibold">Usuarios de acceso</div>
                <button
                  onClick={() => setPanel(null)}
                  className="rounded-md border px-2.5 py-1 text-[11px] font-semibold"
                  style={{ borderColor: 'var(--border2)', color: 'var(--muted2)' }}
                >
                  ✕ Cerrar
                </button>
              </div>
              <div className="mb-3 text-[10.5px]" style={{ color: 'var(--muted)' }}>
                Entran y ven solo el menú de Conciliación.
              </div>
              <div className="space-y-1.5">
                {sel.usuarios.length === 0 && (
                  <div className="text-[11px]" style={{ color: 'var(--muted)' }}>
                    Sin usuarios. Creá uno abajo.
                  </div>
                )}
                {sel.usuarios.map((u) => (
                  <div
                    key={u.id}
                    className="flex items-center justify-between rounded-md px-3 py-1.5 text-[12px]"
                    style={{ background: 'var(--surface2)' }}
                  >
                    <span style={{ color: 'var(--text)' }}>{u.email}</span>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => usuarioAccion({ accion: 'reset', userId: u.id }, u.email)}
                        className="text-[10.5px] font-semibold"
                        style={{ color: 'var(--amber)' }}
                        title="Le pone una contraseña NUEVA al usuario (por si la olvidó). Se muestra una sola vez."
                      >
                        Cambiar contraseña
                      </button>
                      <button
                        onClick={() => eliminarUsuario(u)}
                        className="text-[10.5px] font-semibold"
                        style={{ color: 'var(--red)' }}
                        title="Elimina el usuario. No podrá ingresar más."
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3" style={{ borderColor: 'var(--border)' }}>
                <input
                  value={nuevoEmail}
                  onChange={(e) => setNuevoEmail(e.target.value)}
                  placeholder="email del nuevo usuario"
                  className="pc-input flex-1 px-2 py-1.5 text-[11px]"
                  style={{ minWidth: 180 }}
                />
                <input
                  type="text"
                  value={nuevaPass}
                  onChange={(e) => setNuevaPass(e.target.value)}
                  placeholder="contraseña (opcional)"
                  className="pc-input px-2 py-1.5 font-mono text-[11px]"
                  style={{ width: 170 }}
                />
                <button
                  onClick={() => usuarioAccion({ accion: 'crear', tenantId: sel.id, email: nuevoEmail, password: nuevaPass }, nuevoEmail.trim().toLowerCase())}
                  className="pc-btn px-3 py-1.5 text-[11px]"
                >
                  + Crear usuario
                </button>
              </div>
              <div className="mt-1 text-[10px]" style={{ color: 'var(--muted)' }}>
                Si dejás la contraseña vacía, se genera una automática (se muestra una vez). “Cambiar contraseña” le pone
                una nueva a un usuario existente.
              </div>

              {passNueva && (
                <div className="mt-3 rounded-lg border p-3" style={{ borderColor: 'var(--hio)', background: 'var(--surface2)' }}>
                  <div className="text-[11px]" style={{ color: 'var(--muted2)' }}>
                    Contraseña {passNueva.generada ? 'generada' : 'definida'} para{' '}
                    <b style={{ color: 'var(--text)' }}>{passNueva.email}</b>
                    {passNueva.generada ? ' — anotala, se muestra una sola vez' : ''}:
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <code className="font-mono text-[15px]" style={{ color: 'var(--hio)' }}>
                      {passNueva.password}
                    </code>
                    <button
                      onClick={() => copiarPass(passNueva.password)}
                      className="rounded-md border px-2 py-0.5 text-[10.5px] font-semibold"
                      style={{ borderColor: 'var(--border2)', color: 'var(--muted2)' }}
                    >
                      Copiar
                    </button>
                    <button onClick={() => setPassNueva(null)} className="text-[12px]" style={{ color: 'var(--muted)' }} title="Ocultar">
                      ✕
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
    </div>
  )
}

// ─── Pasarelas asignadas al cliente (cuentas MID+token + mapeo opcional) ───
interface Cuenta {
  id: string
  proveedor: string
  modo: 'MANUAL' | 'API'
  identificador: string
  descripcion: string | null
  tieneCred: boolean
  establecimientoId: string | null
  establecimientoNombre: string | null
  terminal: string | null
}
interface Pasarela {
  codigo: string
  nombre: string
}
interface Terminal {
  cod: string
  alias: string | null
}
interface Estab {
  id: string
  nombre: string
  codTienda: string | null
  terminales: Terminal[]
}
interface Medio {
  codMedioPago: string
  medioPago: string
  proveedor: string | null
}

function PasarelasCliente({ tenant, onError, onClose }: { tenant: string; onError: (s: string | null) => void; onClose: () => void }) {
  const [cuentas, setCuentas] = useState<Cuenta[]>([])
  const [pasarelas, setPasarelas] = useState<Pasarela[]>([])
  const [establecimientos, setEstablecimientos] = useState<Estab[]>([])
  const [medios, setMedios] = useState<Medio[]>([])
  const [cargando, setCargando] = useState(false)

  // Form (visible solo al crear o editar)
  const [formOpen, setFormOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [proveedor, setProveedor] = useState('')
  const [modo, setModo] = useState<'MANUAL' | 'API'>('API')
  const [identificador, setIdentificador] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [credencial, setCredencial] = useState('')
  const [establecimientoId, setEstablecimientoId] = useState('')
  const [terminal, setTerminal] = useState('')
  const [mediosSel, setMediosSel] = useState<string[]>([])
  const [guardando, setGuardando] = useState(false)

  const mediosDe = (prov: string) => medios.filter((m) => m.proveedor === prov).map((m) => m.codMedioPago)
  const toggleMedio = (cod: string) => setMediosSel((s) => (s.includes(cod) ? s.filter((c) => c !== cod) : [...s, cod]))

  // Probar conexión Clover: trae nombre del comercio + dispositivos.
  const [probando, setProbando] = useState(false)
  const [comercio, setComercio] = useState<{
    nombre: string
    dispositivos: { id: string; serial: string | null; modelo: string | null; nombre: string | null }[]
  } | null>(null)
  async function probarConexion() {
    setProbando(true)
    setComercio(null)
    onError(null)
    try {
      const res = await fetch('/api/cuentas-pasarela/clover-info', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tenant, cuentaId: editId, mid: identificador.trim(), token: credencial.trim() }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'No se pudo conectar')
      setComercio(json)
    } catch (e) {
      onError((e as Error).message)
    } finally {
      setProbando(false)
    }
  }

  async function cargar() {
    setCargando(true)
    try {
      const res = await fetch(`/api/cuentas-pasarela?tenant=${encodeURIComponent(tenant)}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Error al cargar')
      setCuentas(json.cuentas)
      setPasarelas(json.pasarelas)
      setEstablecimientos(json.establecimientos)
      setMedios(json.medios)
    } catch (e) {
      onError((e as Error).message)
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => {
    setFormOpen(false)
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant])

  function cambiarProveedor(v: string) {
    setProveedor(v)
    setMediosSel(medios.filter((m) => m.proveedor === v).map((m) => m.codMedioPago))
  }

  function abrirCrear() {
    onError(null)
    const prov = pasarelas[0]?.codigo ?? ''
    setEditId(null)
    setProveedor(prov)
    setModo('API')
    setIdentificador('')
    setDescripcion('')
    setCredencial('')
    setEstablecimientoId('')
    setTerminal('')
    setMediosSel(mediosDe(prov))
    setFormOpen(true)
  }

  function abrirEditar(c: Cuenta) {
    onError(null)
    setEditId(c.id)
    setProveedor(c.proveedor)
    setModo(c.modo)
    setIdentificador(c.identificador)
    setDescripcion(c.descripcion ?? '')
    setCredencial('')
    setEstablecimientoId(c.establecimientoId ?? '')
    setTerminal(c.terminal ?? '')
    setMediosSel(mediosDe(c.proveedor))
    setFormOpen(true)
  }

  async function guardar() {
    setGuardando(true)
    onError(null)
    try {
      const res = await fetch('/api/cuentas-pasarela', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          tenant,
          id: editId ?? undefined,
          proveedor,
          modo,
          identificador,
          descripcion,
          credencial,
          establecimientoId: establecimientoId || null,
          terminal,
          medios: mediosSel,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'No se pudo guardar')
      setFormOpen(false)
      setEditId(null)
      await cargar()
    } catch (e) {
      onError((e as Error).message)
    } finally {
      setGuardando(false)
    }
  }

  async function borrar(id: string) {
    onError(null)
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
      onError((e as Error).message)
    }
  }

  const nombrePasarela = (cod: string) => pasarelas.find((p) => p.codigo === cod)?.nombre ?? cod
  const alcance = (c: Cuenta) => {
    if (!c.establecimientoId) return 'Todo'
    let s = c.establecimientoNombre ?? 'estab.'
    if (c.terminal) {
      const t = establecimientos.find((e) => e.id === c.establecimientoId)?.terminales.find((x) => x.cod === c.terminal)
      s += ` · ${t?.alias ?? `term. ${c.terminal}`}`
    }
    return s
  }
  const termsForm = establecimientos.find((e) => e.id === establecimientoId)?.terminales ?? []

  return (
    <div className="pc-panel p-5">
      <div className="mb-1 flex items-center justify-between">
        <div className="text-[12px] font-semibold">Pasarelas asignadas</div>
        <button
          onClick={onClose}
          className="rounded-md border px-2.5 py-1 text-[11px] font-semibold"
          style={{ borderColor: 'var(--border2)', color: 'var(--muted2)' }}
        >
          ✕ Cerrar
        </button>
      </div>
      <div className="mb-3 text-[10.5px]" style={{ color: 'var(--muted)' }}>
        Una fila por cuenta/comercio (ej. Clover: un MID + token). Editá para cambiar datos o agregá otra con “Crear”.
      </div>

      {/* Lista */}
      <div className="mb-3 overflow-hidden rounded-lg border" style={{ borderColor: 'var(--border)' }}>
        <table className="pc-tabla w-full text-[11.5px]">
          <thead>
            <tr className="pc-thead text-left text-[9px] uppercase tracking-wide">
              <th className="px-2.5 py-2 font-semibold">Pasarela</th>
              <th className="px-2.5 py-2 font-semibold">Modo</th>
              <th className="px-2.5 py-2 font-semibold">Identificador</th>
              <th className="px-2.5 py-2 font-semibold">Etiqueta</th>
              <th className="px-2.5 py-2 font-semibold">Medios</th>
              <th className="px-2.5 py-2 font-semibold">Concilia contra</th>
              <th className="px-2.5 py-2 font-semibold">Cred.</th>
              <th className="px-2.5 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {cuentas.length === 0 && (
              <tr>
                <td colSpan={8} className="px-2.5 py-4 text-center" style={{ color: 'var(--muted)' }}>
                  {cargando ? 'Cargando…' : 'Sin pasarelas asignadas.'}
                </td>
              </tr>
            )}
            {cuentas.map((c) => {
              const med = mediosDe(c.proveedor)
              return (
                <tr key={c.id} style={{ borderTop: '1px solid var(--border)', background: editId === c.id ? 'var(--surface2)' : 'transparent' }}>
                  <td className="px-2.5 py-2 font-semibold" style={{ color: 'var(--hio)' }}>
                    {nombrePasarela(c.proveedor)}
                  </td>
                  <td className="px-2.5 py-2">{c.modo === 'API' ? 'API' : 'archivo'}</td>
                  <td className="px-2.5 py-2 font-mono">{c.identificador || '—'}</td>
                  <td className="px-2.5 py-2" style={{ color: 'var(--muted2)' }}>
                    {c.descripcion || '—'}
                  </td>
                  <td className="px-2.5 py-2 font-mono" style={{ color: med.length ? 'var(--text)' : 'var(--muted)' }}>
                    {med.length ? med.join(', ') : '—'}
                  </td>
                  <td className="px-2.5 py-2" style={{ color: c.establecimientoId ? 'var(--text)' : 'var(--muted2)' }}>
                    {alcance(c)}
                  </td>
                  <td className="px-2.5 py-2">
                    {c.modo === 'API' ? (c.tieneCred ? <span style={{ color: 'var(--green)' }}>🔒</span> : <span style={{ color: 'var(--red)' }}>falta</span>) : '—'}
                  </td>
                  <td className="px-2.5 py-2 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => abrirEditar(c)}
                        className="rounded-md border px-2 py-0.5 text-[10.5px] font-semibold"
                        style={{ borderColor: 'var(--border2)', color: 'var(--hio)' }}
                      >
                        Editar
                      </button>
                      <button onClick={() => borrar(c.id)} style={{ color: 'var(--muted)' }} title="Quitar">
                        ✕
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Botón Crear o formulario */}
      {!formOpen ? (
        <button onClick={abrirCrear} className="pc-btn px-3 py-1.5 text-[11px]">
          + Crear pasarela
        </button>
      ) : (
        <div className="rounded-lg border p-3" style={{ borderColor: 'var(--hio)', background: 'var(--surface2)' }}>
          <div className="mb-2 flex items-center justify-between">
            <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
              {editId ? `Editando ${nombrePasarela(proveedor)}` : 'Nueva cuenta de pasarela'}
            </div>
            <button
              onClick={() => {
                setFormOpen(false)
                setEditId(null)
              }}
              className="rounded-md border px-2 py-0.5 text-[10.5px] font-semibold"
              style={{ borderColor: 'var(--border2)', color: 'var(--muted2)' }}
            >
              ✕ Cerrar
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select value={proveedor} onChange={(e) => cambiarProveedor(e.target.value)} className="pc-input px-2 py-1.5 text-[11px]">
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
              placeholder={modo === 'API' ? 'Identificador (MID de Clover)' : 'Identificador (opcional)'}
              className="pc-input flex-1 px-2 py-1.5 font-mono text-[11px]"
              style={{ minWidth: 180 }}
            />
            <input
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Etiqueta (ej. EL AERO - H5)"
              className="pc-input px-2 py-1.5 text-[11px]"
              style={{ width: 160 }}
            />
          </div>
          {modo === 'API' && (
            <input
              type="password"
              value={credencial}
              onChange={(e) => setCredencial(e.target.value)}
              placeholder={editId ? 'Token (vacío = conservar el actual)' : 'Token / credencial de acceso'}
              className="pc-input mt-2 w-full px-2 py-1.5 font-mono text-[11px]"
            />
          )}

          {proveedor === 'CLOVER' && modo === 'API' && (
            <div className="mt-2">
              <button
                type="button"
                onClick={probarConexion}
                disabled={probando}
                className="rounded-md border px-2.5 py-1 text-[11px] font-semibold disabled:opacity-50"
                style={{ borderColor: 'var(--border2)', color: 'var(--hio)' }}
              >
                {probando ? 'Probando…' : '🔌 Probar conexión / ver dispositivos'}
              </button>
              {comercio && (
                <div className="mt-2 rounded-lg border p-2.5 text-[11px]" style={{ borderColor: 'var(--border)', background: 'var(--surface2)' }}>
                  <div className="mb-1">
                    <span style={{ color: 'var(--muted)' }}>Comercio:</span> <span className="font-semibold">{comercio.nombre}</span>
                  </div>
                  <div className="mb-1" style={{ color: 'var(--muted)' }}>Dispositivos ({comercio.dispositivos.length}):</div>
                  {comercio.dispositivos.length === 0 ? (
                    <div style={{ color: 'var(--muted)' }}>— (el token no tiene permiso de dispositivos, o el comercio no tiene)</div>
                  ) : (
                    <ul className="space-y-0.5">
                      {comercio.dispositivos.map((d) => (
                        <li key={d.id} className="font-mono">
                          {d.nombre ? `${d.nombre} · ` : ''}
                          {d.modelo ?? '—'} · serial {d.serial ?? '—'} · <span style={{ color: 'var(--muted2)' }}>id {d.id}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Medios de pago de HIOPOS que mapean a esta pasarela (multi-selección) */}
          <div className="mt-3">
            <div className="mb-1 text-[10px] uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
              Medios de pago de HIOPOS en esta pasarela (podés elegir varios)
            </div>
            {medios.length === 0 ? (
              <div className="text-[10.5px]" style={{ color: 'var(--muted)' }}>
                Todavía no hay medios — aparecen al sincronizar las ventas de HIOPOS.
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {medios.map((m) => {
                  const on = mediosSel.includes(m.codMedioPago)
                  const otro = !on && m.proveedor && m.proveedor !== proveedor
                  return (
                    <button
                      key={m.codMedioPago}
                      type="button"
                      onClick={() => toggleMedio(m.codMedioPago)}
                      title={otro ? `Hoy mapeado a ${m.proveedor} — al marcarlo pasa a esta pasarela` : undefined}
                      className="rounded-full border px-2 py-0.5 text-[10.5px]"
                      style={
                        on
                          ? { background: 'var(--hio)', color: '#fff', borderColor: 'var(--hio)' }
                          : { background: 'var(--surface)', color: otro ? 'var(--amber)' : 'var(--muted2)', borderColor: 'var(--border2)' }
                      }
                    >
                      <span className="font-mono">{m.codMedioPago}</span> · {m.medioPago}
                      {otro ? ' ⚠' : ''}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
              Concilia contra:
            </span>
            <select
              value={establecimientoId}
              onChange={(e) => {
                setEstablecimientoId(e.target.value)
                if (!e.target.value) setTerminal('')
              }}
              className="pc-input px-2 py-1.5 text-[11px]"
            >
              <option value="">Todo (sin mapear)</option>
              {establecimientos.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.codTienda ? `${e.codTienda} · ` : ''}
                  {e.nombre}
                </option>
              ))}
            </select>
            <select
              value={terminal}
              onChange={(e) => setTerminal(e.target.value)}
              disabled={!establecimientoId || termsForm.length === 0}
              className="pc-input px-2 py-1.5 text-[11px] disabled:opacity-40"
              style={{ width: 170 }}
              title={establecimientoId && termsForm.length === 0 ? 'Esta tienda todavía no tiene terminales cargadas' : undefined}
            >
              <option value="">(toda la tienda)</option>
              {termsForm.map((t) => (
                <option key={t.cod} value={t.cod}>
                  {t.alias ? `${t.alias} (${t.cod})` : t.cod}
                </option>
              ))}
            </select>
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={() => {
                  setFormOpen(false)
                  setEditId(null)
                }}
                className="rounded-md border px-3 py-1.5 text-[11px] font-semibold"
                style={{ borderColor: 'var(--border2)', color: 'var(--muted2)' }}
              >
                Cerrar
              </button>
              <button onClick={guardar} disabled={guardando} className="pc-btn px-3 py-1.5 text-[11px]">
                {guardando ? 'Guardando…' : editId ? 'Guardar cambios' : 'Crear cuenta'}
              </button>
            </div>
          </div>
        </div>
      )}
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
