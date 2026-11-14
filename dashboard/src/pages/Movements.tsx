import { useCallback, useEffect, useState } from 'react'
import { Ban, Banknote, Clock, History, Inbox, Undo2, Wallet } from 'lucide-react'
import { getCashCut, getMovement, getMovements } from '../services/api'
import type { CashCut, CommercialMovement, MovementDetail, MovementFilters, MovementSummary } from '../services/api'
import { socket } from '../services/socket'
import KpiCard from '../components/ui/KpiCard'
import Panel from '../components/ui/Panel'
import EmptyState from '../components/ui/EmptyState'
import Segmented from '../components/ui/Segmented'
import { useStaffRoles } from '../utils/access'

const money = (value: number | null | undefined) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(Number(value) || 0)
const dateTime = (value: string | null | undefined) => (value ? new Date(value).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }) : '—')
const errorText = (error: unknown, fallback: string) => (error instanceof Error && error.message ? error.message : fallback)
const localToday = () => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

const METHOD_LABELS: Record<string, string> = { Cash: 'Efectivo', Card: 'Tarjeta', Transfer: 'Transferencia', unspecified: 'Sin registrar' }
const KIND_LABELS = { membership: 'Membresía', order: 'Tienda', adjustment: 'Ajuste de stock' } as const
const STATUS_VIEW: Record<string, { label: string; className: string }> = {
  paid: { label: 'Pagado', className: 'bg-green-100 text-green-800' },
  pending: { label: 'Pendiente', className: 'bg-yellow-100 text-yellow-800' },
  cancelled: { label: 'Cancelado', className: 'bg-red-100 text-red-800' },
  reverted: { label: 'Revertido', className: 'bg-slate-200 text-slate-700' },
  recorded: { label: 'Registrado', className: 'bg-sky-100 text-sky-800' },
}
const EVENT_LABELS: Record<string, string> = { requested: 'Solicitado en la app', created: 'Creado', paid: 'Cobrado', cancelled: 'Cancelado', reverted: 'Revertido', expired: 'Vencido', edited: 'Editado' }

