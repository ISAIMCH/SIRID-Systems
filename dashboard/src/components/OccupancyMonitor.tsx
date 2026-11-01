import { useEffect, useState } from 'react'
import { AlertTriangle, LogIn, LogOut, Radio, Users, XCircle } from 'lucide-react'
import { getOccupancy, type AccessRecordedEvent, type OccupancyGym } from '../services/api'
import { socket } from '../services/socket'
import { denialTitleForCode, formatGymTime } from '../utils/accessReasons'

// The socket keeps it current; this refresh is a fallback for missed events.
const REFRESH_MS = 60_000
const FEED_SIZE = 12
// From this share of the capacity the gym shows as almost full.
const WARNING_RATIO = 0.8

function capacityState(gym: OccupancyGym) {
  if (!gym.capacity) return { ratio: null, tone: 'bg-emerald-500', label: 'Sin aforo definido', icon: null }
  const ratio = gym.count / gym.capacity
  if (ratio >= 1) return { ratio, tone: 'bg-red-600', label: 'Aforo lleno', icon: XCircle }
  if (ratio >= WARNING_RATIO) return { ratio, tone: 'bg-amber-500', label: 'Cerca del aforo', icon: AlertTriangle }
  return { ratio, tone: 'bg-emerald-500', label: 'Con espacio', icon: null }
}

function minutesSince(value: string, now: number) {
  const minutes = Math.max(0, Math.round((now - new Date(value).getTime()) / 60_000))
  if (minutes < 60) return `${minutes} min`
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`
}

const FEED_COPY = {
  'check-in': { label: 'Entrada', tone: 'text-green-700', icon: LogIn },
  'check-out': { label: 'Salida', tone: 'text-slate-500', icon: LogOut },
  denied: { label: 'Rechazado', tone: 'text-red-600', icon: XCircle },
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
    return <p className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{error}</p>
  }
  if (!gyms) {
    return <div className="h-64 animate-pulse rounded-xl bg-slate-200" aria-label="Cargando aforo" aria-busy="true" />
  }

  const gymById = new Map(gyms.map((gym) => [gym.id, gym]))

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="space-y-4">
        {error && <p className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{error}</p>}
        {gyms.length === 0 && <p className="text-sm text-slate-500">No hay sucursales visibles.</p>}
        {gyms.map((gym) => {
          const state = capacityState(gym)
          const StateIcon = state.icon
          return (
            <article className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm" key={gym.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">{gym.name}</h3>
                  <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-500">
                    {StateIcon && <StateIcon size={15} aria-hidden="true" />} {state.label}
                  </p>
                </div>
                <p className="text-right">
                  <span className="text-3xl font-semibold text-slate-900">{gym.count.toLocaleString('es-MX')}</span>
                  <span className="text-sm text-slate-500">{gym.capacity ? ` / ${gym.capacity.toLocaleString('es-MX')}` : ' dentro'}</span>
                </p>
              </div>
              {state.ratio !== null && (
                <div
                  className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100"
                  role="meter"
                  aria-label={`Ocupación de ${gym.name}`}
                  aria-valuemin={0}
                  aria-valuemax={gym.capacity ?? undefined}
                  aria-valuenow={gym.count}
                >
                  <div className={`h-full rounded-full ${state.tone}`} style={{ width: `${Math.min(100, state.ratio * 100)}%` }} />
                </div>
              )}
              {gym.people.length > 0 ? (
                <ul className="mt-4 max-h-64 divide-y divide-slate-100 overflow-y-auto text-sm">
                  {gym.people.map((person) => (
                    <li className="flex items-center justify-between gap-3 py-2" key={person.id}>
                      <span className="min-w-0 truncate text-slate-800">{person.name}</span>
                      <span className="shrink-0 text-xs text-slate-500">
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

      <aside className="h-fit rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
        <p className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <Radio size={16} className="text-emerald-600" aria-hidden="true" /> En vivo
        </p>
        {feed.length ? (
          <ul className="mt-3 divide-y divide-slate-100 text-sm" aria-live="polite">
            {feed.map((item) => {
              const copy = FEED_COPY[item.event]
              const Icon = copy.icon
              const gym = gymById.get(item.gymId)
              return (
                <li className="py-2" key={item.id}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate text-slate-800">{item.userName}</span>
                    <span className={`inline-flex shrink-0 items-center gap-1 text-xs font-medium ${copy.tone}`}>
                      <Icon size={13} aria-hidden="true" /> {copy.label} · {formatGymTime(item.occurredAt, gym?.timezone)}
                    </span>
                  </div>
                  {(item.event === 'denied' || gyms.length > 1) && (
                    <p className="mt-0.5 truncate text-xs text-slate-500">
                      {[gyms.length > 1 ? gym?.name : null, item.event === 'denied' ? denialTitleForCode(item.reason?.code) : null].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="mt-3 flex items-center gap-2 text-sm text-slate-500">
            <Users size={15} aria-hidden="true" /> Las entradas y salidas aparecerán aquí al registrarse.
          </p>
        )}
      </aside>
    </div>
  )
}

export default OccupancyMonitor
