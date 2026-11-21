import { useEffect, useState } from 'react'
import { AlertTriangle, CircleCheck, LogIn, LogOut, Radio, Users, XCircle } from 'lucide-react'
import { getOccupancy, type AccessRecordedEvent, type OccupancyGym } from '../services/api'
import { socket } from '../services/socket'
import { denialTitleForCode, formatGymTime } from '../utils/accessReasons'
import Panel from './ui/Panel'
import Badge, { type BadgeTone } from './ui/Badge'
import EmptyState from './ui/EmptyState'
import { errorAlert } from './ui/styles'

// The socket keeps it current; this refresh is a fallback for missed events.
const REFRESH_MS = 60_000
const FEED_SIZE = 12
// From this share of the capacity the gym shows as almost full.
const WARNING_RATIO = 0.8

function capacityState(gym: OccupancyGym): { ratio: number | null; bar: string; label: string; tone: BadgeTone; icon: typeof XCircle } {
  if (!gym.capacity) return { ratio: null, bar: 'bg-brand-press', label: 'Sin aforo definido', tone: 'neutral', icon: Users }
  const ratio = gym.count / gym.capacity
  if (ratio >= 1) return { ratio, bar: 'bg-red-600', label: 'Aforo lleno', tone: 'danger', icon: XCircle }
  if (ratio >= WARNING_RATIO) return { ratio, bar: 'bg-amber-500', label: 'Cerca del aforo', tone: 'warning', icon: AlertTriangle }
  return { ratio, bar: 'bg-brand-press', label: 'Con espacio', tone: 'success', icon: CircleCheck }
}

