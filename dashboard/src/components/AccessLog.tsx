import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, History, Search } from 'lucide-react'
import { getAccessLogs, type AccessLogEntry, type AccessLogEvent, type AccessLogFilters } from '../services/api'
import { useAuth } from '../store/useAuth'
import { denialTitleForCode, formatGymTime } from '../utils/accessReasons'
import Panel from './ui/Panel'
import Badge, { type BadgeTone } from './ui/Badge'
import EmptyState from './ui/EmptyState'
import { errorAlert, fieldClass, iconButton, tableHeadClass, tdClass, thClass } from './ui/styles'

const EVENT_COPY: Record<AccessLogEvent, { label: string; tone: BadgeTone }> = {
  'check-in': { label: 'Entrada', tone: 'success' },
  'check-out': { label: 'Salida', tone: 'neutral' },
  denied: { label: 'Rechazado', tone: 'danger' },
}

const SEARCH_DELAY_MS = 350

function entryDetail(entry: AccessLogEntry) {
  if (entry.event === 'denied') return `${denialTitleForCode(entry.reason?.code)}: ${entry.reason?.message ?? ''}`
  // The API closes a check-in left open: the client entered another gym, or scanned again after 4 hours.
  if (entry.source === 'auto') {
    return entry.reason?.code === 'max_stay' ? 'Salida automática: más de 4 h sin registrar la salida' : 'Salida automática al entrar a otra sucursal'
  }
  if (entry.device) return `Torniquete ${entry.device}`
  if (entry.validatedBy) return `Escaneado por ${entry.validatedBy}`
  return '—'
}

const filterField = fieldClass.replace('w-full ', '')

// Entries, exits and refused attempts at the visible gyms, newest first. Times are in each gym's own zone.
function AccessLog() {
  const { isAllGyms, organizationGyms } = useAuth()
  const [filters, setFilters] = useState<AccessLogFilters>({ page: 1 })
  const [searchInput, setSearchInput] = useState('')
  const [result, setResult] = useState<{ key: string; entries: AccessLogEntry[]; total: number; pageSize: number; error?: string } | null>(null)

  // Typing waits a moment before searching.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setFilters((current) => (current.search ?? '') === searchInput.trim() ? current : { ...current, search: searchInput.trim(), page: 1 })
    }, SEARCH_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [searchInput])

  const requestKey = JSON.stringify(filters)
  useEffect(() => {
    let isMounted = true
    getAccessLogs(filters)
      .then((response) => { if (isMounted) setResult({ key: requestKey, ...response }) })
      .catch((requestError: unknown) => {
        if (isMounted) {
          setResult({ key: requestKey, entries: [], total: 0, pageSize: 50, error: requestError instanceof Error ? requestError.message : 'No se pudo cargar la bitácora.' })
        }
      })
    return () => { isMounted = false }
  }, [filters, requestKey])

  // Any filter change goes back to the first page.
  function updateFilter(change: Partial<AccessLogFilters>) {
    setFilters((current) => ({ ...current, ...change, page: 1 }))
  }

  const isLoading = result?.key !== requestKey
  const page = filters.page ?? 1
  const totalPages = result ? Math.max(1, Math.ceil(result.total / result.pageSize)) : 1
  const showGym = isAllGyms && organizationGyms.length > 1

  return (
    <Panel title="Bitácora" icon={History} description={result ? `${result.total.toLocaleString('es-MX')} registro${result.total === 1 ? '' : 's'}` : undefined}>
      <div className="flex flex-wrap items-end gap-3">
        <label className="relative block w-full sm:max-w-xs">
          <span className="sr-only">Buscar cliente</span>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} aria-hidden />
          <input className={`${fieldClass} pl-10`} type="search" placeholder="Buscar cliente" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} />
        </label>
        {showGym && (
          <select className={filterField} aria-label="Sucursal" value={filters.gymId ?? ''} onChange={(event) => updateFilter({ gymId: event.target.value || undefined })}>
            <option value="">Todas las sucursales</option>
            {organizationGyms.map((gym) => <option key={gym.id} value={gym.id}>{gym.name}</option>)}
          </select>
        )}
        <select className={filterField} aria-label="Evento" value={filters.event ?? ''} onChange={(event) => updateFilter({ event: (event.target.value || undefined) as AccessLogEvent | undefined })}>
          <option value="">Todos los eventos</option>
          <option value="check-in">Entradas</option>
          <option value="check-out">Salidas</option>
          <option value="denied">Rechazados</option>
        </select>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          Desde
          <input className={filterField} type="date" value={filters.from ?? ''} max={filters.to} onChange={(event) => updateFilter({ from: event.target.value || undefined })} />
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          Hasta
          <input className={filterField} type="date" value={filters.to ?? ''} min={filters.from} onChange={(event) => updateFilter({ to: event.target.value || undefined })} />
        </label>
      </div>

      {result?.error && !isLoading && <p className={`${errorAlert} mt-4`} role="alert">{result.error}</p>}

      <div className="mt-4">
        {!result ? (
          <div className="space-y-3" aria-busy="true" aria-label="Cargando bitácora">
            {Array.from({ length: 5 }).map((_, index) => <div className="skeleton h-12 w-full" key={index} />)}
          </div>
        ) : result.entries.length === 0 ? (
          <EmptyState icon={History} title={isLoading ? 'Cargando...' : 'Sin accesos'}>
            {isLoading ? undefined : 'No hay accesos con estos filtros.'}
          </EmptyState>
        ) : (
          <div className={`-mx-5 overflow-x-auto transition-opacity sm:-mx-6 ${isLoading ? 'opacity-50' : ''}`} aria-busy={isLoading}>
            <table className="min-w-full text-left text-sm">
              <thead className={tableHeadClass}>
                <tr>
                  <th className={thClass}>Fecha y hora</th>
                  <th className={thClass}>Cliente</th>
                  {showGym && <th className={thClass}>Sucursal</th>}
                  <th className={thClass}>Evento</th>
                  <th className={thClass}>Detalle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {result.entries.map((entry) => (
                  <tr className="transition-colors hover:bg-slate-50/70" key={entry.id}>
                    <td className={`${tdClass} whitespace-nowrap text-slate-500 tabular`}>{formatGymTime(entry.occurredAt, entry.gym.timezone, true)}</td>
                    <td className={tdClass}>
                      <p className="font-medium text-ink">{entry.client?.name ?? 'Cliente eliminado'}</p>
                      {entry.client?.email && <p className="text-xs text-slate-500">{entry.client.email}</p>}
                    </td>
                    {showGym && <td className={`${tdClass} whitespace-nowrap`}>{entry.gym.name}</td>}
                    <td className={tdClass}><Badge tone={EVENT_COPY[entry.event].tone}>{EVENT_COPY[entry.event].label}</Badge></td>
                    <td className={`${tdClass} min-w-[220px] text-slate-600`}>{entryDetail(entry)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {result && totalPages > 1 && (
        <div className="mt-4 flex items-center justify-end gap-2 text-sm text-slate-600">
          <button className={iconButton} type="button" aria-label="Página anterior" disabled={page <= 1 || isLoading} onClick={() => setFilters((current) => ({ ...current, page: page - 1 }))}>
            <ChevronLeft size={18} aria-hidden />
          </button>
          <span className="tabular">Página {page} de {totalPages}</span>
          <button className={iconButton} type="button" aria-label="Página siguiente" disabled={page >= totalPages || isLoading} onClick={() => setFilters((current) => ({ ...current, page: page + 1 }))}>
            <ChevronRight size={18} aria-hidden />
          </button>
        </div>
      )}
    </Panel>
  )
}

export default AccessLog
