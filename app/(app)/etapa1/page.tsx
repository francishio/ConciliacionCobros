'use client'

import { useEffect, useState } from 'react'

interface Cobro {
  id: string
  fechaHora: string
  tienda: string | null
  medioPago: string
  titular: string | null
  ultimos4: string | null
  autorizacion: string | null
  monto: string
  raw: Record<string, unknown> | null
}
interface Trans {
  id: string
  pasarela: string
  fechaHora: string
  terminal: string | null
  ultimos4: string | null
  autorizacion: string | null
  monto: string
  raw: Record<string, unknown> | null
}
interface Item {
  tipo: 'CONCILIADO' | 'DIFERENCIA' | 'EN_REVISION' | 'SIN_TRANSACCION' | 'PASARELA_SIN_MATCH'
  manual?: boolean
  pasarela: string | null
  terminalConfig: string | null
  cobro: Cobro | null
  trans: Trans | null
}
interface Resultado {
  ok: number
  diferenciaMonto: number
  enRevision: number
  sinTransaccion: number
  noAplica: number
}
interface Data {
  periodos: string[]
  resumen: { resultado: Resultado } | null
  items: Item[]
}

const ESTADO: Record<string, { txt: string; color: string }> = {
  CONCILIADO: { txt: 'conciliado', color: 'var(--green)' },
  DIFERENCIA: { txt: 'dif. monto', color: 'var(--amber)' },
  EN_REVISION: { txt: 'en revisión', color: 'var(--amber)' },
  SIN_TRANSACCION: { txt: 'HIOPOS sin match', color: 'var(--red)' },
  PASARELA_SIN_MATCH: { txt: 'pasarela sin match', color: 'var(--purple)' },
}
const fmtMonto = (s: string) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2 }).format(Number(s))
const fmtFecha = (s: string) =>
  new Date(s).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
const trunc = (s: string, n = 30) => (s.length > n ? s.slice(0, n) + '…' : s)
const SIN_MATCH: Item['tipo'][] = ['EN_REVISION', 'SIN_TRANSACCION', 'PASARELA_SIN_MATCH']