function minutesSince(value: string, now: number) {
  const minutes = Math.max(0, Math.round((now - new Date(value).getTime()) / 60_000))
  if (minutes < 60) return `${minutes} min`
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`
}

const FEED_COPY = {
  'check-in': { label: 'Entrada', tone: 'bg-brand-soft text-brand-text', icon: LogIn },
  'check-out': { label: 'Salida', tone: 'bg-slate-100 text-slate-600', icon: LogOut },
  denied: { label: 'Rechazado', tone: 'bg-red-50 text-red-600', icon: XCircle },
} as const

// Who is inside each visible gym against its capacity, updated live as the turnstiles and reception register entries.
function OccupancyMonitor() {
  const [gyms, setGyms] = useState<OccupancyGym[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [feed, setFeed] = useState<AccessRecordedEvent[]>([])
  const [now, setNow] = useState(() => Date.now())
  // Bumped by live events and the fallback timer to reload the counts.
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let isMounted = true
    getOccupancy()
      .then((response) => {
        if (!isMounted) return
        setGyms(response.gyms)
        setNow(Date.now())
        setError(null)
      })
      .catch((requestError: unknown) => {
        if (isMounted) setError(requestError instanceof Error ? requestError.message : 'No se pudo cargar el aforo.')
      })
    return () => { isMounted = false }
  }, [reloadKey])

  useEffect(() => {
    const timer = window.setInterval(() => setReloadKey((key) => key + 1), REFRESH_MS)
    return () => window.clearInterval(timer)
  }, [])

  // The socket also brings events of gyms outside the current view; only the visible ones go to the feed.
  const visibleGymIds = gyms?.map((gym) => gym.id).join(',') ?? ''
  useEffect(() => {
    const visible = new Set(visibleGymIds.split(',').filter(Boolean))
    function handleRecorded(payload: AccessRecordedEvent) {
      if (!visible.has(payload.gymId)) return
      setFeed((current) => [payload, ...current.filter((item) => item.id !== payload.id)].slice(0, FEED_SIZE))
      if (payload.event !== 'denied') setReloadKey((key) => key + 1)
    }
    socket.on('access:recorded', handleRecorded)
    return () => { socket.off('access:recorded', handleRecorded) }
  }, [visibleGymIds])

  if (error && !gyms) {
    return <p className={errorAlert} role="alert">{error}</p>
  }
  if (!gyms) {
    return <div className="skeleton h-64 w-full rounded-card" aria-label="Cargando aforo" aria-busy="true" />
  }

  const gymById = new Map(gyms.map((gym) => [gym.id, gym]))

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="space-y-4">
        {error && <p className={errorAlert} role="alert">{error}</p>}
        {gyms.length === 0 && <EmptyState icon={Users} title="No hay sucursales visibles" />}
        {gyms.map((gym) => {
          const state = capacityState(gym)
          return (
            <article className="rounded-card border border-slate-200/80 bg-white p-5 shadow-card sm:p-6" key={gym.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-ink">{gym.name}</h3>
                  <div className="mt-1.5"><Badge tone={state.tone} icon={state.icon}>{state.label}</Badge></div>
                </div>
                <p className="text-right">
                  <span className="font-display text-4xl font-bold leading-none text-ink tabular">{gym.count.toLocaleString('es-MX')}</span>
                  <span className="text-sm text-slate-500">{gym.capacity ? ` / ${gym.capacity.toLocaleString('es-MX')}` : ' dentro'}</span>
                </p>
              </div>
              {state.ratio !== null && (
                <div
                  className="mt-4 h-2.5 overflow-hidden rounded-full bg-slate-100"
                  role="meter"
                  aria-label={`Ocupación de ${gym.name}`}
                  aria-valuemin={0}
                  aria-valuemax={gym.capacity ?? undefined}
                  aria-valuenow={gym.count}
                >
                  <div className={`h-full rounded-full transition-[width] duration-500 ${state.bar}`} style={{ width: `${Math.min(100, state.ratio * 100)}%` }} />
                </div>
              )}
              {gym.people.length > 0 ? (
                <ul className="mt-4 max-h-64 divide-y divide-slate-100 overflow-y-auto text-sm">
                  {gym.people.map((person) => (
                    <li className="flex items-center justify-between gap-3 py-2.5" key={person.id}>
                      <span className="flex min-w-0 items-center gap-2.5">
                        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-semibold uppercase text-slate-600" aria-hidden="true">{person.name.slice(0, 1)}</span>
                        <span className="truncate text-ink">{person.name}</span>
                      </span>
                      <span className="shrink-0 text-xs text-slate-500 tabular">
                        desde {formatGymTime(person.since, gym.timezone)} · {minutesSince(person.since, now)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-4 text-sm text-slate-500">Nadie dentro en este momento.</p>
              )}
            </article>
          )
        })}
      </div>

      <Panel
        className="h-fit"
        title="En vivo"
        icon={Radio}
        actions={<span className="relative flex h-2.5 w-2.5" aria-hidden="true"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand opacity-60" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-brand-press" /></span>}
      >
        {feed.length ? (
          <ul className="-my-2 divide-y divide-slate-100 text-sm" aria-live="polite">
            {feed.map((item) => {
              const copy = FEED_COPY[item.event]
              const Icon = copy.icon
              const gym = gymById.get(item.gymId)
              return (
                <li className="flex animate-pop-in items-start gap-3 py-2.5" key={item.id}>
                  <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${copy.tone}`}><Icon size={15} aria-hidden /></span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium text-ink">{item.userName}</span>
                      <span className="shrink-0 text-xs text-slate-500 tabular">{formatGymTime(item.occurredAt, gym?.timezone)}</span>
                    </div>
                    <p className="truncate text-xs text-slate-500">
                      {[copy.label, gyms.length > 1 ? gym?.name : null, item.event === 'denied' ? denialTitleForCode(item.reason?.code) : null].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                </li>
              )
            })}
          </ul>
        ) : (
          <EmptyState icon={Users} title="Esperando accesos">Las entradas y salidas aparecerán aquí al registrarse.</EmptyState>
        )}
      </Panel>
    </div>
  )
}

export default OccupancyMonitor
