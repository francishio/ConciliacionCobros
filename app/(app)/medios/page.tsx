'use client'

import { useEffect, useState } from 'react'

interface Pasarela {
  codigo: string
  nombre: string
}
interface Medio {
  codMedioPago: string
  medioPago: string
  cobros: number
  proveedor: string | null
}

export default function MediosPage() {
  const [pasarelas, setPasarelas] = useState<Pasarela[]>([])
  const [medios, setMedios] = useState<Medio[]>([])
  const [edic, setEdic] = useState<Record<string, string>>({})
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  async function cargar() {
    setError(null)
    try {
      const res = await fetch('/api/medios')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Error al cargar')
      setPasarelas(json.pasarelas as Pasarela[])
      setMedios(json.medios as Medio[])
      const e: Record<string, string> = {}
      for (const m of json.medios as Medio[]) e[m.codMedioPago] = m.proveedor ?? ''
      setEdic(e)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  useEffect(() => {
    cargar()
  }, [])

  async function guardar() {
    setGuardando(true)
    setError(null)
    setAviso(null)
    try {
      const res = await fetch('/api/medios', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          medios: medios.map((m) => ({
            codMedioPago: m.codMedioPago,
            medioPago: m.medioPago,
            proveedor: edic[m.codMedioPago] || null,
          })),
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'No se pudo guardar')
      setAviso(`Guardado. Se re-concilió ${json.periodos} mes(es).`)
      await cargar()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setGuardando(false)
    }
  }

  const sinAsignar = medios.filter((m) => !edic[m.codMedioPago]).length

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-5">
        <h1 className="text-lg font-bold tracking-tight">Medios de pago</h1>
        <p className="mt-1 text-[12.5px]" style={{ color: 'var(--muted2)' }}>
          Asigná cada medio de pago de HIOPOS a su pasarela (o “No conciliable”, ej. efectivo). Se toma de tus ventas.
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

      {medios.length === 0 ? (
        <div className="pc-panel px-4 py-10 text-center text-[12.5px]" style={{ color: 'var(--muted)' }}>
          No hay medios de pago todavía. Cargá/sincronizá ventas de HIOPOS y van a aparecer acá.
        </div>
      ) : (
        <>
          <div className="pc-panel overflow-hidden">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-left text-[9.5px] uppercase tracking-wide" style={{ color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>
                  <th className="px-3 py-2.5 font-semibold">Cód.</th>
                  <th className="px-3 py-2.5 font-semibold">Medio de pago</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Cobros</th>
                  <th className="px-3 py-2.5 font-semibold">Pasarela</th>
                </tr>
              </thead>
              <tbody>
                {medios.map((m) => (
                  <tr key={m.codMedioPago} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td className="px-3 py-2 font-mono text-[10px]" style={{ color: 'var(--muted)' }}>
                      {m.codMedioPago}
                    </td>
                    <td className="px-3 py-2" style={{ color: 'var(--text)' }}>
                      {m.medioPago || <span style={{ color: 'var(--muted)' }}>(sin nombre)</span>}
                    </td>
                    <td className="px-3 py-2 text-right font-mono" style={{ color: 'var(--muted2)' }}>
                      {m.cobros}
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={edic[m.codMedioPago] ?? ''}
                        onChange={(e) => setEdic((prev) => ({ ...prev, [m.codMedioPago]: e.target.value }))}
                        className="pc-input px-2 py-1 text-[11px]"
                      >
                        <option value="">— No conciliable</option>
                        {pasarelas.map((p) => (
                          <option key={p.codigo} value={p.codigo}>
                            {p.nombre}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex items-center gap-3">
            <button
              onClick={guardar}
              disabled={guardando}
              className="rounded-lg px-4 py-2 text-[12px] font-semibold disabled:opacity-50"
              style={{ background: 'var(--cyan)', color: '#04121a' }}
            >
              {guardando ? 'Guardando y re-conciliando…' : 'Guardar'}
            </button>
            {sinAsignar > 0 && (
              <span className="text-[11px]" style={{ color: 'var(--muted)' }}>
                {sinAsignar} medio(s) como “no conciliable”.
              </span>
            )}
          </div>
        </>
      )}
    </div>
  )
}
