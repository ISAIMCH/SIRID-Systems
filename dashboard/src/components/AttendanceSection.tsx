import { useEffect, useState } from 'react'
import { Activity, CalendarDays, Clock, DoorOpen, LogIn } from 'lucide-react'
import { getOperationsDashboard, type OperationsDashboard } from '../services/api'
import BarChart, { type BarDatum } from './charts/BarChart'
import Panel from './ui/Panel'
import Segmented from './ui/Segmented'

type Period = OperationsDashboard['period']

export interface AttendanceSummary {
  checkIns: number
  occupancy: number
}

const hourName = (hour: number) => `${String(hour).padStart(2, '0')}:00`

function hourlyBars(dashboard: OperationsDashboard): BarDatum[] {
  return dashboard.hourlyDemand.map(({ hour, checkIns }) => ({
    key: String(hour),
    label: hour % 3 === 0 ? String(hour) : '',
    name: `${hourName(hour)} – ${hourName((hour + 1) % 24)}`,
    value: checkIns,
  }))
}

// The last seven days of the gym, with the days nobody came in at zero.
function dailyBars(dashboard: OperationsDashboard): BarDatum[] {
  const byDate = new Map(dashboard.dailyAttendance.map((item) => [item.date, item.checkIns]))
  // Today in the gym's zone (the browser's when the visible gyms use several).
  const today = new Date(`${new Intl.DateTimeFormat('en-CA', { timeZone: dashboard.timezone ?? undefined }).format(new Date())}T00:00:00Z`)
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - 6 + index))
    const date = day.toISOString().slice(0, 10)
    const format = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('es-MX', { ...options, timeZone: 'UTC' }).format(day)
    return { key: date, label: format({ weekday: 'short' }), name: format({ weekday: 'long', day: 'numeric', month: 'short' }), value: byDate.get(date) ?? 0 }
  })
}

interface AttendanceSectionProps {
  // Today's figures for the KPI row, so Inicio does not ask the API twice.
  onSummary?: (summary: AttendanceSummary) => void
}

// Check-ins at the turnstiles of the visible gyms (every gym of the organization in the all-gyms view),
// counted in each gym's own time zone.
function AttendanceSection({ onSummary }: AttendanceSectionProps) {
  const [period, setPeriod] = useState<Period>('day')
  const [dashboard, setDashboard] = useState<OperationsDashboard | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true
    getOperationsDashboard(period)
      .then((response) => {
        if (!isMounted) return
        setDashboard(response)
        setError(null)
        onSummary?.({ checkIns: response.today.checkIns, occupancy: response.currentOccupancy })
      })
      .catch((requestError: unknown) => {
        if (isMounted) setError(requestError instanceof Error ? requestError.message : 'No se pudo cargar la asistencia.')
      })
    return () => { isMounted = false }
  }, [period, onSummary])

  const weekTotal = dashboard?.dailyAttendance.reduce((total, day) => total + day.checkIns, 0) ?? 0
  const tiles = dashboard ? [
    { label: 'Entradas hoy', value: dashboard.today.checkIns.toLocaleString('es-MX'), icon: LogIn, live: false },
    { label: 'Salidas hoy', value: dashboard.today.checkOuts.toLocaleString('es-MX'), icon: DoorOpen, live: false },
    { label: 'Dentro ahora', value: dashboard.currentOccupancy.toLocaleString('es-MX'), icon: Activity, live: true },
    period === 'day'
      ? { label: 'Hora pico de hoy', value: dashboard.peakHour ? hourName(dashboard.peakHour.hour) : '—', icon: Clock, live: false }
      : { label: 'Promedio diario', value: Math.round(weekTotal / 7).toLocaleString('es-MX'), icon: CalendarDays, live: false },
  ] : []

  return (
    <Panel
      title="Asistencia"
      icon={Activity}
      description={dashboard
        ? (dashboard.timezone ? `Hora local de la sucursal (${dashboard.timezone}).` : 'Cada sucursal cuenta en su propia hora local.')
        : 'Entradas registradas en el control de acceso.'}
      actions={(
        <Segmented
          label="Periodo de asistencia"
          value={period}
          options={[['day', 'Hoy por hora'], ['week', 'Últimos 7 días']]}
          onChange={setPeriod}
        />
      )}
    >
      {error ? (
        <p className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{error}</p>
      ) : !dashboard ? (
        <div aria-label="Cargando asistencia" aria-busy="true">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => <div className="skeleton h-[68px] rounded-xl" key={index} />)}
          </div>
          <div className="skeleton mt-6 h-56 rounded-xl" />
        </div>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {tiles.map(({ label, value, icon: Icon, live }) => (
              <div className="rounded-xl bg-slate-50 px-4 py-3" key={label}>
                <dt className="flex items-center gap-2 text-xs font-medium text-slate-500">
                  <Icon size={14} aria-hidden="true" /> {label}
                  {live && (
                    <span className="relative ml-auto flex h-2 w-2" aria-hidden="true">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                    </span>
                  )}
                </dt>
                <dd className="mt-1 font-display text-2xl font-bold text-ink tabular">{value}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-6">
            {period === 'day' ? (
              <BarChart
                data={hourlyBars(dashboard)}
                caption="Entradas por hora de hoy"
                valueLabel="Entradas por hora"
                highlightKey={dashboard.peakHour ? String(dashboard.peakHour.hour) : undefined}
              />
            ) : (
              <BarChart data={dailyBars(dashboard)} caption="Entradas por día de los últimos 7 días" valueLabel="Entradas por día" />
            )}
          </div>
        </>
      )}
    </Panel>
  )
}

export default AttendanceSection
