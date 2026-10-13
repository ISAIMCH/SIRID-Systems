import { useEffect, useState } from 'react'
import { Activity, CreditCard, TrendingUp, Users } from 'lucide-react'
import { getDashboardStats, type DashboardStats } from '../services/api'

const statCards = [
  { key: 'totalUsers', label: 'Usuarios Totales', icon: Users, iconClass: 'text-slate-600', format: (value: number) => value.toLocaleString('es-MX') },
  { key: 'activePlans', label: 'Suscripciones Activas', icon: CreditCard, iconClass: 'text-green-600', format: (value: number) => value.toLocaleString('es-MX') },
  { key: 'revenue', label: 'Ingresos', icon: TrendingUp, iconClass: 'text-emerald-600', format: (value: number) => value.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' }) },
  { key: 'systemStatus', label: 'Estado del Sistema', icon: Activity, iconClass: 'text-green-600', format: (value: number | string) => String(value) },
] as const

function StatsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4" aria-label="Cargando estadísticas" aria-busy="true">
      {Array.from({ length: 4 }).map((_, index) => (
        <div className="rounded-xl border border-slate-100 bg-white p-6 shadow-sm" key={index}>
          <div className="h-5 w-1/2 animate-pulse rounded bg-slate-200" />
          <div className="mt-6 h-9 w-2/3 animate-pulse rounded bg-slate-200" />
        </div>
      ))}
    </div>
  )
}

function Overview() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true

    async function loadStats() {
      try {
        const data = await getDashboardStats()
        if (isMounted) {
          setStats(data)
          setError(null)
        }
      } catch (requestError) {
        if (isMounted) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : 'No se pudieron cargar las estadísticas.',
          )
        }
      } finally {
        if (isMounted) setIsLoading(false)
      }
    }

    loadStats()
    return () => {
      isMounted = false
    }
  }, [])

  return (
    <section className="min-h-screen bg-[#F8FAFC] px-8 py-10">
      <p className="text-sm font-medium uppercase tracking-[0.25em] text-slate-500">Resumen</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-900">Inicio</h1>
      <p className="mt-3 text-slate-500">Una vista rápida del rendimiento de GymGo.</p>

      <div className="mt-8">
        {error && (
          <div className="mb-6 border border-red-100 bg-red-50 px-6 py-4 text-sm text-red-700" role="alert">
            {error}
          </div>
        )}

        {isLoading ? (
          <StatsSkeleton />
        ) : (
          <>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {statCards.map(({ key, label, icon: Icon, iconClass, format }) => (
                <article className="rounded-xl border border-slate-100 bg-white p-6 shadow-sm" key={key}>
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-slate-500">{label}</p>
                    <Icon className={iconClass} size={21} strokeWidth={1.8} />
                  </div>
                  <p className="mt-6 text-3xl font-semibold tracking-tight text-slate-900">
                    {format(stats?.[key] ?? (key === 'systemStatus' ? 'En línea' : 0))}
                  </p>
                </article>
              ))}
            </div>

            <article className="mt-6 rounded-xl border border-slate-100 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">Actividad Reciente</h2>
              <p className="mt-3 text-sm text-slate-500">La actividad reciente aparecerá aquí.</p>
            </article>
          </>
        )}
      </div>
    </section>
  )
}

export default Overview