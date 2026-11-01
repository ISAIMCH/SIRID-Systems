import { useEffect, useState } from 'react'
import { Dumbbell, Flame, Timer, Trophy, X } from 'lucide-react'
import {
  getClientAnalytics,
  updateClientObservations,
  type AnalyticsPeriod,
  type ClientAnalytics,
  type ClientAnalyticsPoint,
} from '../services/api'
import type { UserMembership } from '../types'
import { formatMembershipDate, membershipBadge } from '../utils/membership'
import BarChart, { type BarDatum } from './BarChart'

export interface ProgressClient {
  id: string
  name: string
  email?: string
  goal?: string
  experienceLevel?: string
  coachName?: string
  membership?: UserMembership
  observations: string
}

type Metric = keyof Omit<ClientAnalyticsPoint, 'label'>

const METRICS: Record<Metric, { label: string; unit: string }> = {
  durationMinutes: { label: 'Duración', unit: 'min' },
  totalVolumeKg: { label: 'Volumen', unit: 'kg' },
  caloriesBurned: { label: 'Calorías', unit: 'kcal' },
}

const PERIODS: Array<[AnalyticsPeriod, string]> = [['day', 'Día'], ['week', 'Semana'], ['month', 'Mes']]

const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone

function localToday() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

const formatNumber = (value: number) => Math.round(value).toLocaleString('es-MX')

// Day bars are hours ("07:00"); week and month bars are dates.
function chartBars(analytics: ClientAnalytics, metric: Metric): BarDatum[] {
  return analytics.chartData.map((point, index) => {
    if (analytics.period === 'day') {
      return { key: point.label, label: index % 3 === 0 ? String(index) : '', name: point.label, value: point[metric] }
    }
    const day = new Date(`${point.label}T00:00:00Z`)
    const format = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('es-MX', { ...options, timeZone: 'UTC' }).format(day)
    const label = analytics.period === 'week'
      ? format({ weekday: 'short' })
      : index === 0 || (index + 1) % 5 === 0 ? String(day.getUTCDate()) : ''
    return { key: point.label, label, name: format({ weekday: 'long', day: 'numeric', month: 'short' }), value: point[metric] }
  })
}

interface ClientProgressPanelProps {
  client: ProgressClient
  onObservationsSaved: (clientId: string, observations: string) => void
  onClose: () => void
}