function StatusBadge({ status }: { status: string }) {
  const view = STATUS_VIEW[status] ?? { label: status, className: 'bg-slate-100 text-slate-600' }
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${view.className}`}>{view.label}</span>
}

function Movements() {
  const roles = useStaffRoles()
  const isManager = roles.has('Admin')
  const [filters, setFilters] = useState<MovementFilters>(() => ({ from: localToday(), to: localToday(), type: 'all', page: 1, limit: 25 }))
  const [data, setData] = useState<{ items: CommercialMovement[]; total: number; summary: MovementSummary } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cut, setCut] = useState<CashCut | null>(null)
  const [cutError, setCutError] = useState<string | null>(null)
  const [detail, setDetail] = useState<MovementDetail | null>(null)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [isDetailOpen, setIsDetailOpen] = useState(false)

  const load = useCallback(async () => {
    try {
      const response = await getMovements(filters)
      setData({ items: response.items, total: response.total, summary: response.summary })
      setError(null)
    } catch (requestError) {
      setError(errorText(requestError, 'No se pudieron cargar los movimientos.'))
    }
  }, [filters])

  const loadCut = useCallback(async () => {
    try {
      setCut(await getCashCut({}))
      setCutError(null)
    } catch (requestError) {
      setCutError(errorText(requestError, 'No se pudo calcular el corte.'))
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => { void load() }, 200)
    return () => clearTimeout(timer)
  }, [load])

  useEffect(() => {
    const timer = setTimeout(() => { void loadCut() }, 0)
    return () => clearTimeout(timer)
  }, [loadCut])

  useEffect(() => {
    const refresh = () => { void load(); void loadCut() }
    const events = ['payment-updated', 'sale-updated']
    events.forEach((name) => socket.on(name, refresh))
    return () => { events.forEach((name) => socket.off(name, refresh)) }
  }, [load, loadCut])

  function update(patch: Partial<MovementFilters>) {
    setFilters((current) => ({ ...current, ...patch, page: patch.page ?? 1 }))
  }

  async function openDetail(movement: CommercialMovement) {
    if (movement.kind === 'adjustment') return
    setIsDetailOpen(true); setDetail(null); setDetailError(null)
    try {
      setDetail(await getMovement(movement.kind, movement.id))
    } catch (requestError) {
      setDetailError(errorText(requestError, 'No se pudo cargar el movimiento.'))
    }
  }

  const summary = data?.summary
  const pages = data ? Math.max(1, Math.ceil(data.total / (filters.limit ?? 25))) : 1
  const typeOptions = [['all', 'Todo'], ['membership', 'Membresías'], ['order', 'Tienda'], ...(isManager ? [['adjustment', 'Ajustes'] as const] : [])] as ReadonlyArray<readonly ['all' | 'membership' | 'order' | 'adjustment', string]>
  const fieldClass = 'rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100'

  return (
    <section className="min-h-screen bg-canvas px-4 py-8 sm:px-8 sm:py-10">
      <p className="text-sm font-medium uppercase tracking-[0.25em] text-slate-500">Comercial</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-900">Movimientos</h1>
      <p className="mt-3 text-slate-500">Cobros de membresía, ventas de tienda{isManager ? ' y ajustes de inventario' : ''} en un solo lugar.</p>

      <div className="mt-6 flex flex-wrap items-end gap-3">
        <label className="text-sm text-slate-600">Desde<input className={`${fieldClass} mt-1 block`} type="date" value={filters.from ?? ''} onChange={(event) => update({ from: event.target.value || undefined })} /></label>
        <label className="text-sm text-slate-600">Hasta<input className={`${fieldClass} mt-1 block`} type="date" value={filters.to ?? ''} onChange={(event) => update({ to: event.target.value || undefined })} /></label>
        <label className="text-sm text-slate-600">Estado
          <select className={`${fieldClass} mt-1 block`} value={filters.status ?? ''} onChange={(event) => update({ status: event.target.value || undefined })}>
            <option value="">Todos</option>
            {['paid', 'pending', 'cancelled', 'reverted'].map((status) => <option key={status} value={status}>{STATUS_VIEW[status].label}</option>)}
          </select>
        </label>
        <label className="text-sm text-slate-600">Forma de pago
          <select className={`${fieldClass} mt-1 block`} value={filters.method ?? ''} onChange={(event) => update({ method: event.target.value || undefined })}>
            <option value="">Todas</option>
            {['Cash', 'Card', 'Transfer'].map((method) => <option key={method} value={method}>{METHOD_LABELS[method]}</option>)}
          </select>
        </label>
        <Segmented label="Tipo" value={filters.type ?? 'all'} options={typeOptions} onChange={(type) => update({ type })} />
      </div>

      {error && <p className="mt-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{error}</p>}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Cobrado" value={money(summary?.collected.total)} icon={Banknote} tone="brand" isLoading={!summary}
          hint={summary ? `${summary.collected.count} cobro(s) · membresías ${money(summary.collected.byKind.membership)} · tienda ${money(summary.collected.byKind.order)}` : undefined} />
        <KpiCard label="Por cobrar" value={money(summary?.pending.total)} icon={Clock} tone="warning" isLoading={!summary} hint={summary ? `${summary.pending.count} solicitud(es) o pedido(s)` : undefined} />
        <KpiCard label="Cancelado" value={money(summary?.cancelled.total)} icon={Ban} isLoading={!summary} hint={summary ? `${summary.cancelled.count} sin cobrar` : undefined} />
        <KpiCard label="Revertido" value={money(summary?.reverted.total)} icon={Undo2} isLoading={!summary} hint="Cobrado y revertido; no registra reembolso." />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Panel className="xl:col-span-2" title="Detalle" icon={History} description={data ? `${data.total} movimiento(s)` : undefined}>
          {!data && !error && <p className="text-sm text-slate-500">Cargando...</p>}
          {data && data.items.length === 0 && <EmptyState icon={Inbox} title="Sin movimientos">Cambia las fechas o los filtros.</EmptyState>}
          {data && data.items.length > 0 && (
            <div className="-mx-5 overflow-x-auto sm:-mx-6">
              <table className="min-w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-wider text-slate-500">
                  <tr><th className="px-5 py-2 font-medium sm:px-6">Fecha</th><th className="px-3 py-2 font-medium">Movimiento</th><th className="px-3 py-2 font-medium">Socio</th><th className="px-3 py-2 font-medium">Estado</th><th className="px-3 py-2 text-right font-medium">Importe</th><th className="px-5 py-2 font-medium sm:px-6">Atendió</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.items.map((item) => (
                    <tr className={item.kind === 'adjustment' ? '' : 'cursor-pointer hover:bg-slate-50'} key={`${item.kind}-${item.id}`} onClick={() => void openDetail(item)}>
                      <td className="whitespace-nowrap px-5 py-3 text-slate-500 sm:px-6">{dateTime(item.at)}</td>
                      <td className="px-3 py-3">
                        <span className="block font-medium text-ink">{KIND_LABELS[item.kind]}{item.kind === 'membership' && item.description ? ` · ${item.description}` : ''}{item.kind === 'adjustment' ? ` · ${item.description}` : ''}</span>
                        <span className="block text-xs text-slate-500">
                          {item.kind === 'order' ? `${item.itemCount ?? 0} producto(s)` : ''}
                          {item.kind === 'adjustment' ? `${item.quantityBefore} → ${item.quantityAfter}${item.reason ? ` · ${item.reason}` : ''}` : ''}
                          {item.method ? `${item.kind === 'order' ? ' · ' : ''}${METHOD_LABELS[item.method] ?? item.method}` : ''}
                          {item.checkoutId ? ' · cobro combinado' : ''}
                          {` · ${item.gym.name}`}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-slate-700">{item.client?.name ?? '—'}</td>
                      <td className="px-3 py-3"><StatusBadge status={item.status} /></td>
                      <td className="whitespace-nowrap px-3 py-3 text-right font-medium text-ink">{item.kind === 'adjustment' ? `${(item.change ?? 0) > 0 ? '+' : ''}${item.change} u.` : money(item.amount)}</td>
                      <td className="px-5 py-3 text-slate-500 sm:px-6">{item.staff?.name ?? (item.status === 'pending' ? 'App' : '—')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {data && pages > 1 && (
            <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
              <button className="rounded-lg px-3 py-1 hover:text-ink disabled:opacity-40" type="button" disabled={(filters.page ?? 1) <= 1} onClick={() => update({ page: (filters.page ?? 1) - 1 })}>Anterior</button>
              <span>{filters.page} / {pages}</span>
              <button className="rounded-lg px-3 py-1 hover:text-ink disabled:opacity-40" type="button" disabled={(filters.page ?? 1) >= pages} onClick={() => update({ page: (filters.page ?? 1) + 1 })}>Siguiente</button>
            </div>
          )}
        </Panel>

        <Panel title="Corte de hoy" icon={Wallet} description={cut ? `Día ${cut.date} (${cut.timezone})` : undefined}>
          {cutError && <p className="text-sm text-red-700" role="alert">{cutError}</p>}
          {!cut && !cutError && <p className="text-sm text-slate-500">Calculando...</p>}
          {cut && (
            <div className="space-y-4 text-sm">
              <div className="flex items-end justify-between"><span className="text-slate-600">Total cobrado</span><span className="text-2xl font-semibold text-ink">{money(cut.summary.collected.total)}</span></div>
              <ul className="space-y-1">
                {Object.entries(cut.summary.collected.byMethod).map(([method, amount]) => (
                  <li className="flex justify-between" key={method}><span className="text-slate-600">{METHOD_LABELS[method] ?? method}</span><span className="font-medium">{money(amount)}</span></li>
                ))}
                {Object.keys(cut.summary.collected.byMethod).length === 0 && <li className="text-slate-500">Sin cobros hoy.</li>}
              </ul>
              {cut.summary.collected.discounts > 0 && <p className="text-xs text-slate-500">Descuentos por promociones: {money(cut.summary.collected.discounts)}</p>}
              {cut.byStaff.length > 0 && (
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Por persona</p>
                  <ul className="mt-2 divide-y divide-slate-100">
                    {cut.byStaff.map((entry) => (
                      <li className="py-2" key={entry.id ?? 'unknown'}>
                        <div className="flex justify-between"><span className="text-slate-700">{entry.name}</span><span className="font-medium">{money(entry.total)}</span></div>
                        <p className="text-xs text-slate-500">{Object.entries(entry.byMethod).map(([method, amount]) => `${METHOD_LABELS[method] ?? method} ${money(amount)}`).join(' · ')}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {cut.summary.reverted.count > 0 && <p className="text-xs text-slate-500">{cut.summary.reverted.count} cobro(s) revertido(s) hoy por {money(cut.summary.reverted.total)}: no se incluyen en el total y no registran reembolso.</p>}
            </div>
          )}
        </Panel>
      </div>

      {isDetailOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4 backdrop-blur-sm">
          <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.2em] text-emerald-700">{detail ? KIND_LABELS[detail.kind] : 'Movimiento'}</p>
                {detail && <h2 className="mt-2 text-2xl font-semibold text-slate-900">{money(Number(detail.record.amount ?? detail.record.totalAmount))}</h2>}
              </div>
              <button className="text-2xl leading-none text-slate-400 hover:text-slate-700" type="button" aria-label="Cerrar" onClick={() => setIsDetailOpen(false)}>×</button>
            </div>
            {detailError && <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{detailError}</p>}
            {!detail && !detailError && <p className="mt-4 text-sm text-slate-500">Cargando...</p>}
            {detail && (
              <div className="mt-4 space-y-5 text-sm">
                <div className="flex items-center gap-2"><StatusBadge status={detail.record.status} />{typeof detail.record.paymentMethod === 'string' && <span className="text-slate-500">{METHOD_LABELS[detail.record.paymentMethod] ?? detail.record.paymentMethod}</span>}</div>
                <ol className="space-y-3 border-l border-slate-200 pl-4">
                  {detail.timeline.map((event, index) => (
                    <li key={`${event.type}-${index}`}>
                      <p className="font-medium text-ink">{EVENT_LABELS[event.type] ?? event.type}</p>
                      <p className="text-xs text-slate-500">{dateTime(event.at)}{event.by?.name ? ` · ${event.by.name}` : ''}</p>
                      {event.reason && <p className="text-xs text-slate-600">Motivo: {event.reason}</p>}
                    </li>
                  ))}
                </ol>
                {detail.related && (
                  <p className="rounded-lg bg-slate-50 px-4 py-3 text-slate-600">
                    Cobrado junto con {detail.related.kind === 'order' ? `productos por ${money(detail.related.totalAmount)}` : `la membresía ${detail.related.planName ?? ''} por ${money(detail.related.amount)}`}.
                  </p>
                )}
                {detail.stockMovements.length > 0 && (
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Inventario</p>
                    <ul className="mt-1 space-y-1">
                      {detail.stockMovements.map((movement) => <li key={movement._id} className="text-slate-600">{movement.productId?.name ?? 'Producto'}: {movement.quantityBefore} → {movement.quantityAfter}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

export default Movements
