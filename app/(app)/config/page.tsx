'use client'

import { useEffect, useState } from 'react'

interface Usuario {
  id: string
  email: string
  activo: boolean
}
interface Cliente {
  id: string
  nombre: string
  tiendas: number
  credHiopos: boolean
  apiUser: string | null
  expIdVentas: string | null
  expIdTiendas: string | null
  usuarios: Usuario[]
}

export default function AdminClientesPage() {
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [selId, setSelId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [passNueva, setPassNueva] = useState<{ email: string; password: string } | null>(null)

  const [nuevoNombre, setNuevoNombre] = useState('')

  // Form HIOPOS del cliente seleccionado
  const [apiUser, setApiUser] = useState('')
  const [apiPassword, setApiPassword] = useState('')
  const [expIdVentas, setExpIdVentas] = useState('')
  const [expIdTiendas, setExpIdTiendas] = useState('')
  const [tienePassword, setTienePassword] = useState(false)

  const [nuevoEmail, setNuevoEmail] = useState('')

  const sel = clientes.find((c) => c.id === selId) ?? null

  async function cargar() {
    setError(null)
    try {
      const res = await fetch('/api/admin/clientes')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Error al cargar')
      setClientes(json.clientes as Cliente[])
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
    setApiUser(c.apiUser ?? '')
    setExpIdVentas(c.expIdVentas ?? '')
    setExpIdTiendas(c.expIdTiendas ?? '')
    setTienePassword(c.credHiopos)
    setApiPassword('')
    setNuevoEmail('')
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

  async function guardarConfig() {
    if (!sel) return
    setError(null)
    setAviso(null)
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tenant: sel.nombre, apiUser, apiPassword, expIdVentas, expIdTiendas }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'No se pudo guardar')
      setAviso('Credenciales HIOPOS guardadas.')
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
      setPassNueva({ email: emailRef, password: json.password })
      await cargar()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-5">
        <h1 className="text-lg font-bold tracking-tight">Clientes y credenciales HIOPOS</h1>
        <p className="mt-1 text-[12.5px]" style={{ color: 'var(--muted2)' }}>
          Alta de clientes, sus credenciales del Bridge Hioffice y los usuarios de acceso.
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
      {passNueva && (
        <div
          className="mb-4 rounded-lg border px-4 py-3 text-[12px]"
          style={{ borderColor: 'var(--cyan)', background: 'var(--surface2)' }}
        >
          <div style={{ color: 'var(--muted2)' }}>
            Contraseña generada para <b style={{ color: 'var(--text)' }}>{passNueva.email}</b> (se muestra una sola vez):
          </div>
          <div className="mt-1 font-mono text-[15px]" style={{ color: 'var(--cyan)' }}>
            {passNueva.password}
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-[260px_1fr]">
        {/* Lista de clientes */}
        <div className="pc-panel overflow-hidden">
          <div className="border-b px-3 py-2.5 text-[11px] font-semibold" style={{ borderColor: 'var(--border)' }}>
            Clientes ({clientes.length})
          </div>
          <div className="max-h-[50vh] overflow-y-auto">
            {clientes.map((c) => (
              <button
                key={c.id}
                onClick={() => seleccionar(c)}
                className="flex w-full items-center justify-between border-b px-3 py-2 text-left text-[12px]"
                style={{ borderColor: 'var(--border)', background: c.id === selId ? 'var(--surface3)' : 'transparent' }}
              >
                <span style={{ color: c.id === selId ? 'var(--cyan)' : 'var(--text)' }}>{c.nombre}</span>
                <span
                  className="font-mono text-[9px]"
                  style={{ color: c.credHiopos ? 'var(--green)' : 'var(--muted)' }}
                >
                  {c.credHiopos ? '● HIO' : '○'} · {c.tiendas}🏪 · {c.usuarios.length}👤
                </span>
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 border-t p-2.5" style={{ borderColor: 'var(--border)' }}>
            <input
              value={nuevoNombre}
              onChange={(e) => setNuevoNombre(e.target.value)}
              placeholder="Nuevo cliente"
              className="pc-input flex-1 px-2 py-1.5 text-[11px]"
            />
            <button
              onClick={crearCliente}
              className="rounded-md px-2.5 py-1.5 text-[11px] font-semibold"
              style={{ background: 'var(--green)', color: '#04140b' }}
            >
              +
            </button>
          </div>
        </div>

        {/* Detalle */}
        {!sel ? (
          <div
            className="pc-panel flex items-center justify-center px-4 py-16 text-[12.5px]"
            style={{ color: 'var(--muted)' }}
          >
            Elegí un cliente de la lista, o creá uno nuevo.
          </div>
        ) : (
          <div className="space-y-4">
            {/* Credenciales HIOPOS */}
            <div className="pc-panel p-5">
              <div className="mb-3 text-[12px] font-semibold">{sel.nombre} · Credenciales HIOPOS</div>
              <div className="space-y-3">
                <Campo label="Usuario del Bridge">
                  <input
                    value={apiUser}
                    onChange={(e) => setApiUser(e.target.value)}
                    placeholder="usuario@cliente.com"
                    className="pc-input w-full px-3 py-2 text-sm"
                  />
                </Campo>
                <Campo
                  label="Contraseña del Bridge"
                  hint={tienePassword ? 'Ya hay una guardada · dejala vacía para no cambiarla' : 'Se guarda cifrada'}
                >
                  <input
                    type="password"
                    value={apiPassword}
                    onChange={(e) => setApiPassword(e.target.value)}
                    placeholder={tienePassword ? '•••••••• (guardada)' : 'contraseña'}
                    className="pc-input w-full px-3 py-2 text-sm"
                  />
                </Campo>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Campo label="Exportation ID · Ventas/Cobros">
                    <input
                      value={expIdVentas}
                      onChange={(e) => setExpIdVentas(e.target.value)}
                      placeholder="ej. 1512683"
                      className="pc-input w-full px-3 py-2 font-mono text-sm"
                    />
                  </Campo>
                  <Campo label="Exportation ID · Tiendas">
                    <input
                      value={expIdTiendas}
                      onChange={(e) => setExpIdTiendas(e.target.value)}
                      placeholder="ej. 1512791"
                      className="pc-input w-full px-3 py-2 font-mono text-sm"
                    />
                  </Campo>
                </div>
                <button
                  onClick={guardarConfig}
                  className="rounded-lg px-4 py-2 text-[12px] font-semibold"
                  style={{ background: 'var(--cyan)', color: '#04121a' }}
                >
                  Guardar credenciales
                </button>
              </div>
            </div>

            {/* Usuarios */}
            <div className="pc-panel p-5">
              <div className="mb-3 text-[12px] font-semibold">Usuarios de acceso</div>
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
                    <button
                      onClick={() => usuarioAccion({ accion: 'reset', userId: u.id }, u.email)}
                      className="text-[10.5px] font-semibold"
                      style={{ color: 'var(--amber)' }}
                    >
                      Regenerar contraseña
                    </button>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex items-center gap-2 border-t pt-3" style={{ borderColor: 'var(--border)' }}>
                <input
                  value={nuevoEmail}
                  onChange={(e) => setNuevoEmail(e.target.value)}
                  placeholder="email del nuevo usuario"
                  className="pc-input flex-1 px-2 py-1.5 text-[11px]"
                />
                <button
                  onClick={() => usuarioAccion({ accion: 'crear', tenantId: sel.id, email: nuevoEmail }, nuevoEmail.trim().toLowerCase())}
                  className="rounded-md px-3 py-1.5 text-[11px] font-semibold"
                  style={{ background: 'var(--green)', color: '#04140b' }}
                >
                  + Crear usuario
                </button>
              </div>
            </div>
          </div>
        )}
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
