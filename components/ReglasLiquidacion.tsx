'use client'

// Editor de reglas de liquidación (plazo + comisión por pasarela y tipo de cobro).
// Reutilizable: panel de Clientes (super admin) y pantalla del cliente.
import { useEffect, useState } from 'react'
import { TIPO_COBRO_LABEL } from '@/src/acreditaciones/tipo-cobro'

interface ReglaLiq {
  proveedor: string
  tipoCobro: string
  plazoDias: number
  habiles: boolean
  comisionPct: number
}

export function ReglasLiquidacion({ tenant, onError, onSaved }: {
  tenant: string
  onError: (s: string | null) => void
  onSaved?: () => void
}) {
  const [tipos, setTipos] = useState<string[]>([])
  const [pasarelas, setPasarelas] = useState<{ codigo: string; nombre: string }[]>([])
  const [reglas, setReglas] = useState<ReglaLiq[]>([])
  const [cargando, setCargando] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)

  async function cargar() {
    setCargando(true)
    try {
      const res = await fetch(`/api/reglas-liquidacion?tenant=${encodeURIComponent(tenant)}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Error al cargar')
      setTipos(json.tipos)
      setPasarelas(json.pasarelas)
      setReglas(json.reglas)
    } catch (e) {
      onError((e as Error).message)
    } finally {
      setCargando(false)
    }
  }
  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant])

  const regla = (prov: string, tipo: string): ReglaLiq =>
    reglas.find((r) => r.proveedor === prov && r.tipoCobro === tipo) ?? { proveedor: prov, tipoCobro: tipo, plazoDias: 0, habiles: false, comisionPct: 0 }

  function actualizarLocal(prov: string, tipo: string, campos: Partial<ReglaLiq>) {
    setReglas((rs) => {
      const base = rs.find((r) => r.proveedor === prov && r.tipoCobro === tipo) ?? { proveedor: prov, tipoCobro: tipo, plazoDias: 0, habiles: false, comisionPct: 0 }
      return [...rs.filter((r) => !(r.proveedor === prov && r.tipoCobro === tipo)), { ...base, ...campos }]
    })
  }
  async function persistir(prov: string, tipo: string, override?: Partial<ReglaLiq>) {
    const r = { ...regla(prov, tipo), ...override }
    onError(null)
    try {
      const res = await fetch('/api/reglas-liquidacion', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tenant, proveedor: prov, tipoCobro: tipo, plazoDias: r.plazoDias, habiles: r.habiles, comisionPct: r.comisionPct }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'No se pudo guardar')
      setAviso('Guardado.')
      onSaved?.()
    } catch (e) {
      onError((e as Error).message)
      cargar()
    }
  }

  if (cargando) return <div className="text-[11px]" style={{ color: 'var(--muted)' }}>Cargando…</div>
  if (pasarelas.length === 0) return <div className="text-[11px]" style={{ color: 'var(--muted)' }}>No hay pasarelas asignadas todavía.</div>

  return (
    <div>
      {aviso && <div className="pc-ok mb-3 px-3 py-1.5 text-[11px]">{aviso}</div>}
      {pasarelas.map((p) => (
        <div key={p.codigo} className="mb-4">
          <div className="mb-1 text-[11px] font-semibold" style={{ color: 'var(--hio)' }}>{p.nombre}</div>
          <table className="pc-tabla w-full text-[11px]" style={{ maxWidth: 520 }}>
            <thead>
              <tr className="pc-thead text-left text-[9px] uppercase tracking-wide">
                <th className="px-2 py-1.5 font-semibold">Tipo de cobro</th>
                <th className="px-2 py-1.5 font-semibold">Plazo (días)</th>
                <th className="px-2 py-1.5 font-semibold">Hábiles</th>
                <th className="px-2 py-1.5 font-semibold">Comisión %</th>
              </tr>
            </thead>
            <tbody>
              {tipos.map((tipo) => {
                const r = regla(p.codigo, tipo)
                return (
                  <tr key={tipo} style={{ borderTop: '1px solid var(--border)' }}>
                    <td className="px-2 py-1 font-semibold">{TIPO_COBRO_LABEL[tipo] ?? tipo}</td>
                    <td className="px-2 py-1">
                      <input
                        type="number"
                        min={0}
                        value={r.plazoDias}
                        onChange={(e) => actualizarLocal(p.codigo, tipo, { plazoDias: Math.max(0, Math.round(Number(e.target.value) || 0)) })}
                        onBlur={() => persistir(p.codigo, tipo)}
                        className="pc-input w-20 px-1.5 py-1 text-[11px]"
                      />
                    </td>
                    <td className="px-2 py-1 text-center">
                      <input
                        type="checkbox"
                        checked={r.habiles}
                        onChange={(e) => {
                          actualizarLocal(p.codigo, tipo, { habiles: e.target.checked })
                          persistir(p.codigo, tipo, { habiles: e.target.checked })
                        }}
                      />
                    </td>
                    <td className="px-2 py-1">
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={r.comisionPct}
                        onChange={(e) => actualizarLocal(p.codigo, tipo, { comisionPct: Math.max(0, Number(e.target.value) || 0) })}
                        onBlur={() => persistir(p.codigo, tipo)}
                        className="pc-input w-24 px-1.5 py-1 text-[11px]"
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}
