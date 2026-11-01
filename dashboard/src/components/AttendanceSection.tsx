import { useEffect, useState } from 'react'
import { Activity, Clock, DoorOpen, LogIn } from 'lucide-react'
import { getOperationsDashboard, type OperationsDashboard } from '../services/api'
import BarChart, { type BarDatum } from './BarChart'

type Period = OperationsDashboard['period']

const hourName = (hour: number) => `${String(hour).padStart(2, '0')}:00`

function hourlyBars(dashboard: OperationsDashboard): BarDatum[] {
  return dashboard.hourlyDemand.map(({ hour, checkIns }) => ({
      key: String(hour),
      label: hour % 3 === 0 ? String(hour) : '',
      name: hourName(hour),
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

// Check-ins at the turnstiles of the visible gyms (every gym of the organization in the all-gyms view),
// counted in each gym's own time zone.
function AttendanceSection() {
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
      })
      .catch((requestError: unknown) => {
        if (isMounted) setError(requestError instanceof Error ? requestError.message : 'No se pudo cargar la asistencia.')
      })
    return () => { isMounted = false }
  }, [period])

  const tiles = dashboard ? [
    { label: 'Entradas hoy', value: dashboard.today.checkIns.toLocaleString('es-MX'), icon: LogIn },
    { label: 'Salidas hoy', value: dashboard.today.checkOuts.toLocaleString('es-MX'), icon: DoorOpen },
    { label: 'Dentro ahora', value: dashboard.currentOccupancy.toLocaleString('es-MX'), icon: Activity },
    {
      label: period === 'day' ? 'Hora pico de hoy' : 'Hora pico (7 días)',
      value: dashboard.peakHour ? hourName(dashboard.peakHour.hour) : '—',
      icon: Clock,
    },
  ] : []

  return (
    <article className="mt-6 rounded-xl border border-slate-100 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Asistencia</h2>
          {dashboard && (
            <p className="mt-1 text-xs text-slate-500">
              {dashboard.timezone ? `Hora local de la sucursal (${dashboard.timezone}).` : 'Cada sucursal cuenta en su propia hora local.'}
            </p>
          )}
        </div>
        <div className="inline-flex rounded-lg border border-slate-200 p-0.5 text-sm" role="group" aria-label="Periodo de asistencia">
          {([['day', 'Hoy'], ['week', 'Últimos 7 días']] as const).map(([value, label]) => (
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
      </div>

      {error ? (
        <p className="mt-4 rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{error}</p>
      ) : !dashboard ? (
        <div className="mt-4 h-56 animate-pulse rounded-lg bg-slate-100" aria-label="Cargando asistencia" aria-busy="true" />
      ) : (
        <>
          <dl className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {tiles.map(({ label, value, icon: Icon }) => (
              <div className="rounded-lg bg-slate-50 px-4 py-3" key={label}>
                <dt className="flex items-center gap-2 text-sm text-slate-500"><Icon size={16} aria-hidden="true" /> {label}</dt>
                <dd className="mt-1 text-2xl font-semibold text-slate-900">{value}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-6">
            {period === 'day' ? (
              <BarChart data={hourlyBars(dashboard)} caption="Entradas por hora de hoy" valueLabel="Entradas por hora" />
            ) : (
              <BarChart data={dailyBars(dashboard)} caption="Entradas por día de los últimos 7 días" valueLabel="Entradas por día" />
            )}
          </div>
        </>
      )}
    </article>
  )
}

export default AttendanceSection