export default function Etapa1Page() {
  const [data, setData] = useState<Data | null>(null)
  const [periodo, setPeriodo] = useState('')
  const [fPasarela, setFPasarela] = useState('')
  const [fEstado, setFEstado] = useState('')
  const [selCobro, setSelCobro] = useState<string | null>(null)
  const [selTrans, setSelTrans] = useState<string | null>(null)
  const [expandido, setExpandido] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  async function cargar(p?: string) {
    setError(null)
    try {
      const q = p ? `?periodo=${encodeURIComponent(p)}` : ''
      const res = await fetch(`/api/etapa1${q}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Error al cargar')
      setData(json as Data)
      if (json.resumen && p) setPeriodo(p)
      else if (json.periodos?.length && !p) setPeriodo(json.periodos[0])
    } catch (e) {
      setError((e as Error).message)
    }
  }

  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function conciliar() {
    if (!selCobro || !selTrans) return
    setError(null)
    setAviso(null)
    try {
      const res = await fetch('/api/manual', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ cobroId: selCobro, transaccionId: selTrans }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'No se pudo conciliar')
      setAviso('Match manual confirmado.')
      setSelCobro(null)
      setSelTrans(null)
      await cargar(periodo)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const r = data?.resumen?.resultado
  const pasarelas = [...new Set((data?.items ?? []).map((i) => i.pasarela).filter(Boolean))] as string[]
  const items = (data?.items ?? []).filter((i) => {
    if (fPasarela && i.pasarela !== fPasarela) return false
    if (!fEstado) return true
    if (fEstado === 'NO_CONCILIADOS') return SIN_MATCH.includes(i.tipo)
    return i.tipo === fEstado
  })
  const cobroSel = data?.items.find((i) => i.cobro?.id === selCobro)?.cobro
  const transSel = data?.items.find((i) => i.trans?.id === selTrans)?.trans
  const dif = cobroSel && transSel ? Number(cobroSel.monto) - Number(transSel.monto) : null

  return (
    <div className="mx-auto max-w-6xl pb-24">
      <div className="mb-4 flex items-end gap-3">
        <div>
          <h1 className="text-lg font-bold tracking-tight">Etapa 1 — Operativa</h1>
          <p className="mt-1 text-[12.5px]" style={{ color: 'var(--muted2)' }}>
            Conciliación POS ↔ pasarela del mes. Podés unir a mano un “sin match” de cada lado.
          </p>
        </div>
        {data && data.periodos.length > 0 && (
          <select value={periodo} onChange={(e) => cargar(e.target.value)} className="pc-input ml-auto px-3 py-1.5 text-[12px]">
            {data.periodos.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        )}
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

      {!data?.resumen ? (
        <div className="pc-panel px-4 py-12 text-center text-[12.5px]" style={{ color: 'var(--muted)' }}>
          No hay datos cargados para este cliente.
        </div>
      ) : (
        <>
          {/* Consolidado */}
          {r && (
            <div className="mb-4 grid grid-cols-3 gap-2 sm:grid-cols-5">
              <Mini label="Conciliado" v={r.ok} color="var(--green)" />
              <Mini label="Dif. monto" v={r.diferenciaMonto} color="var(--amber)" />
              <Mini label="En revisión" v={r.enRevision} color="var(--amber)" />
              <Mini label="Sin transacción" v={r.sinTransaccion} color="var(--red)" />
              <Mini label="No aplica" v={r.noAplica} color="var(--muted2)" />
            </div>
          )}

          <div className="mb-2 flex items-center text-[11px]">
            {(fEstado || fPasarela) && (
              <button
                onClick={() => {
                  setFEstado('')
                  setFPasarela('')
                }}
                style={{ color: 'var(--cyan)' }}
              >
                limpiar filtros
              </button>
            )}
            <span className="ml-auto font-mono" style={{ color: 'var(--muted)' }}>
              {items.length} ítems
            </span>
          </div>

          {/* Grilla */}
          <div className="pc-panel overflow-x-auto">
            <table className="w-full text-[11.5px]">
              <thead>
                <tr className="text-left text-[9px] uppercase tracking-wide" style={{ color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>
                  <th className="px-2 py-1.5 font-semibold">
                    <select value={fEstado} onChange={(e) => setFEstado(e.target.value)} className="filtro-col" title="Filtrar por estado">
                      <option value="">Estado ▾</option>
                      <option value="CONCILIADO">Conciliados</option>
                      <option value="NO_CONCILIADOS">No conciliados</option>
                      <option value="DIFERENCIA">Diferencia de monto</option>
                      <option value="EN_REVISION">En revisión</option>
                      <option value="SIN_TRANSACCION">HIOPOS sin match</option>
                      <option value="PASARELA_SIN_MATCH">Pasarela sin match</option>
                    </select>
                  </th>
                  <th className="px-2 py-2 font-semibold">Origen</th>
                  <th className="px-2 py-2 font-semibold">Fecha</th>
                  <th className="px-2 py-2 font-semibold">Tienda</th>
                  <th className="px-2 py-2 font-semibold">Medio HIOPOS</th>
                  <th className="px-2 py-1.5 font-semibold">
                    <select value={fPasarela} onChange={(e) => setFPasarela(e.target.value)} className="filtro-col" title="Filtrar por pasarela">
                      <option value="">Pasarela ▾</option>
                      {pasarelas.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </th>
                  <th className="px-2 py-2 font-semibold" title="Terminal según la config del establecimiento">
                    Term. cfg
                  </th>
                  <th className="px-2 py-2 font-semibold" title="Terminal reportada en el archivo de la pasarela">
                    Term. arch
                  </th>
                  <th className="px-2 py-2 font-semibold">Titular</th>
                  <th className="px-2 py-2 font-semibold">····últ4</th>
                  <th className="px-2 py-2 font-semibold">Autoriz.</th>
                  <th className="px-2 py-2 text-right font-semibold">Monto</th>
                  <th className="px-2 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => {
                  const key = it.cobro?.id ?? it.trans?.id ?? ''
                  const est = ESTADO[it.tipo]
                  const selectableCobro = it.tipo === 'SIN_TRANSACCION' || it.tipo === 'EN_REVISION'
                  const selectableTrans = it.tipo === 'PASARELA_SIN_MATCH'
                  const seleccionado = (it.cobro && it.cobro.id === selCobro) || (it.trans && it.trans.id === selTrans)
                  const fecha = it.cobro?.fechaHora ?? it.trans?.fechaHora ?? ''
                  const onRowClick = () => {
                    if (selectableCobro && it.cobro) setSelCobro(it.cobro.id === selCobro ? null : it.cobro.id)
                    else if (selectableTrans && it.trans) setSelTrans(it.trans.id === selTrans ? null : it.trans.id)
                  }
                  return (
                    <FragmentRow key={key}>
                      <tr
                        onClick={onRowClick}
                        style={{
                          borderBottom: '1px solid var(--border)',
                          background: seleccionado ? 'var(--surface3)' : 'transparent',
                          cursor: selectableCobro || selectableTrans ? 'pointer' : 'default',
                          boxShadow: seleccionado ? 'inset 3px 0 0 var(--cyan)' : 'none',
                        }}
                      >
                        <td className="px-2 py-1.5">
                          <span className="pc-badge" style={{ color: est.color }}>
                            {est.txt}
                          </span>
                        </td>
                        <td className="px-2 py-1.5 text-[10px]">
                          {it.tipo === 'CONCILIADO' || it.tipo === 'DIFERENCIA' ? (
                            <span style={{ color: it.manual ? 'var(--cyan)' : 'var(--muted)' }}>
                              {it.manual ? 'manual' : 'auto'}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="px-2 py-1.5 font-mono text-[10px]" style={{ color: 'var(--muted2)' }}>
                          {fecha ? fmtFecha(fecha) : '—'}
                        </td>
                        <td className="px-2 py-1.5" style={{ color: 'var(--muted2)' }} title={it.cobro?.tienda ?? undefined}>
                          {it.cobro?.tienda ? trunc(it.cobro.tienda) : '—'}
                        </td>
                        <td className="px-2 py-1.5" style={{ color: it.cobro ? 'var(--text)' : 'var(--muted)' }}>
                          {it.cobro?.medioPago ?? '—'}
                        </td>
                        <td className="px-2 py-1.5" style={{ color: it.trans ? 'var(--cyan)' : 'var(--muted)' }}>
                          {it.trans?.pasarela ?? '—'}
                        </td>
                        <td className="px-2 py-1.5 font-mono text-[10px]" style={{ color: 'var(--muted2)' }}>
                          {it.trans ? (it.terminalConfig ?? '—') : '—'}
                        </td>
                        <td className="px-2 py-1.5 font-mono text-[10px]" style={{ color: 'var(--muted2)' }}>
                          {it.trans?.terminal ?? '—'}
                        </td>
                        <td className="px-2 py-1.5" style={{ color: 'var(--muted2)' }}>
                          {it.cobro?.titular ?? '—'}
                        </td>
                        <td className="px-2 py-1.5 font-mono text-[10px]" style={{ color: 'var(--muted2)' }}>
                          {it.cobro?.ultimos4 ?? it.trans?.ultimos4 ?? '—'}
                        </td>
                        <td className="px-2 py-1.5 font-mono text-[10px]" style={{ color: 'var(--muted2)' }}>
                          {it.cobro?.autorizacion ?? it.trans?.autorizacion ?? '—'}
                        </td>
                        <td className="px-2 py-1.5 text-right font-mono" style={{ color: 'var(--text)' }}>
                          {fmtMonto(it.cobro?.monto ?? it.trans?.monto ?? '0')}
                          {it.tipo === 'DIFERENCIA' && it.trans && (
                            <span className="ml-1 text-[9px]" style={{ color: 'var(--amber)' }}>
                              ≠ {fmtMonto(it.trans.monto)}
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setExpandido(expandido === key ? null : key)
                            }}
                            style={{ color: 'var(--muted)' }}
                          >
                            {expandido === key ? '▲' : '▾'}
                          </button>
                        </td>
                      </tr>
                      {expandido === key && (
                        <tr style={{ background: 'var(--surface2)' }}>
                          <td colSpan={13} className="px-4 py-3">
                            <div className="grid gap-4 sm:grid-cols-2">
                              <RawDetalle titulo="HIOPOS" raw={it.cobro?.raw ?? null} />
                              <RawDetalle titulo="Pasarela" raw={it.trans?.raw ?? null} />
                            </div>
                          </td>
                        </tr>
                      )}
                    </FragmentRow>
                  )
                })}
                {items.length === 0 && (
                  <tr>
                    <td colSpan={13} className="px-4 py-8 text-center text-[12px]" style={{ color: 'var(--muted)' }}>
                      Sin ítems para este filtro.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Barra de conciliación manual */}
      {(cobroSel || transSel) && (
        <div
          className="fixed bottom-0 left-56 right-0 flex items-center gap-4 border-t px-5 py-3"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
        >
          <div className="flex items-center gap-3 text-[12px]">
            <span style={{ color: 'var(--muted)' }}>HIOPOS</span>
            <span className="font-mono" style={{ color: cobroSel ? 'var(--text)' : 'var(--muted)' }}>
              {cobroSel ? fmtMonto(cobroSel.monto) : '—'}
            </span>
            <span style={{ color: 'var(--muted)' }}>↔ Pasarela</span>
            <span className="font-mono" style={{ color: transSel ? 'var(--text)' : 'var(--muted)' }}>
              {transSel ? fmtMonto(transSel.monto) : '—'}
            </span>
            {dif !== null && (
              <span className="pc-badge" style={{ color: Math.abs(dif) < 0.005 ? 'var(--green)' : 'var(--red)' }}>
                {Math.abs(dif) < 0.005 ? 'sin diferencia' : `dif ${fmtMonto(String(dif))}`}
              </span>
            )}
          </div>
          <button
            onClick={conciliar}
            disabled={!cobroSel || !transSel}
            className="ml-auto rounded-lg px-4 py-2 text-[12px] font-semibold disabled:opacity-40"
            style={{ background: 'var(--green)', color: '#04140b' }}
          >
            Conciliar seleccionados
          </button>
        </div>
      )}
    </div>
  )
}

function FragmentRow({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

function Mini({ label, v, color }: { label: string; v: number; color: string }) {
  return (
    <div className="pc-panel px-3 py-2">
      <div className="text-[9px] uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
        {label}
      </div>
      <div className="font-mono text-lg font-semibold" style={{ color }}>
        {v}
      </div>
    </div>
  )
}

function RawDetalle({ titulo, raw }: { titulo: string; raw: Record<string, unknown> | null }) {
  return (
    <div>
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
        {titulo}
      </div>
      {raw ? (
        <div className="space-y-0.5">
          {Object.entries(raw).map(([k, v]) => (
            <div key={k} className="flex gap-2 text-[10.5px]">
              <span style={{ color: 'var(--muted)', minWidth: 120 }}>{k}</span>
              <span className="font-mono" style={{ color: 'var(--text)' }}>
                {String(v)}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-[11px]" style={{ color: 'var(--muted)' }}>
          —
        </div>
      )}
    </div>
  )
}
