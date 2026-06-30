'use client'

import { useState } from 'react'

interface Cobro {
  id: string
  fechaHora: string
  importe: string
  medioPago: string
  marca: string | null
  ultimos4: string | null
  tipoTarjeta: string | null
  cuotas: number
  estadoOp: string
}
interface Trans {
  id: string
  fechaHora: string
  importe: string
  marca: string | null
  ultimos4: string | null
  tipoTarjeta: string | null
  cuotas: number
  codAutorizacion: string | null
  idExterno: string
}
interface Data {
  tenant: string
  cobros: Cobro[]
  transacciones: Trans[]
}

const fmtMonto = (s: string) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2 }).format(Number(s))
const fmtFecha = (s: string) =>
  new Date(s).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

export default function ManualPage() {
  const [tenant, setTenant] = useState('Rochino')
  const [data, setData] = useState<Data | null>(null)
  const [cobroId, setCobroId] = useState<string | null>(null)
  const [transId, setTransId] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  async function cargar() {
    setCargando(true)
    setError(null)
    setAviso(null)
    setCobroId(null)
    setTransId(null)
    try {
      const res = await fetch(`/api/manual?tenant=${encodeURIComponent(tenant)}`)
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

  async function confirmar() {
    if (!cobroId || !transId) return
    setError(null)
    setAviso(null)
    try {
      const res = await fetch('/api/manual', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tenant, cobroId, transaccionId: transId }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'No se pudo confirmar')
      setAviso(`Match confirmado · estado ${json.estadoOp}`)
      await cargar()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const cobro = data?.cobros.find((c) => c.id === cobroId)
  const trans = data?.transacciones.find((t) => t.id === transId)
  const dif = cobro && trans ? Number(cobro.importe) - Number(trans.importe) : null

  return (
    <div className="mx-auto max-w-6xl pb-24">
      <div className="mb-5 flex items-end gap-3">
        <div>
          <h1 className="text-lg font-bold tracking-tight">Conciliación manual</h1>
          <p className="mt-1 text-[12.5px]" style={{ color: 'var(--muted2)' }}>
            Seleccioná un cobro y la transacción que le corresponde, y confirmá el cruce.
          </p>
        </div>
        <div className="ml-auto flex items-end gap-2">
          <input
            value={tenant}
            onChange={(e) => setTenant(e.target.value)}
            className="pc-input px-3 py-1.5 text-[12px]"
            placeholder="Cliente"
          />
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

      {data && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Columna titulo="Cobros sin conciliar" color="var(--amber)" vacio="Sin cobros pendientes 🎉" count={data.cobros.length}>
            {data.cobros.map((c) => (
              <Fila key={c.id} sel={c.id === cobroId} onClick={() => setCobroId(c.id === cobroId ? null : c.id)}>
                <Linea
                  monto={c.importe}
                  fecha={c.fechaHora}
                  marca={c.marca}
                  ult4={c.ultimos4}
                  tipo={c.tipoTarjeta}
                  cuotas={c.cuotas}
                  extra={c.estadoOp === 'SIN_TRANSACCION' ? 'sin transacción' : 'en revisión'}
                />
              </Fila>
            ))}
          </Columna>

          <Columna
            titulo="Transacciones sueltas (Payway)"
            color="var(--cyan)"
            vacio="Sin transacciones libres"
            count={data.transacciones.length}
          >
            {data.transacciones.map((t) => (
              <Fila key={t.id} sel={t.id === transId} onClick={() => setTransId(t.id === transId ? null : t.id)}>
                <Linea
                  monto={t.importe}
                  fecha={t.fechaHora}
                  marca={t.marca}
                  ult4={t.ultimos4}
                  tipo={t.tipoTarjeta}
                  cuotas={t.cuotas}
                  extra={t.codAutorizacion ? `aut ${t.codAutorizacion}` : t.idExterno}
                />
              </Fila>
            ))}
          </Columna>
        </div>
      )}

      {/* Barra de acción flotante */}
      {(cobro || trans) && (
        <div
          className="fixed bottom-0 left-56 right-0 flex items-center gap-4 border-t px-5 py-3"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
        >
          <div className="flex items-center gap-3 text-[12px]">
            <span style={{ color: 'var(--muted)' }}>Cobro</span>
            <span className="font-mono" style={{ color: cobro ? 'var(--text)' : 'var(--muted)' }}>
              {cobro ? fmtMonto(cobro.importe) : '—'}
            </span>
            <span style={{ color: 'var(--muted)' }}>↔ Trans.</span>
            <span className="font-mono" style={{ color: trans ? 'var(--text)' : 'var(--muted)' }}>
              {trans ? fmtMonto(trans.importe) : '—'}
            </span>
            {dif !== null && (
              <span
                className="pc-badge"
                style={{ color: Math.abs(dif) < 0.005 ? 'var(--green)' : 'var(--red)' }}
              >
                {Math.abs(dif) < 0.005 ? 'sin diferencia' : `dif ${fmtMonto(String(dif))}`}
              </span>
            )}
          </div>
          <button
            onClick={confirmar}
            disabled={!cobro || !trans}
            className="ml-auto rounded-lg px-4 py-2 text-[12px] font-semibold disabled:opacity-40"
            style={{ background: 'var(--green)', color: '#04140b' }}
          >
            Confirmar match
          </button>
        </div>
      )}
    </div>
  )
}

function Columna({
  titulo,
  color,
  count,
  vacio,
  children,
}: {
  titulo: string
  color: string
  count: number
  vacio: string
  children: React.ReactNode
}) {
  return (
    <div className="pc-panel overflow-hidden">
      <div
        className="flex items-center justify-between border-b px-4 py-2.5 text-[11px] font-semibold"
        style={{ borderColor: 'var(--border)' }}
      >
        <span style={{ color }}>{titulo}</span>
        <span className="font-mono text-[10px]" style={{ color: 'var(--muted)' }}>
          {count}
        </span>
      </div>
      <div className="max-h-[60vh] overflow-y-auto">
        {count === 0 ? (
          <div className="px-4 py-8 text-center text-[12px]" style={{ color: 'var(--muted)' }}>
            {vacio}
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  )
}

function Fila({ sel, onClick, children }: { sel: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <div
      onClick={onClick}
      className="cursor-pointer border-b px-4 py-2.5"
      style={{
        borderColor: 'var(--border)',
        background: sel ? 'var(--surface3)' : 'transparent',
        boxShadow: sel ? 'inset 2px 0 0 var(--cyan)' : 'none',
      }}
    >
      {children}
    </div>
  )
}

function Linea({
  monto,
  fecha,
  marca,
  ult4,
  tipo,
  cuotas,
  extra,
}: {
  monto: string
  fecha: string
  marca: string | null
  ult4: string | null
  tipo: string | null
  cuotas: number
  extra: string
}) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <div className="font-mono text-[13px]" style={{ color: 'var(--text)' }}>
          {fmtMonto(monto)}
        </div>
        <div className="text-[10px]" style={{ color: 'var(--muted)' }}>
          {fmtFecha(fecha)}
          {marca ? ` · ${marca}` : ''}
          {ult4 ? ` ····${ult4}` : ''}
          {tipo ? ` · ${tipo === 'CREDITO' ? 'créd' : 'déb'}` : ''}
          {cuotas > 1 ? ` · ${cuotas}c` : ''}
        </div>
      </div>
      <div className="font-mono text-[9.5px]" style={{ color: 'var(--muted)' }}>
        {extra}
      </div>
    </div>
  )
}