// What a Coach needs about one client: membership, notes they can edit and training progress with this organization.
function ClientProgressPanel({ client, onObservationsSaved, onClose }: ClientProgressPanelProps) {
  const [period, setPeriod] = useState<AnalyticsPeriod>('week')
  const [date, setDate] = useState(localToday)
  const [metric, setMetric] = useState<Metric>('durationMinutes')
  // The answer for one period and date; another selection shows the skeleton until its own answer arrives.
  const [result, setResult] = useState<{ key: string; analytics?: ClientAnalytics; error?: string } | null>(null)
  const [observations, setObservations] = useState(client.observations)
  const [savedObservations, setSavedObservations] = useState(client.observations)
  const [isSaving, setIsSaving] = useState(false)
  const [notesMessage, setNotesMessage] = useState<{ tone: 'error' | 'ok'; text: string } | null>(null)

  const requestKey = `${client.id}|${period}|${date}`
  useEffect(() => {
    let isMounted = true
    getClientAnalytics(client.id, { period, date, timezone })
      .then((analytics) => { if (isMounted) setResult({ key: requestKey, analytics }) })
      .catch((requestError: unknown) => {
        if (isMounted) setResult({ key: requestKey, error: requestError instanceof Error ? requestError.message : 'No se pudo cargar el progreso.' })
      })
    return () => { isMounted = false }
  }, [client.id, period, date, requestKey])

  const current = result?.key === requestKey ? result : null
  const analytics = current?.analytics ?? null
  const analyticsError = current?.error ?? null

  async function handleSaveObservations(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSaving(true)
    setNotesMessage(null)
    try {
      const { user } = await updateClientObservations(client.id, observations.trim())
      setObservations(user.observations)
      setSavedObservations(user.observations)
      onObservationsSaved(client.id, user.observations)
      setNotesMessage({ tone: 'ok', text: 'Observaciones guardadas.' })
    } catch (requestError) {
      setNotesMessage({ tone: 'error', text: requestError instanceof Error ? requestError.message : 'No se pudieron guardar las observaciones.' })
    } finally {
      setIsSaving(false)
    }
  }

  const badge = membershipBadge(client.membership)
  const totals = analytics?.totals
  const hasSessions = Boolean(totals?.sessionCount)
  const tiles = totals ? [
    { label: 'Sesiones', value: formatNumber(totals.sessionCount), icon: Dumbbell },
    { label: 'Minutos', value: formatNumber(totals.durationMinutes), icon: Timer },
    { label: 'Volumen', value: `${formatNumber(totals.totalVolumeKg)} kg`, icon: Trophy },
    { label: 'Calorías', value: `${formatNumber(totals.caloriesBurned)} kcal`, icon: Flame },
  ] : []

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/50" role="dialog" aria-modal="true" aria-labelledby="progress-title">
      <div className="flex h-full w-full max-w-3xl flex-col overflow-y-auto bg-[#F8FAFC] shadow-xl">
        <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-6 py-5">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">Seguimiento del cliente</p>
            <h2 className="mt-1 text-2xl font-semibold text-slate-900" id="progress-title">{client.name}</h2>
            {client.email && <p className="mt-1 text-sm text-slate-500">{client.email}</p>}
          </div>
          <button className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900" type="button" aria-label="Cerrar" onClick={onClose}>
            <X size={20} />
          </button>
        </header>

        <div className="space-y-6 px-6 py-6">
          <section className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
            <h3 className="font-semibold text-slate-900">Perfil y membresía</h3>
            <dl className="mt-3 grid gap-4 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-slate-500">Membresía</dt>
                <dd className="mt-1 flex flex-wrap items-center gap-2">
                  <span className="font-medium text-slate-900">{client.membership?.planName || 'Sin plan'}</span>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.tone}`}>{badge.label}</span>
                </dd>
              </div>
              <div><dt className="text-slate-500">Vence</dt><dd className="mt-1 font-medium text-slate-900">{formatMembershipDate(client.membership?.expiresAt)}</dd></div>
              <div><dt className="text-slate-500">Coach</dt><dd className="mt-1 font-medium text-slate-900">{client.coachName || 'Sin coach asignado'}</dd></div>
              <div><dt className="text-slate-500">Objetivo</dt><dd className="mt-1 text-slate-900">{client.goal || '—'}</dd></div>
              <div><dt className="text-slate-500">Nivel</dt><dd className="mt-1 capitalize text-slate-900">{client.experienceLevel || '—'}</dd></div>
            </dl>
          </section>

          <form className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm" onSubmit={handleSaveObservations}>
            <label className="font-semibold text-slate-900" htmlFor="progress-observations">Observaciones médicas o técnicas</label>
            <p className="mt-1 text-xs text-slate-500">Solo las ve el staff de esta organización.</p>
            <textarea
              className="mt-3 min-h-28 w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-100"
              id="progress-observations"
              value={observations}
              maxLength={4000}
              onChange={(event) => {
                setObservations(event.target.value)
                setNotesMessage(null)
              }}
            />
            <div className="mt-3 flex items-center justify-between gap-3">
              <p
                className={`text-sm ${notesMessage?.tone === 'error' ? 'text-red-700' : 'text-emerald-700'}`}
                role={notesMessage?.tone === 'error' ? 'alert' : 'status'}
              >
                {notesMessage?.text}
              </p>
              <button
                className="rounded-lg bg-[#9BFF63] px-4 py-2 text-sm font-medium text-[#0F172A] transition hover:bg-[#abff7c] disabled:cursor-not-allowed disabled:opacity-60"
                type="submit"
                disabled={isSaving || observations.trim() === savedObservations.trim()}
              >
                {isSaving ? 'Guardando...' : 'Guardar observaciones'}
              </button>
            </div>
          </form>

          <section className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="font-semibold text-slate-900">Progreso</h3>
                <p className="mt-1 text-xs text-slate-500">Entrenamientos completados con esta organización.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded-lg border border-slate-200 p-0.5 text-sm" role="group" aria-label="Periodo">
                  {PERIODS.map(([value, label]) => (
                    <button
                      className={`rounded-md px-3 py-1 transition ${period === value ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
                      type="button"
                      aria-pressed={period === value}
                      key={value}
                      onClick={() => setPeriod(value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <input
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100"
                  type="date"
                  aria-label="Fecha del periodo"
                  value={date}
                  max={localToday()}
                  onChange={(event) => { if (event.target.value) setDate(event.target.value) }}
                />
              </div>
            </div>

            {analyticsError ? (
              <p className="mt-4 rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{analyticsError}</p>
            ) : !analytics ? (
              <div className="mt-4 h-64 animate-pulse rounded-lg bg-slate-100" aria-label="Cargando progreso" aria-busy="true" />
            ) : (
              <>
                <dl className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
                  {tiles.map(({ label, value, icon: Icon }) => (
                    <div className="rounded-lg bg-slate-50 px-4 py-3" key={label}>
                      <dt className="flex items-center gap-2 text-sm text-slate-500"><Icon size={16} aria-hidden="true" /> {label}</dt>
                      <dd className="mt-1 text-xl font-semibold text-slate-900">{value}</dd>
                    </div>
                  ))}
                </dl>

                {analytics.bestLift && (
                  <p className="mt-4 text-sm text-slate-600">
                    Mejor levantamiento: <span className="font-semibold text-slate-900">{analytics.bestLift.weightKg} kg</span>
                    {analytics.bestLift.exerciseName && ` en ${analytics.bestLift.exerciseName}`}
                    {' · '}{formatMembershipDate(analytics.bestLift.completedAt)}
                  </p>
                )}

                {hasSessions ? (
                  <div className="mt-6">
                    <div className="mb-3 inline-flex rounded-lg border border-slate-200 p-0.5 text-sm" role="group" aria-label="Métrica de la gráfica">
                      {(Object.keys(METRICS) as Metric[]).map((key) => (
                        <button
                          className={`rounded-md px-3 py-1 transition ${metric === key ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
                          type="button"
                          aria-pressed={metric === key}
                          key={key}
                          onClick={() => setMetric(key)}
                        >
                          {METRICS[key].label}
                        </button>
                      ))}
                    </div>
                    <BarChart
                      data={chartBars(analytics, metric)}
                      caption={`${METRICS[metric].label} por ${period === 'day' ? 'hora' : 'día'}`}
                      valueLabel={`${METRICS[metric].label} (${METRICS[metric].unit})`}
                      formatValue={(value) => `${formatNumber(value)} ${METRICS[metric].unit}`}
                    />
                  </div>
                ) : (
                  <p className="mt-6 rounded-lg bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                    Sin entrenamientos completados en este periodo.
                  </p>
                )}
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}

export default ClientProgressPanel
