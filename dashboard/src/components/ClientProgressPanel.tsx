import { useEffect, useState } from 'react'
import { ChartColumn, Dumbbell, Flame, NotebookPen, Timer, Trophy, UserRound } from 'lucide-react'
import {
  getClientAnalytics,
  updateClientObservations,
  type AnalyticsPeriod,
  type ClientAnalytics,
  type ClientAnalyticsPoint,
} from '../services/api'
import type { UserMembership } from '../types'
import { formatMembershipDate, membershipBadge } from '../utils/membership'
import BarChart, { type BarDatum } from './charts/BarChart'
import Drawer from './ui/Drawer'
import Panel from './ui/Panel'
import Badge from './ui/Badge'
import KpiCard from './ui/KpiCard'
import Segmented from './ui/Segmented'
import EmptyState from './ui/EmptyState'
import { errorAlert, fieldClass, primaryButton } from './ui/styles'

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

const METRIC_OPTIONS = (Object.keys(METRICS) as Metric[]).map((key) => [key, METRICS[key].label] as const)

const PERIODS = [['day', 'Día'], ['week', 'Semana'], ['month', 'Mes']] as const satisfies ReadonlyArray<readonly [AnalyticsPeriod, string]>

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
    <Drawer eyebrow="Seguimiento del cliente" title={client.name} description={client.email} onClose={onClose}>
      <Panel title="Perfil y membresía" icon={UserRound}>
        <dl className="grid gap-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-slate-500">Membresía</dt>
            <dd className="mt-1 flex flex-wrap items-center gap-2">
              <span className="font-medium text-ink">{client.membership?.planName || 'Sin plan'}</span>
              <Badge tone={badge.tone}>{badge.label}</Badge>
            </dd>
          </div>
          <div><dt className="text-slate-500">Vence</dt><dd className="mt-1 font-medium text-ink tabular">{formatMembershipDate(client.membership?.expiresAt)}</dd></div>
          <div><dt className="text-slate-500">Coach</dt><dd className="mt-1 font-medium text-ink">{client.coachName || 'Sin coach asignado'}</dd></div>
          <div><dt className="text-slate-500">Objetivo</dt><dd className="mt-1 text-ink">{client.goal || '—'}</dd></div>
          <div><dt className="text-slate-500">Nivel</dt><dd className="mt-1 capitalize text-ink">{client.experienceLevel || '—'}</dd></div>
        </dl>
      </Panel>

      <Panel title="Observaciones médicas o técnicas" icon={NotebookPen} description="Solo las ve el staff de esta organización.">
        <form onSubmit={handleSaveObservations}>
          <label className="sr-only" htmlFor="progress-observations">Observaciones médicas o técnicas</label>
          <textarea
            className={`${fieldClass} min-h-28 resize-y`}
            id="progress-observations"
            value={observations}
            maxLength={4000}
            placeholder="Lesiones, restricciones, indicaciones del coach..."
            onChange={(event) => {
              setObservations(event.target.value)
              setNotesMessage(null)
            }}
          />
          <div className="mt-3 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p
              className={`text-sm ${notesMessage?.tone === 'error' ? 'text-red-700' : 'text-emerald-700'}`}
              role={notesMessage?.tone === 'error' ? 'alert' : 'status'}
            >
              {notesMessage?.text}
            </p>
            <button className={primaryButton} type="submit" disabled={isSaving || observations.trim() === savedObservations.trim()}>
              {isSaving ? 'Guardando...' : 'Guardar observaciones'}
            </button>
          </div>
        </form>
      </Panel>

      <Panel
        title="Progreso"
        icon={ChartColumn}
        description="Entrenamientos completados con esta organización."
        actions={(
          <>
            <Segmented label="Periodo" value={period} options={PERIODS} onChange={setPeriod} />
            <input
              className={`${fieldClass.replace('w-full ', '')} w-40 py-1.5`}
              type="date"
              aria-label="Fecha del periodo"
              value={date}
              max={localToday()}
              onChange={(event) => { if (event.target.value) setDate(event.target.value) }}
            />
          </>
        )}
      >
        {analyticsError ? (
          <p className={errorAlert} role="alert">{analyticsError}</p>
        ) : !analytics ? (
          <div className="space-y-4" aria-label="Cargando progreso" aria-busy="true">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, index) => <div className="skeleton h-24 w-full rounded-card" key={index} />)}
            </div>
            <div className="skeleton h-56 w-full rounded-card" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {tiles.map(({ label, value, icon }) => <KpiCard label={label} value={value} icon={icon} key={label} />)}
            </div>

            {analytics.bestLift && (
              <p className="mt-4 flex flex-wrap items-center gap-x-1.5 text-sm text-slate-600">
                <Trophy size={15} className="text-brand-text" aria-hidden />
                Mejor levantamiento: <span className="font-semibold text-ink tabular">{analytics.bestLift.weightKg} kg</span>
                {analytics.bestLift.exerciseName && ` en ${analytics.bestLift.exerciseName}`}
                {' · '}{formatMembershipDate(analytics.bestLift.completedAt)}
              </p>
            )}

            {hasSessions ? (
              <div className="mt-6">
                <div className="mb-3 -mx-1 overflow-x-auto px-1">
                  <Segmented label="Métrica de la gráfica" value={metric} options={METRIC_OPTIONS} onChange={setMetric} />
                </div>
                <BarChart
                  data={chartBars(analytics, metric)}
                  caption={`${METRICS[metric].label} por ${period === 'day' ? 'hora' : 'día'}`}
                  valueLabel={`${METRICS[metric].label} (${METRICS[metric].unit})`}
                  formatValue={(value) => `${formatNumber(value)} ${METRICS[metric].unit}`}
                />
              </div>
            ) : (
              <div className="mt-6">
                <EmptyState icon={Dumbbell} title="Sin entrenamientos en este periodo">Cambia el periodo o la fecha para ver otros días.</EmptyState>
              </div>
            )}
          </>
        )}
      </Panel>
    </Drawer>
  )
}

export default ClientProgressPanel
