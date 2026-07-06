'use client'

export interface Resultado {
  procesados: number
  ok: number
  diferenciaMonto: number
  enRevision: number
  sinTransaccion: number
  noAplica: number
  excepciones: number
}
export interface EstablecimientoMes {
  id: string
  nombre: string
  codTienda: string | null
  ok: number
  diferenciaMonto: number
  enRevision: number
  sinTransaccion: number
  total: number
}
export interface CoberturaPasarela {
  proveedor: string
  nombre: string
  cobros: number
  transacciones: number
  estado: 'CONCILIADA' | 'SIN_EXTRACTO' | 'NO_CONCILIABLE'
}
export interface Resumen {
  periodo: string
  cobros: number
  transacciones: number
  resultado: Resultado
  establecimientos: EstablecimientoMes[]
  cobertura: CoberturaPasarela[]
}

const COLOR_COBERTURA: Record<string, string> = {
  CONCILIADA: 'var(--green)',
  SIN_EXTRACTO: 'var(--red)',
  NO_CONCILIABLE: 'var(--muted2)',
}
const TEXTO_COBERTURA: Record<string, string> = {
  CONCILIADA: 'conciliada',
  SIN_EXTRACTO: 'sin extracto',
  NO_CONCILIABLE: 'no conciliable',
}

export function ResumenMes({ resumen }: { resumen: Resumen }) {
  const r = resumen.resultado
  const total = r.procesados || 1
  const pct = (n: number) => Math.round((100 * n) / total)

  return (
    <div className="space-y-5">
      <p className="font-mono text-[11px]" style={{ color: 'var(--muted)' }}>
        {resumen.cobros} cobros HIOPOS · {resumen.transacciones} transacciones · período{' '}
        <span style={{ color: 'var(--text)' }}>{resumen.periodo}</span>
      </p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Conciliado" valor={r.ok} sub={`${pct(r.ok)}%`} color="var(--green)" />
        <Kpi label="En revisión" valor={r.enRevision + r.diferenciaMonto} sub={`${pct(r.enRevision + r.diferenciaMonto)}%`} color="var(--amber)" />
        <Kpi label="Sin transacción" valor={r.sinTransaccion} sub={`${pct(r.sinTransaccion)}%`} color="var(--red)" />
        <Kpi label="No aplica" valor={r.noAplica} sub="otros medios" color="var(--muted2)" />
      </div>

      {/* Cobertura */}
      <div className="pc-panel overflow-hidden">
        <div className="border-b px-4 py-2.5 text-[11px] font-semibold" style={{ borderColor: 'var(--border)' }}>
          Cobertura por pasarela
        </div>
        {resumen.cobertura.length === 0 ? (
          <div className="px-4 py-6 text-center text-[12px]" style={{ color: 'var(--muted)' }}>
            Sin datos de este mes.
          </div>
        ) : (
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-left text-[9.5px] uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
                <th className="px-4 py-2 font-semibold">Pasarela</th>
                <th className="px-3 py-2 text-right font-semibold">Cobros HIOPOS</th>
                <th className="px-3 py-2 text-right font-semibold">Transacciones</th>
                <th className="px-4 py-2 text-right font-semibold">Estado</th>
              </tr>
            </thead>
            <tbody>
              {resumen.cobertura.map((c) => (
                <tr key={c.proveedor} className="border-t" style={{ borderColor: 'var(--border)' }}>
                  <td className="px-4 py-2" style={{ color: 'var(--text)' }}>
                    {c.nombre}
                  </td>
                  <td className="px-3 py-2 text-right font-mono" style={{ color: 'var(--muted2)' }}>
                    {c.cobros}
                  </td>
                  <td className="px-3 py-2 text-right font-mono" style={{ color: 'var(--muted2)' }}>
                    {c.transacciones}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <span className="pc-badge" style={{ color: COLOR_COBERTURA[c.estado] }}>
                      {TEXTO_COBERTURA[c.estado]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {resumen.cobertura.some((c) => c.estado === 'SIN_EXTRACTO') && (
          <div className="border-t px-4 py-2 text-[10.5px]" style={{ borderColor: 'var(--border)', color: 'var(--red)' }}>
            ⚠ Hay pasarelas con cobros en HIOPOS pero sin extracto cargado: no se están conciliando.
          </div>
        )}
      </div>

      {/* Por establecimiento */}
      {resumen.establecimientos.length > 0 && (
        <div className="pc-panel overflow-hidden">
          <div className="border-b px-4 py-2.5 text-[11px] font-semibold" style={{ borderColor: 'var(--border)' }}>
            Por establecimiento
          </div>
          <table className="w-full text-[11.5px]">
            <thead>
              <tr className="text-[9.5px] uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
                <th className="px-4 py-2 text-left font-semibold">Tienda</th>
                <th className="px-3 py-2 text-right font-semibold">Conciliado</th>
                <th className="px-3 py-2 text-right font-semibold">Revisión</th>
                <th className="px-3 py-2 text-right font-semibold">Sin trans.</th>
                <th className="px-4 py-2 text-right font-semibold">% auto</th>
              </tr>
            </thead>
            <tbody>
              {resumen.establecimientos.map((e) => {
                const revision = e.enRevision + e.diferenciaMonto
                const p = e.total ? Math.round((100 * e.ok) / e.total) : 0
                return (
                  <tr key={e.id} className="border-t" style={{ borderColor: 'var(--border)' }}>
                    <td className="px-4 py-2">
                      <div style={{ color: 'var(--text)' }}>{e.nombre}</div>
                      {e.codTienda && (
                        <div className="font-mono text-[9px]" style={{ color: 'var(--muted)' }}>
                          #{e.codTienda}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-mono" style={{ color: 'var(--green)' }}>
                      {e.ok}
                    </td>
                    <td className="px-3 py-2 text-right font-mono" style={{ color: revision ? 'var(--amber)' : 'var(--muted)' }}>
                      {revision}
                    </td>
                    <td className="px-3 py-2 text-right font-mono" style={{ color: e.sinTransaccion ? 'var(--red)' : 'var(--muted)' }}>
                      {e.sinTransaccion}
                    </td>
                    <td className="px-4 py-2 text-right font-mono" style={{ color: 'var(--muted2)' }}>
                      {p}%
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function Kpi({ label, valor, sub, color }: { label: string; valor: number; sub: string; color: string }) {
  return (
    <div className="pc-panel relative overflow-hidden p-4">
      <div className="absolute inset-x-0 top-0 h-0.5" style={{ background: color }} />
      <div className="text-[9.5px] font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
        {label}
      </div>
      <div className="mt-1.5 font-mono text-2xl font-semibold" style={{ color }}>
        {valor}
      </div>
      <div className="text-[9.5px]" style={{ color: 'var(--muted)' }}>
        {sub}
      </div>
    </div>
  )
}
