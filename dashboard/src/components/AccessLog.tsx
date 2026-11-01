import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { getAccessLogs, type AccessLogEntry, type AccessLogEvent, type AccessLogFilters } from '../services/api'
import { useAuth } from '../store/useAuth'
import { denialTitleForCode, formatGymTime } from '../utils/accessReasons'

const EVENT_COPY: Record<AccessLogEvent, { label: string; tone: string }> = {
  'check-in': { label: 'Entrada', tone: 'bg-green-100 text-green-800' },
  'check-out': { label: 'Salida', tone: 'bg-slate-100 text-slate-700' },
  denied: { label: 'Rechazado', tone: 'bg-red-100 text-red-800' },
}

const SEARCH_DELAY_MS = 350

function entryDetail(entry: AccessLogEntry) {
  if (entry.event === 'denied') return `${denialTitleForCode(entry.reason?.code)}: ${entry.reason?.message ?? ''}`
  if (entry.source === 'auto') return 'Salida automática al entrar a otra sucursal'
  if (entry.device) return `Torniquete ${entry.device}`
  if (entry.validatedBy) return `Escaneado por ${entry.validatedBy}`
  return '—'
}

const fieldClass = 'rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-100'

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
    <div className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
      <div className="flex flex-wrap items-end gap-3 border-b border-slate-100 p-4">
        <input
          className={`${fieldClass} w-full max-w-xs`}
          type="search"
          placeholder="Buscar cliente..."
          aria-label="Buscar cliente"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
        />
        {showGym && (
          <select className={fieldClass} aria-label="Sucursal" value={filters.gymId ?? ''} onChange={(event) => updateFilter({ gymId: event.target.value || undefined })}>
            <option value="">Todas las sucursales</option>
            {organizationGyms.map((gym) => <option key={gym.id} value={gym.id}>{gym.name}</option>)}
          </select>
        )}
        <select
          className={fieldClass}
          aria-label="Evento"
          value={filters.event ?? ''}
          onChange={(event) => updateFilter({ event: (event.target.value || undefined) as AccessLogEvent | undefined })}
        >
          <option value="">Todos los eventos</option>
          <option value="check-in">Entradas</option>
          <option value="check-out">Salidas</option>
          <option value="denied">Rechazados</option>
        </select>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          Desde
          <input className={fieldClass} type="date" value={filters.from ?? ''} max={filters.to} onChange={(event) => updateFilter({ from: event.target.value || undefined })} />
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          Hasta
          <input className={fieldClass} type="date" value={filters.to ?? ''} min={filters.from} onChange={(event) => updateFilter({ to: event.target.value || undefined })} />
        </label>
      </div>

      {result?.error && !isLoading && (
        <p className="border-b border-red-100 bg-red-50 px-6 py-3 text-sm text-red-700" role="alert">{result.error}</p>
      )}

      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm" aria-busy={isLoading}>
          <thead className="border-b border-slate-100 bg-slate-50/80 text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-6 py-3 font-medium">Fecha y hora</th>
              <th className="px-6 py-3 font-medium">Cliente</th>
              {showGym && <th className="px-6 py-3 font-medium">Sucursal</th>}
              <th className="px-6 py-3 font-medium">Evento</th>
              <th className="px-6 py-3 font-medium">Detalle</th>
            </tr>
          </thead>
          <tbody className={`divide-y divide-slate-100 text-slate-700 ${isLoading ? 'opacity-50' : ''}`}>
            {result?.entries.length ? result.entries.map((entry) => (
              <tr className="transition-colors hover:bg-slate-50" key={entry.id}>
                <td className="whitespace-nowrap px-6 py-3 text-slate-500">{formatGymTime(entry.occurredAt, entry.gym.timezone, true)}</td>
                <td className="px-6 py-3">
                  <p className="font-medium text-slate-900">{entry.client?.name ?? 'Cliente eliminado'}</p>
                  {entry.client?.email && <p className="text-xs text-slate-500">{entry.client.email}</p>}
                </td>
                {showGym && <td className="whitespace-nowrap px-6 py-3">{entry.gym.name}</td>}
                <td className="px-6 py-3">
                  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${EVENT_COPY[entry.event].tone}`}>{EVENT_COPY[entry.event].label}</span>
                </td>
                <td className="px-6 py-3 text-slate-600">{entryDetail(entry)}</td>
              </tr>
            )) : (
              <tr>
                <td className="px-6 py-10 text-center text-sm text-slate-500" colSpan={showGym ? 5 : 4}>
                  {isLoading ? 'Cargando bitácora...' : 'No hay accesos con estos filtros.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-6 py-3 text-sm text-slate-600">
        <span>{result ? `${result.total.toLocaleString('es-MX')} registros` : ''}</span>
        <div className="flex items-center gap-2">
          <button
            className="rounded-lg border border-slate-200 p-1.5 transition hover:bg-slate-50 disabled:opacity-40"
            type="button"
            aria-label="Página anterior"
            disabled={page <= 1 || isLoading}
            onClick={() => setFilters((current) => ({ ...current, page: page - 1 }))}
          >
            <ChevronLeft size={16} aria-hidden="true" />
          </button>
          <span>Página {page} de {totalPages}</span>
          <button
            className="rounded-lg border border-slate-200 p-1.5 transition hover:bg-slate-50 disabled:opacity-40"
            type="button"
            aria-label="Página siguiente"
            disabled={page >= totalPages || isLoading}
            onClick={() => setFilters((current) => ({ ...current, page: page + 1 }))}
          >
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  )
}

export default AccessLog
