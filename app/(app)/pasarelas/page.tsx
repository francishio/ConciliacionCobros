'use client'

// Catálogo de pasarelas (ABM super admin): nombre + URL de API. El código es
// estable (lo guardan las cuentas/transacciones); se deriva del nombre al crear.
import { useEffect, useState } from 'react'

interface Pasarela {
  id: string
  codigo: string
  nombre: string
  urlApi: string | null
  orden: number
}

export default function PasarelasPage() {
  const [pasarelas, setPasarelas] = useState<Pasarela[]>([])
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const [nombre, setNombre] = useState('')
  const [urlApi, setUrlApi] = useState('')

  async function cargar() {
    setError(null)
    try {
      const res = await fetch('/api/pasarelas')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Error al cargar')
      setPasarelas(json.pasarelas)
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
    if (!nombre.trim()) {
      setError('Completá el nombre.')
      return
    }
    await guardar({ nombre, urlApi }, 'Pasarela guardada.')
    setNombre('')
    setUrlApi('')
  }

  async function borrar(codigo: string) {
    setError(null)
    setAviso(null)
    try {
      const res = await fetch('/api/pasarelas', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ codigo }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'No se pudo eliminar')
      setAviso('Pasarela eliminada.')
      await cargar()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-5">
        <h1 className="text-lg font-bold tracking-tight">Catálogo de pasarelas</h1>
        <p className="mt-1 text-[12.5px]" style={{ color: 'var(--muted2)' }}>
          Las pasarelas disponibles para asignar a los clientes. Para las que tienen API, indicá su URL base.
        </p>
      </div>

      {error && <div className="pc-error mb-4 px-4 py-2.5 text-[12px]">{error}</div>}
      {aviso && <div className="pc-ok mb-4 px-4 py-2.5 text-[12px]">{aviso}</div>}

      <div className="pc-panel mb-5 overflow-hidden">
        <table className="pc-tabla w-full text-[12px]">
          <thead>
            <tr className="pc-thead text-left text-[9.5px] uppercase tracking-wide">
              <th className="px-3 py-2.5 font-semibold">Código</th>
              <th className="px-3 py-2.5 font-semibold">Nombre</th>
              <th className="px-3 py-2.5 font-semibold">URL de API</th>
              <th className="px-3 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {pasarelas.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center" style={{ color: 'var(--muted)' }}>
                  Todavía no hay pasarelas. Agregá una abajo.
                </td>
              </tr>
            )}
            {pasarelas.map((p) => (
              <FilaPasarela key={p.id} p={p} onGuardar={guardar} onBorrar={borrar} />
            ))}
          </tbody>
        </table>
      </div>

      {/* Alta */}
      <div className="pc-panel p-4">
        <div className="mb-2 text-[11px] font-semibold">Agregar pasarela</div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Nombre (ej. Clover / Fiserv)"
            className="pc-input flex-1 px-2 py-1.5 text-[11px]"
            style={{ minWidth: 180 }}
          />
          <input
            value={urlApi}
            onChange={(e) => setUrlApi(e.target.value)}
            placeholder="URL de API (ej. https://api.la.clover.com)"
            className="pc-input flex-1 px-2 py-1.5 font-mono text-[11px]"
            style={{ minWidth: 200 }}
          />
          <button onClick={agregar} className="pc-btn px-3 py-1.5 text-[11px]">
            + Agregar
          </button>
        </div>
        <div className="mt-2 text-[10px]" style={{ color: 'var(--muted)' }}>
          El código se deriva del nombre (MAYÚSCULAS sin espacios) y queda fijo. Conciliar una pasarela nueva requiere
          su adaptador de ingesta (código).
        </div>
      </div>
    </div>
  )
}

function FilaPasarela({
  p,
  onGuardar,
  onBorrar,
}: {
  p: Pasarela
  onGuardar: (body: Record<string, unknown>, okMsg: string) => Promise<void>
  onBorrar: (codigo: string) => Promise<void>
}) {
  const [editando, setEditando] = useState(false)
  const [editNombre, setEditNombre] = useState(p.nombre)
  const [editUrl, setEditUrl] = useState(p.urlApi ?? '')
  const [guardando, setGuardando] = useState(false)

  function abrir() {
    setEditNombre(p.nombre)
    setEditUrl(p.urlApi ?? '')
    setEditando(true)
  }

  async function guardar() {
    if (!editNombre.trim()) return
    setGuardando(true)
    // El código queda fijo; solo cambian nombre y URL.
    await onGuardar({ codigo: p.codigo, nombre: editNombre, urlApi: editUrl }, 'Pasarela actualizada.')
    setGuardando(false)
    setEditando(false)
  }

  if (editando) {
    return (
      <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface2)' }}>
        <td className="px-3 py-2.5 font-mono font-semibold" style={{ color: 'var(--hio)' }}>
          {p.codigo}
        </td>
        <td className="px-3 py-2">
          <input
            value={editNombre}
            onChange={(e) => setEditNombre(e.target.value)}
            className="pc-input w-full px-2 py-1 text-[11px]"
            placeholder="Nombre"
          />
        </td>
        <td className="px-3 py-2">
          <input
            value={editUrl}
            onChange={(e) => setEditUrl(e.target.value)}
            className="pc-input w-full px-2 py-1 font-mono text-[11px]"
            placeholder="https://… (sin URL si no tiene API)"
          />
        </td>
        <td className="px-3 py-2 text-right">
          <div className="flex items-center justify-end gap-1.5">
            <button onClick={guardar} disabled={guardando} className="pc-btn px-2.5 py-1 text-[10.5px]">
              {guardando ? '…' : 'Guardar'}
            </button>
            <button onClick={() => setEditando(false)} className="px-1.5 text-[12px]" style={{ color: 'var(--muted)' }} title="Cancelar">
              ✕
            </button>
          </div>
        </td>
      </tr>
    )
  }

  return (
    <tr style={{ borderBottom: '1px solid var(--border)' }}>
      <td className="px-3 py-2.5 font-mono font-semibold" style={{ color: 'var(--hio)' }}>
        {p.codigo}
      </td>
      <td className="px-3 py-2.5" style={{ color: 'var(--text)' }}>
        {p.nombre}
      </td>
      <td className="px-3 py-2.5 font-mono text-[11px]" style={{ color: p.urlApi ? 'var(--muted2)' : 'var(--muted)' }}>
        {p.urlApi || '— (sin URL)'}
      </td>
      <td className="px-3 py-2.5 text-right">
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={abrir}
            className="rounded-md border px-2.5 py-1 text-[10.5px] font-semibold"
            style={{ borderColor: 'var(--border2)', color: 'var(--hio)' }}
            title="Editar nombre y URL"
          >
            Editar
          </button>
          <button onClick={() => onBorrar(p.codigo)} style={{ color: 'var(--muted)' }} title="Eliminar">
            ✕
          </button>
        </div>
      </td>
    </tr>
  )
}
