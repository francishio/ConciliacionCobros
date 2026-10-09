'use client'

// Sugerencias: cada usuario crea las suyas y ve solo las suyas. ICG (SUPERADMIN)
// ve todas, comenta y cambia el estado.
import { useEffect, useState } from 'react'

interface Sugerencia {
  id: string
  usuario: string
  fecha: string
  descripcion: string
  comentarioHio: string | null
  estado: 'NUEVO' | 'ACEPTADO' | 'RECHAZADO' | 'IMPLEMENTADO'
}

const ESTADOS = ['NUEVO', 'ACEPTADO', 'RECHAZADO', 'IMPLEMENTADO'] as const
const COLOR_ESTADO: Record<string, string> = {
  NUEVO: 'var(--muted2)',
  ACEPTADO: 'var(--green)',
  RECHAZADO: 'var(--red)',
  IMPLEMENTADO: 'var(--hio)',
}
const fmtFecha = (s: string) => {
  const d = new Date(s)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

export default function SugerenciasPage() {
  const [items, setItems] = useState<Sugerencia[]>([])
  const [esAdmin, setEsAdmin] = useState(false)
  const [nueva, setNueva] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [f, setF] = useState<Record<string, string>>({})

  async function cargar() {
    setError(null)
    try {
      const res = await fetch('/api/sugerencias')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Error al cargar')
      setItems(json.sugerencias)
      setEsAdmin(json.esAdmin)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  useEffect(() => {
    cargar()
  }, [])

  async function crear() {
    if (!nueva.trim()) return
    setError(null)
    setAviso(null)
    try {
      const res = await fetch('/api/sugerencias', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ descripcion: nueva }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'No se pudo crear')
      setNueva('')
      setAviso('Sugerencia enviada. ¡Gracias!')
      await cargar()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function actualizar(id: string, cambio: { comentarioHio?: string; estado?: string }) {
    setError(null)
    try {
      const res = await fetch('/api/sugerencias', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, ...cambio }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'No se pudo guardar')
      await cargar()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function borrar(id: string) {
    if (!window.confirm('¿Eliminar esta sugerencia? No se puede deshacer.')) return
    setError(null)
    setAviso(null)
    try {
      const res = await fetch('/api/sugerencias', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'No se pudo eliminar')
      await cargar()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const inc = (v: string | null, q: string) => (v ?? '').toLowerCase().includes(q.toLowerCase())
  const visibles = items.filter((s) => {
    if (f.usuario && !inc(s.usuario, f.usuario)) return false
    if (f.descripcion && !inc(s.descripcion, f.descripcion)) return false
    if (f.comentario && !inc(s.comentarioHio, f.comentario)) return false
    if (f.estado && s.estado !== f.estado) return false
    return true
  })
  const cols = esAdmin ? 6 : 5

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-4">
        <h1 className="text-lg font-bold tracking-tight">Sugerencias</h1>
        <p className="mt-1 text-[12.5px]" style={{ color: 'var(--muted2)' }}>
          {esAdmin
            ? 'Sugerencias de todos los usuarios. Podés comentar y cambiar el estado.'
            : 'Dejanos tus ideas para mejorar. Ves solo las tuyas y cómo van avanzando.'}
        </p>
      </div>

      {error && <div className="pc-error mb-4 px-4 py-2.5 text-[12px]">{error}</div>}
      {aviso && <div className="pc-ok mb-4 px-4 py-2.5 text-[12px]">{aviso}</div>}

      {/* Nueva sugerencia */}
      <div className="pc-panel mb-4 p-4">
        <div className="mb-2 text-[12px] font-semibold">Nueva sugerencia</div>
        <textarea
          value={nueva}
          onChange={(e) => setNueva(e.target.value)}
          placeholder="Contanos tu idea o algo que mejorarías…"
          rows={3}
          className="pc-input w-full px-3 py-2 text-[12.5px]"
        />
        <div className="mt-2">
          <button onClick={crear} className="pc-btn px-4 py-2 text-[12px]">
            Enviar sugerencia
          </button>
        </div>
      </div>

      {/* Lista */}
      <div className="pc-panel overflow-x-auto">
        <table className="pc-tabla w-full text-[11.5px]" style={{ minWidth: esAdmin ? 880 : 680 }}>
          <thead>
            <tr className="pc-thead text-center text-[9px] uppercase tracking-wide">
              <th className="px-2.5 py-2 font-semibold">Fecha</th>
              {esAdmin && <th className="px-2.5 py-2 font-semibold">Usuario</th>}
              <th className="px-2.5 py-2 font-semibold">Descripción</th>
              <th className="px-2.5 py-2 font-semibold">Comentario ICG</th>
              <th className="px-2.5 py-2 font-semibold">Estado</th>
              <th className="px-2.5 py-2"></th>
            </tr>
            <tr style={{ background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>
              <td className="px-1.5 py-1.5"></td>
              {esAdmin && (
                <td className="px-1.5 py-1.5">
                  <input value={f.usuario ?? ''} onChange={(e) => setF({ ...f, usuario: e.target.value })} placeholder="filtrar" className="pc-input w-full px-1.5 py-1 text-[10px]" />
                </td>
              )}
              <td className="px-1.5 py-1.5">
                <input value={f.descripcion ?? ''} onChange={(e) => setF({ ...f, descripcion: e.target.value })} placeholder="filtrar" className="pc-input w-full px-1.5 py-1 text-[10px]" />
              </td>
              <td className="px-1.5 py-1.5">
                <input value={f.comentario ?? ''} onChange={(e) => setF({ ...f, comentario: e.target.value })} placeholder="filtrar" className="pc-input w-full px-1.5 py-1 text-[10px]" />
              </td>
              <td className="px-1.5 py-1.5">
                <select value={f.estado ?? ''} onChange={(e) => setF({ ...f, estado: e.target.value })} className="pc-input w-full px-1 py-1 text-[10px]">
                  <option value="">todos</option>
                  {ESTADOS.map((e) => (
                    <option key={e} value={e}>
                      {e.toLowerCase()}
                    </option>
                  ))}
                </select>
              </td>
              <td className="px-1.5 py-1.5"></td>
            </tr>
          </thead>
          <tbody>
            {visibles.length === 0 && (
              <tr>
                <td colSpan={cols} className="px-2.5 py-6 text-center" style={{ color: 'var(--muted)' }}>
                  {items.length === 0
                    ? esAdmin
                      ? 'Todavía no hay sugerencias.'
                      : 'Todavía no dejaste ninguna sugerencia.'
                    : 'Sin resultados con esos filtros.'}
                </td>
              </tr>
            )}
            {visibles.map((s, i) => (
              <tr key={s.id} style={{ borderTop: '1px solid var(--border)', background: i % 2 === 1 ? 'var(--surface2)' : 'transparent' }}>
                <td className="whitespace-nowrap px-2.5 py-2 text-center" style={{ color: 'var(--muted2)' }}>
                  {fmtFecha(s.fecha)}
                </td>
                {esAdmin && (
                  <td className="px-2.5 py-2 text-center" style={{ color: 'var(--muted2)' }}>
                    {s.usuario}
                  </td>
                )}
                <td className="px-2.5 py-2" style={{ color: 'var(--text)' }}>
                  {s.descripcion}
                </td>
                <td className="px-2.5 py-2" style={{ color: 'var(--muted2)' }}>
                  {esAdmin ? (
                    <ComentarioEdit valor={s.comentarioHio} onGuardar={(v) => actualizar(s.id, { comentarioHio: v })} />
                  ) : (
                    s.comentarioHio || <span style={{ color: 'var(--muted)' }}>—</span>
                  )}
                </td>
                <td className="px-2.5 py-2 text-center">
                  {esAdmin ? (
                    <select
                      value={s.estado}
                      onChange={(e) => actualizar(s.id, { estado: e.target.value })}
                      className="pc-input px-2 py-1 text-[11px]"
                      style={{ color: COLOR_ESTADO[s.estado] }}
                    >
                      {ESTADOS.map((e) => (
                        <option key={e} value={e}>
                          {e.toLowerCase()}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="font-semibold" style={{ color: COLOR_ESTADO[s.estado] }}>
                      {s.estado.toLowerCase()}
                    </span>
                  )}
                </td>
                <td className="px-2.5 py-2 text-center">
                  <button onClick={() => borrar(s.id)} style={{ color: 'var(--muted)' }} title="Eliminar sugerencia">
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ComentarioEdit({ valor, onGuardar }: { valor: string | null; onGuardar: (v: string) => void }) {
  const [v, setV] = useState(valor ?? '')
  const [edit, setEdit] = useState(false)
  if (!edit)
    return (
      <button
        onClick={() => {
          setV(valor ?? '')
          setEdit(true)
        }}
        className="text-left hover:underline"
        style={{ color: valor ? 'var(--text)' : 'var(--muted)' }}
        title="Editar comentario"
      >
        {valor || '+ comentar'}
      </button>
    )
  return (
    <div className="flex items-start gap-1.5">
      <textarea value={v} onChange={(e) => setV(e.target.value)} rows={2} className="pc-input flex-1 px-2 py-1 text-[11px]" style={{ minWidth: 160 }} />
      <button
        onClick={() => {
          onGuardar(v)
          setEdit(false)
        }}
        className="pc-btn px-2 py-1 text-[10px]"
      >
        OK
      </button>
      <button onClick={() => setEdit(false)} className="px-1 text-[11px]" style={{ color: 'var(--muted)' }}>
        ✕
      </button>
    </div>
  )
}
