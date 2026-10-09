'use client'

// Tablero de Conciliación: parado en un cliente + mes, muestra KPIs y una tabla
// por establecimiento (expandible a terminales), con botones para traer datos de
// HIOPOS / pasarela API e importar archivos de pasarela manual. "Ver detalle"
// abre el detalle por transacción en la misma pantalla.
import { useEffect, useRef, useState } from 'react'
import { useSesion } from '@/components/useSesion'

interface Terminal {
  codTerminal: string
  alias: string | null
  txHiopos: number
  conciliadas: number
  pendientes: number
  difMonto: number
  enRevision: number
  montoHiopos: number
  montoPasarela: number
}
interface EstabFila extends Terminal {
  id: string | null
  nombre: string
  codTienda: string | null
  txPasarelaSinCobro: number
  montoPasarelaSinCobro: number
  terminales: Terminal[]
}
interface Tablero {
  periodo: string
  kpi: {
    cobros: number
    cobrosPasarela: number
    conciliadas: number
    pendientes: number
    difMonto: number
    enRevision: number
    montoHiopos: number
    montoPasarela: number
    txPasarelaSinCobro: number
    montoPasarelaSinCobro: number
    porcentaje: number
  }
  establecimientos: EstabFila[]
  pasarelaSinCobroGlobal: { n: number; monto: number }
}
interface Pasarela {
  codigo: string
  nombre: string
  modoArchivo: boolean
  modoApi: boolean
}
interface DetalleItem {
  id: string
  fechaHiopos: string | null
  fechaPasarela: string | null
  terminal: string | null
  medioPago: string | null
  autorizacion: string | null
  ultimos4: string | null
  montoHiopos: number | null
  estado: string
  manual: boolean
  idPago: string | null
  dispositivo: string | null
  pasarela: string | null
  montoPasarela: number | null
}
// Colores por grupo de columnas del detalle: común (gris), HIO (bordeaux), pasarela (azul).
const COL_COMUN = 'var(--muted2)'
const COL_HIO = '#9f1239'
const COL_PAS = '#1d4ed8'
const EST_DETALLE: Record<string, { txt: string; color: string }> = {
  CONCILIADO: { txt: 'conciliado', color: 'var(--green)' },
  DIFERENCIA: { txt: 'dif. monto', color: 'var(--amber)' },
  EN_REVISION: { txt: 'en revisión', color: 'var(--amber)' },
  SIN_TRANSACCION: { txt: 'HIO s/CONC', color: 'var(--red)' },
  PASARELA_SIN_COBRO: { txt: 'PAS s/CONC', color: 'var(--red)' },
}

// Traduce errores de fetch (el navegador los tira en inglés) a un mensaje claro.
function msgError(e: unknown): string {
  const m = (e as Error)?.message ?? ''
  if (/failed to fetch|load failed|networkerror|fetch failed/i.test(m))
    return 'No se pudo conectar con el servidor (puede haber tardado demasiado o reiniciado). Probá de nuevo en unos segundos.'
  return m || 'Ocurrió un error.'
}

const moneda = (n: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)
const monedaD = (n: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(n)
const fmtFechaHora = (s: string) =>
  new Date(s).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
// Fecha local (YYYY-MM-DD) para comparar contra el filtro <input type="date">.
const fechaLocalISO = (s: string | null): string => {
  if (!s) return ''
  const d = new Date(s)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const mesLabel = (p: string) => {
  const [y, m] = p.split('-').map(Number)
  const nombres = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
  return `${nombres[m - 1]} ${y}`
}
const mesActual = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
function mover(periodo: string, delta: number): string {
  const [y, m] = periodo.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export default function ConciliacionPage() {
  const sesion = useSesion()
  const esCliente = sesion?.rol === 'CLIENTE'
  const [clientes, setClientes] = useState<string[]>([])
  const [tenant, setTenant] = useState('')
  const [periodo, setPeriodo] = useState(mesActual())
  const [data, setData] = useState<Tablero | null>(null)
  const [pasarelas, setPasarelas] = useState<Pasarela[]>([])
  const [cargando, setCargando] = useState(false)
  const [sincro, setSincro] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [abierto, setAbierto] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [fileCodigo, setFileCodigo] = useState<string>('')
  // Detalle por transacción (drill-down inline)
  const [detEstab, setDetEstab] = useState<{ id: string | null; nombre: string } | null>(null)
  const [detItems, setDetItems] = useState<DetalleItem[]>([])
  const [detCargando, setDetCargando] = useState(false)
  const [detSoloNo, setDetSoloNo] = useState(false)
  const [detF, setDetF] = useState<Record<string, string>>({})
  // Match manual: selección de un cobro sin pasarela + una transacción sin cobro.
  const [mCobro, setMCobro] = useState<string | null>(null)
  const [mTrans, setMTrans] = useState<string | null>(null)

  // Cliente de la sesión, o lista para el super admin.
  useEffect(() => {
    if (!sesion) return
    if (sesion.rol === 'CLIENTE') {
      if (sesion.tenantNombre) setTenant(sesion.tenantNombre)
    } else {
      fetch('/api/admin/clientes')
        .then((r) => r.json())
        .then((j) => setClientes((j.clientes ?? []).map((c: { nombre: string }) => c.nombre)))
        .catch(() => {})
    }
  }, [sesion])

  async function cargar() {
    if (!tenant) {
      setData(null)
      return
    }
    setCargando(true)
    setError(null)
    setDetEstab(null)
    try {
      const res = await fetch(`/api/conciliacion/resumen?tenant=${encodeURIComponent(tenant)}&periodo=${periodo}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Error al cargar')
      setData(json.tablero)
      setPasarelas(json.pasarelas)
    } catch (e) {
      setError(msgError(e))
      setData(null)
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant, periodo])

  async function sincronizar(tipo: 'hiopos' | 'clover', nombre: string) {
    setSincro(tipo)
    setError(null)
    setAviso(null)
    try {
      const res = await fetch(`/api/carga/${tipo}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tenant, periodo }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'No se pudo sincronizar')
      setAviso(`${nombre} actualizado.`)
      await cargar()
    } catch (e) {
      setError(msgError(e))
    } finally {
      setSincro(null)
    }
  }

  async function reconciliar() {
    setSincro('reconciliar')
    setError(null)
    setAviso(null)
    try {
      const res = await fetch('/api/etapa1', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tenant, periodo }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'No se pudo re-conciliar')
      setAviso('Mes re-conciliado.')
      await cargar()
    } catch (e) {
      setError(msgError(e))
    } finally {
      setSincro(null)
    }
  }

  function pedirArchivo(codigo: string) {
    setFileCodigo(codigo)
    fileRef.current?.click()
  }
  async function subirArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !fileCodigo) return
    setSincro('archivo')
    setError(null)
    setAviso(null)
    try {
      const fd = new FormData()
      fd.set('tenant', tenant)
      fd.set('periodo', periodo)
      fd.set(`extracto_${fileCodigo}`, file)
      const res = await fetch('/api/carga', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'No se pudo importar')
      setAviso('Archivo importado.')
      await cargar()
    } catch (err) {
      setError(msgError(err))
    } finally {
      setSincro(null)
    }
  }

  async function abrirDetalle(e: EstabFila) {
    setDetEstab({ id: e.id, nombre: e.nombre })
    setDetItems([])
    setDetSoloNo(false)
    setDetF({})
    setMCobro(null)
    setMTrans(null)
    setDetCargando(true)
    try {
      const res = await fetch(
        `/api/conciliacion/detalle?tenant=${encodeURIComponent(tenant)}&periodo=${periodo}&estab=${e.id ?? ''}`,
      )
      const json = await res.json()
      if (res.ok) setDetItems(json.items)
      else setError(json.error ?? 'No se pudo cargar el detalle')
    } finally {
      setDetCargando(false)
    }
  }

  async function abrirSinCobro() {
    setDetEstab({ id: '__global__', nombre: 'Pasarela sin cobro' })
    setDetItems([])
    setDetSoloNo(false)
    setDetF({})
    setMCobro(null)
    setMTrans(null)
    setDetCargando(true)
    try {
      const res = await fetch(
        `/api/conciliacion/detalle?tenant=${encodeURIComponent(tenant)}&periodo=${periodo}&scope=sincobro`,
      )
      const json = await res.json()
      if (res.ok) setDetItems(json.items)
      else setError(json.error ?? 'No se pudo cargar')
    } finally {
      setDetCargando(false)
    }
  }

  function urlDetalle(d: { id: string | null }) {
    const base = `/api/conciliacion/detalle?tenant=${encodeURIComponent(tenant)}&periodo=${periodo}`
    return d.id === '__global__' ? `${base}&scope=sincobro` : `${base}&estab=${d.id ?? ''}`
  }
  async function recargarDetalle() {
    if (!detEstab) return
    try {
      const json = await (await fetch(urlDetalle(detEstab))).json()
      if (json.items) setDetItems(json.items)
    } catch {
      /* noop */
    }
  }
  async function refrescarResumen() {
    try {
      const json = await (
        await fetch(`/api/conciliacion/resumen?tenant=${encodeURIComponent(tenant)}&periodo=${periodo}`)
      ).json()
      if (json.tablero) setData(json.tablero)
    } catch {
      /* noop */
    }
  }
  async function conciliarManual() {
    if (!mCobro || !mTrans) return
    setError(null)
    setAviso(null)
    try {
      const res = await fetch('/api/manual', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tenant, cobroId: mCobro, transaccionId: mTrans }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'No se pudo conciliar')
      setMCobro(null)
      setMTrans(null)
      setAviso('Match manual confirmado.')
      await Promise.all([recargarDetalle(), refrescarResumen()])
    } catch (e) {
      setError(msgError(e))
    }
  }

  const k = data?.kpi
  const apiPas = pasarelas.filter((p) => p.modoApi)
  const archivoPas = pasarelas.filter((p) => p.modoArchivo)

  return (
    <div className="mx-auto max-w-6xl">
      <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={subirArchivo} />


      {/* Barra: cliente + mes + botones de carga */}
      <div className="pc-panel mb-4 flex flex-wrap items-center gap-2 p-3">
        {!esCliente && (
          <select
            value={tenant}
            onChange={(e) => setTenant(e.target.value)}
            className="pc-input px-2 py-1.5 text-[12px]"
            style={{ minWidth: 150 }}
          >
            <option value="">Elegí un cliente…</option>
            {clientes.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        )}
        <div className="flex items-center gap-1">
          <button onClick={() => setPeriodo(mover(periodo, -1))} className="rounded-md border px-2 py-1 text-[12px]" style={{ borderColor: 'var(--border2)' }}>
            ◀
          </button>
          <span className="min-w-[72px] text-center text-[12.5px] font-semibold">{mesLabel(periodo)}</span>
          <button onClick={() => setPeriodo(mover(periodo, 1))} className="rounded-md border px-2 py-1 text-[12px]" style={{ borderColor: 'var(--border2)' }}>
            ▶
          </button>
        </div>

        {tenant && (
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <button onClick={() => sincronizar('hiopos', 'Ventas HIOPOS')} disabled={!!sincro} className="pc-btn px-3 py-1.5 text-[11px] disabled:opacity-50">
              {sincro === 'hiopos' ? 'Trayendo…' : '↻ Ventas HIOPOS'}
            </button>
            {apiPas.map((p) =>
              p.codigo === 'CLOVER' ? (
                <button key={p.codigo} onClick={() => sincronizar('clover', p.nombre)} disabled={!!sincro} className="pc-btn px-3 py-1.5 text-[11px] disabled:opacity-50">
                  {sincro === 'clover' ? 'Trayendo…' : `↻ ${p.nombre}`}
                </button>
              ) : null,
            )}
            {archivoPas.map((p) => (
              <button
                key={p.codigo}
                onClick={() => pedirArchivo(p.codigo)}
                disabled={!!sincro}
                className="rounded-lg border px-3 py-1.5 text-[11px] font-semibold disabled:opacity-50"
                style={{ borderColor: 'var(--border2)', color: 'var(--text)' }}
              >
                ⬆ Importar {p.nombre}
              </button>
            ))}
            <button
              onClick={reconciliar}
              disabled={!!sincro}
              title="Recalcular el cruce sobre los datos ya cargados (sin volver a traer de HIOPOS/pasarela)"
              className="rounded-lg border px-3 py-1.5 text-[11px] font-semibold disabled:opacity-50"
              style={{ borderColor: 'var(--border2)', color: 'var(--hio)' }}
            >
              {sincro === 'reconciliar' ? 'Conciliando…' : '⟳ Re-conciliar'}
            </button>
          </div>
        )}
      </div>

      {error && <div className="pc-error mb-4 px-4 py-2.5 text-[12px]">{error}</div>}
      {aviso && <div className="pc-ok mb-4 px-4 py-2.5 text-[12px]">{aviso}</div>}

      {!tenant ? (
        <div className="pc-panel px-4 py-12 text-center text-[12.5px]" style={{ color: 'var(--muted)' }}>
          Elegí un cliente para ver su conciliación.
        </div>
      ) : cargando ? (
        <div className="pc-panel px-4 py-12 text-center text-[12.5px]" style={{ color: 'var(--muted)' }}>
          Cargando…
        </div>
      ) : !data || data.kpi.cobros === 0 ? (
        <div className="pc-panel px-4 py-12 text-center text-[12.5px]" style={{ color: 'var(--muted)' }}>
          No hay ventas cargadas para {mesLabel(periodo)}. Usá “↻ Ventas HIOPOS” para traerlas.
        </div>
      ) : (
        <>
          {/* KPIs (compactos; títulos consistentes con la tabla) */}
          <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
            <Kpi label="Cobros HIOPOS" valor={k!.cobros.toLocaleString('es-AR')} sub={moneda(k!.montoHiopos)} />
            <Kpi label="Cobros pasarela" valor={k!.cobrosPasarela.toLocaleString('es-AR')} sub={moneda(k!.montoPasarela + k!.montoPasarelaSinCobro)} />
            <Kpi label="Conciliados" valor={k!.conciliadas.toLocaleString('es-AR')} sub={`${k!.porcentaje}%`} color="var(--green)" />
            <Kpi
              label="HIO s/CONC"
              valor={(k!.pendientes + k!.enRevision).toLocaleString('es-AR')}
              sub={`${k!.difMonto} dif. monto`}
              color={k!.pendientes + k!.enRevision === 0 ? 'var(--green)' : 'var(--red)'}
            />
            <Kpi
              label="PAS s/CONC"
              valor={k!.txPasarelaSinCobro.toLocaleString('es-AR')}
              sub={moneda(k!.montoPasarelaSinCobro)}
              color={k!.txPasarelaSinCobro === 0 ? 'var(--green)' : 'var(--red)'}
              onClick={k!.txPasarelaSinCobro > 0 ? abrirSinCobro : undefined}
            />
          </div>

          {/* Tabla por establecimiento */}
          <div className="pc-panel overflow-x-auto">
            <table className="pc-tabla w-full text-[11.5px]" style={{ minWidth: 940 }}>
              <thead>
                <tr className="pc-thead text-center text-[9px] uppercase tracking-wide">
                  <th className="px-2.5 py-2 font-semibold">Establecimiento</th>
                  <th className="px-2.5 py-2 font-semibold">tx HIO</th>
                  <th className="px-2.5 py-2 font-semibold">tx PAS</th>
                  <th className="px-2.5 py-2 font-semibold">CONCIL</th>
                  <th className="px-2.5 py-2 font-semibold" title="HIOPOS sin conciliar">HIO s/CONC</th>
                  <th className="px-2.5 py-2 font-semibold" title="Pasarela sin conciliar">PAS s/CONC</th>
                  <th className="px-2.5 py-2 font-semibold">$ HIO</th>
                  <th className="px-2.5 py-2 font-semibold">$ PAS</th>
                  <th className="px-2.5 py-2 font-semibold">$ DIF</th>
                  <th className="px-2.5 py-2 font-semibold">% DIF</th>
                  <th className="px-2.5 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {data.establecimientos.map((e, idx) => {
                  const exp = abierto === (e.id ?? '(sin)')
                  return (
                    <ReactFragmentRow
                      key={e.id ?? '(sin)'}
                      e={e}
                      exp={exp}
                      idx={idx}
                      activo={detEstab?.id === e.id}
                      onToggle={() => setAbierto(exp ? null : e.id ?? '(sin)')}
                      onDetalle={() => abrirDetalle(e)}
                    />
                  )
                })}
              </tbody>
            </table>
          </div>

          {detEstab && (
            <div className="pc-panel mt-4 p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="text-[12px] font-semibold">
                  Detalle · <span style={{ color: 'var(--hio)' }}>{detEstab.nombre}</span> · {mesLabel(periodo)}
                </div>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--muted2)' }}>
                    <input type="checkbox" checked={detSoloNo} onChange={(e) => setDetSoloNo(e.target.checked)} /> Solo no
                    conciliados
                  </label>
                  <button
                    onClick={() => setDetEstab(null)}
                    className="rounded-md border px-2.5 py-1 text-[11px] font-semibold"
                    style={{ borderColor: 'var(--border2)', color: 'var(--muted2)' }}
                  >
                    ← Volver al resumen
                  </button>
                </div>
              </div>
              {(mCobro || mTrans) && (
                <div
                  className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border p-2.5 text-[11px]"
                  style={{ borderColor: 'var(--hio)', background: 'var(--surface2)' }}
                >
                  <span style={{ color: 'var(--muted2)' }}>
                    Match manual: {mCobro ? 'cobro ✓' : 'elegí un cobro “HIOPOS sin pasarela”'} ·{' '}
                    {mTrans ? 'transacción ✓' : 'elegí una “pasarela sin cobro”'}
                  </span>
                  <button
                    onClick={conciliarManual}
                    disabled={!mCobro || !mTrans}
                    className="pc-btn ml-auto px-3 py-1 text-[11px] disabled:opacity-50"
                  >
                    Conciliar
                  </button>
                  <button
                    onClick={() => {
                      setMCobro(null)
                      setMTrans(null)
                    }}
                    className="text-[11px]"
                    style={{ color: 'var(--muted)' }}
                  >
                    Cancelar
                  </button>
                </div>
              )}
              {detCargando ? (
                <div className="py-6 text-center text-[12px]" style={{ color: 'var(--muted)' }}>
                  Cargando…
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="pc-tabla w-full whitespace-nowrap text-[11px]" style={{ minWidth: 900 }}>
                    <thead>
                      <tr className="text-center text-[9px] font-semibold uppercase tracking-wide text-white">
                        <th className="px-2.5 py-2" style={{ background: '#64748b' }}>ID de pago</th>
                        <th className="px-2.5 py-2" style={{ background: COL_HIO }}>Fecha HIO</th>
                        <th className="px-2.5 py-2" style={{ background: COL_HIO }}>Terminal</th>
                        <th className="px-2.5 py-2" style={{ background: COL_HIO }}>Medio</th>
                        <th className="px-2.5 py-2" style={{ background: COL_HIO }}>·4</th>
                        <th className="px-2.5 py-2" style={{ background: COL_HIO }}>$ HIO</th>
                        <th className="px-2.5 py-2" style={{ background: COL_PAS }}>Fecha PAS</th>
                        <th className="px-2.5 py-2" style={{ background: COL_PAS }}>Pasarela</th>
                        <th className="px-2.5 py-2" style={{ background: COL_PAS }}>Dispositivo</th>
                        <th className="px-2.5 py-2" style={{ background: COL_PAS }}>$ PAS</th>
                        <th className="px-2.5 py-2" style={{ background: '#64748b' }}>Estado</th>
                      </tr>
                      <tr style={{ background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>
                        <td className="px-1.5 py-1.5">
                          <input value={detF.idpago ?? ''} onChange={(e) => setDetF({ ...detF, idpago: e.target.value })} placeholder="filtrar" className="pc-input w-full px-1.5 py-1 text-[10px]" />
                        </td>
                        <td className="px-1.5 py-1.5">
                          <input type="date" value={detF.fecha ?? ''} onChange={(e) => setDetF({ ...detF, fecha: e.target.value })} className="pc-input w-full px-1 py-1 text-[10px]" title="Filtrar por día (HIO o PAS)" />
                        </td>
                        <td className="px-1.5 py-1.5">
                          <input value={detF.terminal ?? ''} onChange={(e) => setDetF({ ...detF, terminal: e.target.value })} placeholder="filtrar" className="pc-input w-full px-1.5 py-1 text-[10px]" />
                        </td>
                        <td className="px-1.5 py-1.5">
                          <input value={detF.medio ?? ''} onChange={(e) => setDetF({ ...detF, medio: e.target.value })} placeholder="filtrar" className="pc-input w-full px-1.5 py-1 text-[10px]" />
                        </td>
                        <td className="px-1.5 py-1.5"></td>
                        <td className="px-1.5 py-1.5"></td>
                        <td className="px-1.5 py-1.5"></td>
                        <td className="px-1.5 py-1.5">
                          <input value={detF.pasarela ?? ''} onChange={(e) => setDetF({ ...detF, pasarela: e.target.value })} placeholder="filtrar" className="pc-input w-full px-1.5 py-1 text-[10px]" />
                        </td>
                        <td className="px-1.5 py-1.5">
                          <input value={detF.dispositivo ?? ''} onChange={(e) => setDetF({ ...detF, dispositivo: e.target.value })} placeholder="filtrar" className="pc-input w-full px-1.5 py-1 text-[10px]" />
                        </td>
                        <td className="px-1.5 py-1.5"></td>
                        <td className="px-1.5 py-1.5">
                          <select
                            value={detF.estado ?? ''}
                            onChange={(e) => setDetF({ ...detF, estado: e.target.value })}
                            className="pc-input w-full px-1 py-1 text-[10px]"
                          >
                            <option value="">todos</option>
                            <option value="CONCILIADO">conciliado</option>
                            <option value="SIN_TRANSACCION">HIO s/CONC</option>
                            <option value="PASARELA_SIN_COBRO">PAS s/CONC</option>
                            <option value="DIFERENCIA">dif. monto</option>
                            <option value="EN_REVISION">en revisión</option>
                          </select>
                        </td>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const inc = (v: string | null, f: string) => (v ?? '').toLowerCase().includes(f.toLowerCase())
                        const lista = detItems.filter((it) => {
                          if (detSoloNo && it.estado === 'CONCILIADO') return false
                          if (detF.idpago && !inc(it.idPago, detF.idpago)) return false
                          if (detF.fecha && fechaLocalISO(it.fechaHiopos) !== detF.fecha && fechaLocalISO(it.fechaPasarela) !== detF.fecha) return false
                          if (detF.terminal && !inc(it.terminal, detF.terminal)) return false
                          if (detF.medio && !inc(it.medioPago, detF.medio)) return false
                          if (detF.dispositivo && !inc(it.dispositivo, detF.dispositivo)) return false
                          if (detF.pasarela && !inc(it.pasarela, detF.pasarela)) return false
                          if (detF.estado && it.estado !== detF.estado) return false
                          return true
                        })
                        if (lista.length === 0)
                          return (
                            <tr>
                              <td colSpan={10} className="py-5 text-center" style={{ color: 'var(--muted)' }}>
                                {detSoloNo ? 'Nada pendiente en esta tienda.' : 'Sin transacciones.'}
                              </td>
                            </tr>
                          )
                        return lista.map((it, i) => {
                          const est = EST_DETALLE[it.estado] ?? { txt: it.estado, color: 'var(--muted)' }
                          const esCobroLibre = it.estado === 'SIN_TRANSACCION'
                          const esTransLibre = it.estado === 'PASARELA_SIN_COBRO'
                          const sel = (esCobroLibre && mCobro === it.id) || (esTransLibre && mTrans === it.id)
                          const clickable = esCobroLibre || esTransLibre
                          const bg = sel ? 'var(--surface3)' : i % 2 === 1 ? 'var(--surface2)' : 'transparent'
                          return (
                            <tr
                              key={it.id}
                              onClick={
                                clickable
                                  ? () => {
                                      if (esCobroLibre) setMCobro(mCobro === it.id ? null : it.id)
                                      else setMTrans(mTrans === it.id ? null : it.id)
                                    }
                                  : undefined
                              }
                              style={{
                                borderTop: '1px solid var(--border)',
                                background: bg,
                                cursor: clickable ? 'pointer' : 'default',
                              }}
                            >
                              <td className="px-2 py-1 text-center font-mono" style={{ color: COL_COMUN }}>
                                {it.idPago ?? '—'}
                              </td>
                              <td className="px-2 py-1 text-center" style={{ color: COL_HIO }}>
                                {it.fechaHiopos ? fmtFechaHora(it.fechaHiopos) : '—'}
                              </td>
                              <td className="px-2 py-1 text-center" style={{ color: COL_HIO }}>
                                {it.terminal ?? '—'}
                              </td>
                              <td className="px-2 py-1 text-center" style={{ color: COL_HIO }}>
                                {it.medioPago ?? '—'}
                              </td>
                              <td className="px-2 py-1 text-center font-mono" style={{ color: COL_HIO }}>
                                {it.ultimos4 ?? '—'}
                              </td>
                              <td className="px-2 py-1 text-right font-mono" style={{ color: COL_HIO }}>
                                {it.montoHiopos != null ? monedaD(it.montoHiopos) : '—'}
                              </td>
                              <td className="px-2 py-1 text-center" style={{ color: COL_PAS }}>
                                {it.fechaPasarela ? fmtFechaHora(it.fechaPasarela) : '—'}
                              </td>
                              <td className="px-2 py-1 text-center font-semibold" style={{ color: COL_PAS }}>
                                {it.pasarela ?? '—'}
                              </td>
                              <td className="px-2 py-1 text-center font-mono" style={{ color: COL_PAS }}>
                                {it.dispositivo ?? '—'}
                              </td>
                              <td className="px-2 py-1 text-right font-mono" style={{ color: COL_PAS }}>
                                {it.montoPasarela != null ? monedaD(it.montoPasarela) : '—'}
                              </td>
                              <td className="px-2 py-1 text-center">
                                <span style={{ color: est.color, fontWeight: 600 }}>
                                  {est.txt}
                                  {it.manual ? ' (manual)' : ''}
                                </span>
                              </td>
                            </tr>
                          )
                        })
                      })()}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function Kpi({ label, valor, sub, color, onClick }: { label: string; valor: string; sub?: string; color?: string; onClick?: () => void }) {
  return (
    <div className={`pc-panel px-3 py-2${onClick ? ' cursor-pointer' : ''}`} onClick={onClick} title={onClick ? 'Ver detalle' : undefined}>
      <div className="flex items-center gap-1 text-[9.5px] uppercase tracking-wide" style={{ color: 'var(--muted2)' }}>
        {label}
        {onClick && <span style={{ color: 'var(--hio)' }}>›</span>}
      </div>
      <div className="text-[17px] font-bold leading-tight" style={{ color: color ?? 'var(--text)' }}>
        {valor}
      </div>
      {sub && (
        <div className="text-[9.5px] leading-tight" style={{ color: 'var(--muted)' }}>
          {sub}
        </div>
      )}
    </div>
  )
}

function ReactFragmentRow({
  e,
  exp,
  idx,
  activo,
  onToggle,
  onDetalle,
}: {
  e: EstabFila
  exp: boolean
  idx: number
  activo: boolean
  onToggle: () => void
  onDetalle: () => void
}) {
  const cC = 'px-2.5 py-2 text-center'
  const cM = 'px-2.5 py-2 text-right font-mono'
  const bgRow = activo ? 'var(--surface3)' : idx % 2 === 1 ? 'var(--surface2)' : 'transparent'
  return (
    <>
      <tr style={{ borderTop: '1px solid var(--border)', background: bgRow }}>
        <td className="cursor-pointer px-2.5 py-2 text-center" onClick={onToggle}>
          <span className="mr-1 text-[9px]" style={{ color: 'var(--muted)' }}>
            {e.terminales.length > 0 ? (exp ? '▼' : '▶') : '·'}
          </span>
          <span className="font-semibold" style={{ color: 'var(--text)' }}>
            {e.codTienda ? `${e.codTienda} · ` : ''}
            {e.nombre}
          </span>
        </td>
        <td className={cC}>{e.txHiopos}</td>
        <td className={cC}>{e.conciliadas + e.difMonto + e.txPasarelaSinCobro}</td>
        <td className={cC} style={{ color: 'var(--green)' }}>
          {e.conciliadas}
        </td>
        <td className={cC} style={{ color: e.pendientes + e.enRevision === 0 ? 'var(--green)' : 'var(--red)' }}>
          {e.pendientes + e.enRevision}
        </td>
        <td className={cC} style={{ color: e.txPasarelaSinCobro === 0 ? 'var(--green)' : 'var(--red)' }}>
          {e.txPasarelaSinCobro}
        </td>
        <td className={cM} style={{ color: 'var(--muted2)' }}>
          {moneda(e.montoHiopos)}
        </td>
        <td className={cM} style={{ color: 'var(--muted2)' }}>
          {moneda(e.montoPasarela + e.montoPasarelaSinCobro)}
        </td>
        {(() => {
          const dif = e.montoHiopos - (e.montoPasarela + e.montoPasarelaSinCobro)
          const pctDif = e.montoHiopos !== 0 ? (dif / e.montoHiopos) * 100 : 0
          const col = Math.abs(dif) >= 0.005 ? 'var(--red)' : 'var(--green)'
          return (
            <>
              <td className={cM} style={{ color: col }}>
                {moneda(dif)}
              </td>
              <td className={cC} style={{ color: col }}>
                {pctDif.toFixed(1)}%
              </td>
            </>
          )
        })()}
        <td className="px-2.5 py-2 text-center">
          <button onClick={onDetalle} className="text-[11px] font-semibold" style={{ color: 'var(--hio)' }}>
            Ver detalle
          </button>
        </td>
      </tr>
      {exp &&
        e.terminales.map((t) => {
          return (
            <tr key={t.codTerminal} style={{ background: 'var(--surface2)' }}>
              <td className="px-2 py-1 text-center text-[11px]" style={{ color: 'var(--muted2)' }}>
                {t.alias ? `${t.alias} (${t.codTerminal})` : `Term. ${t.codTerminal}`}
              </td>
              <td className={`${cC} text-[11px]`}>{t.txHiopos}</td>
              <td className={`${cC} text-[11px]`}>{t.conciliadas + t.difMonto}</td>
              <td className={`${cC} text-[11px]`} style={{ color: 'var(--green)' }}>
                {t.conciliadas}
              </td>
              <td className={`${cC} text-[11px]`} style={{ color: t.pendientes + t.enRevision === 0 ? 'var(--green)' : 'var(--red)' }}>
                {t.pendientes + t.enRevision}
              </td>
              <td className={`${cC} text-[11px]`} style={{ color: 'var(--muted)' }}>
                —
              </td>
              <td className={`${cM} text-[11px]`} style={{ color: 'var(--muted2)' }}>
                {moneda(t.montoHiopos)}
              </td>
              <td className={`${cM} text-[11px]`} style={{ color: 'var(--muted2)' }}>
                {moneda(t.montoPasarela)}
              </td>
              {(() => {
                const dif = t.montoHiopos - t.montoPasarela
                const pctDif = t.montoHiopos !== 0 ? (dif / t.montoHiopos) * 100 : 0
                const col = Math.abs(dif) >= 0.005 ? 'var(--red)' : 'var(--green)'
                return (
                  <>
                    <td className={`${cM} text-[11px]`} style={{ color: col }}>
                      {moneda(dif)}
                    </td>
                    <td className={`${cC} text-[11px]`} style={{ color: col }}>
                      {pctDif.toFixed(1)}%
                    </td>
                  </>
                )
              })()}
              <td></td>
            </tr>
          )
        })}
    </>
  )
}
