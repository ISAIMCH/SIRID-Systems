import { useEffect, useState } from 'react'
import { CreditCard, PackageX, ShoppingBag, TrendingUp, Users } from 'lucide-react'
import { getPayments, getProducts, getSales, getUsers } from '../services/api'
import type { Sale } from '../services/api'
import type { Product, User } from '../types'
import { canAccessPage, useStaffRoles } from '../utils/access'

const LOW_STOCK_THRESHOLD = 5

interface DashboardPayment {
  id?: string
  _id?: string
  orderId?: string
  user?: string | { name?: string; nombre?: string }
  userId?: string | { name?: string; nombre?: string }
  amount?: number | string
  total?: number | string
  status?: string
  method?: string
  source?: string
  paymentDate?: string
  createdAt?: string
  date?: string
}

interface OverviewStats {
  clients: number
  activeMemberships: number
  monthRevenue: number
  lowStock: number
}

interface ActivityItem {
  id: string
  title: string
  detail: string
  amount: number
  status: string
  date?: string
}

const formatCount = (value: number) => value.toLocaleString('es-MX')

const statCards = [
  { key: 'clients', label: 'Clientes', icon: Users, iconClass: 'text-slate-600', format: formatCount },
  { key: 'activeMemberships', label: 'Membresías vigentes', icon: CreditCard, iconClass: 'text-green-600', format: formatCount },
  { key: 'monthRevenue', label: 'Ingresos del mes', icon: TrendingUp, iconClass: 'text-emerald-600', format: (value: number) => value.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' }) },
  { key: 'lowStock', label: 'Productos con stock bajo', icon: PackageX, iconClass: 'text-amber-600', format: formatCount },
] as const

// Revenue and stock come from payments, sales and the store, which Coaches do not manage.
const BILLING_STATS: readonly string[] = ['monthRevenue', 'lowStock']

function extractArray<T>(value: unknown, keys: string[]): T[] {
  if (Array.isArray(value)) return value as T[]
  if (!value || typeof value !== 'object') return []

  const record = value as Record<string, unknown>
  const candidate = keys.map((key) => record[key]).find(Array.isArray)
    ?? Object.values(record).find(Array.isArray)

  return Array.isArray(candidate) ? candidate as T[] : []
}

function numericValue(value: number | string | undefined) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function isSuccessfulPayment(status: string | undefined) {
  return ['paid', 'pagado', 'completado', 'completada', 'completed'].includes(status?.toLowerCase() || '')
}

function isClient(user: User) {
  return user.roles ? user.roles.includes('Cliente') : user.role === 'Cliente'
}

// Same rule as the API's hasActiveMembership: active, already started and not expired.
function hasCurrentMembership(user: User, now: Date) {
  const membership = user.membership
  return membership?.status === 'active'
    && (!membership.startsAt || new Date(membership.startsAt) <= now)
    && (!membership.expiresAt || new Date(membership.expiresAt) >= now)
}

function isThisMonth(value: string | undefined, now: Date) {
  if (!value) return false
  const date = new Date(value)
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth()
}

function statusLabel(status: string) {
  switch (status.toLowerCase()) {
    case 'paid': return 'Pagado'
    case 'pending': return 'Pendiente'
    case 'cancelled': return 'Cancelado'
    default: return status
  }
}

function relationName(value: unknown) {
  if (!value || typeof value !== 'object') return ''
  const relation = value as { name?: string; nombre?: string }
  return relation.name || relation.nombre || ''
}

function paymentActivity(payments: DashboardPayment[]): ActivityItem[] {
  return payments.map((payment, index) => ({
    id: payment.id || payment._id || payment.orderId || `payment-${index}`,
    title: 'Pago de membresía',
    detail: relationName(payment.user || payment.userId)
      || payment.method
      || payment.source
      || 'Pago de suscripción',
    amount: numericValue(payment.total ?? payment.amount),
    status: statusLabel(payment.status || 'Sin estado'),
    date: payment.paymentDate || payment.createdAt || payment.date,
  }))
}

function saleActivity(sales: Sale[]): ActivityItem[] {
  return sales.map((sale, index) => ({
    id: sale.id || sale._id || `sale-${index}`,
    title: 'Venta de tienda',
    detail: relationName(sale.userId) || 'Orden de tienda',
    amount: numericValue(sale.totalAmount),
    status: statusLabel(sale.status || 'Sin estado'),
    date: sale.createdAt || sale.date,
  }))
}

function formatActivityDate(value: string | undefined) {
  if (!value) return 'Fecha no disponible'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? 'Fecha no disponible'
    : date.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })
}

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
  const roles = useStaffRoles()
  const canSeeBilling = canAccessPage(roles, '/payments')
  const [stats, setStats] = useState<OverviewStats | null>(null)
  const [recentActivity, setRecentActivity] = useState<ActivityItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true

    async function loadOverview() {
      const results = await Promise.allSettled([
        getUsers<unknown>(),
        canSeeBilling ? getPayments<unknown>() : undefined,
        canSeeBilling ? getSales<unknown>() : undefined,
        canSeeBilling ? getProducts<unknown>() : undefined,
      ])

      if (!isMounted) return

      const failures: string[] = []
      const getResult = (index: number, label: string) => {
        const result = results[index]
        if (result.status === 'fulfilled') return result.value
        failures.push(`${label}: ${result.reason instanceof Error ? result.reason.message : 'error desconocido'}`)
        return undefined
      }

      const users = extractArray<User>(getResult(0, 'usuarios'), ['data', 'users'])
      const payments = extractArray<DashboardPayment>(getResult(1, 'pagos'), ['data', 'payments', 'pagos'])
      const sales = extractArray<Sale>(getResult(2, 'ventas'), ['data', 'sales', 'ventas'])
      const products = extractArray<Product>(getResult(3, 'productos'), ['data', 'products', 'productos'])
      const now = new Date()
      const clients = users.filter(isClient)
      const monthPayments = payments.filter((payment) => isSuccessfulPayment(payment.status)
        && isThisMonth(payment.paymentDate || payment.createdAt || payment.date, now))
      const monthSales = sales.filter((sale) => isSuccessfulPayment(sale.status) && isThisMonth(sale.createdAt || sale.date, now))
      // A product counts as low when any visible gym is running out of it.
      const lowStockCount = products.filter((product) => (product.stockByGym?.length
        ? product.stockByGym.some((item) => item.quantity <= LOW_STOCK_THRESHOLD)
        : numericValue(product.stock) <= LOW_STOCK_THRESHOLD)).length

      setStats({
        clients: clients.length,
        activeMemberships: clients.filter((user) => hasCurrentMembership(user, now)).length,
        monthRevenue: monthPayments.reduce((total, payment) => total + numericValue(payment.total ?? payment.amount), 0)
          + monthSales.reduce((total, sale) => total + numericValue(sale.totalAmount), 0),
        lowStock: lowStockCount,
      })

      const activity = [...saleActivity(sales), ...paymentActivity(payments)]
        .sort((first, second) => {
          const firstTime = first.date ? new Date(first.date).getTime() : 0
          const secondTime = second.date ? new Date(second.date).getTime() : 0
          return (Number.isNaN(secondTime) ? 0 : secondTime) - (Number.isNaN(firstTime) ? 0 : firstTime)
        })
        .slice(0, 5)
      setRecentActivity(activity)
      setError(failures.length ? `No se pudieron cargar algunos datos: ${failures.join('; ')}` : null)
      setIsLoading(false)
    }

    loadOverview().catch((requestError: unknown) => {
      if (!isMounted) return
      setError(requestError instanceof Error ? requestError.message : 'No se pudo cargar el resumen.')
      setStats({ clients: 0, activeMemberships: 0, monthRevenue: 0, lowStock: 0 })
      setIsLoading(false)
    })

    return () => {
      isMounted = false
    }
  }, [canSeeBilling])

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
            <div className={`grid grid-cols-1 gap-6 sm:grid-cols-2 ${canSeeBilling ? 'lg:grid-cols-4' : ''}`}>
              {statCards.filter(({ key }) => canSeeBilling || !BILLING_STATS.includes(key)).map(({ key, label, icon: Icon, iconClass, format }) => (
                <article className="rounded-xl border border-slate-100 bg-white p-6 shadow-sm" key={key}>
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-slate-500">{label}</p>
                    <Icon className={iconClass} size={21} strokeWidth={1.8} />
                  </div>
                  <p className="mt-6 text-3xl font-semibold tracking-tight text-slate-900">
                    {format(stats?.[key] ?? 0)}
                  </p>
                </article>
              ))}
            </div>

            {canSeeBilling ? (
            <article className="mt-6 rounded-xl border border-slate-100 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-2">
                <ShoppingBag className="text-slate-600" size={20} strokeWidth={1.8} />
                <h2 className="text-lg font-semibold text-slate-900">Actividad Reciente</h2>
              </div>
              {recentActivity.length ? (
                <ul className="mt-4 divide-y divide-slate-100">
                  {recentActivity.map((activity) => (
                    <li className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between" key={activity.id}>
                      <div>
                        <p className="font-medium text-slate-900">{activity.title}</p>
                        <p className="mt-1 text-sm text-slate-500">
                          {activity.detail} · {activity.status} · {formatActivityDate(activity.date)}
                        </p>
                      </div>
                      <p className="font-semibold text-slate-900">
                        {activity.amount.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-slate-500">No hay actividad reciente para mostrar.</p>
              )}
            </article>
            ) : (
              <p className="mt-6 rounded-xl border border-slate-100 bg-white p-6 text-sm text-slate-500 shadow-sm">
                Sin acceso a métricas de pagos y ventas.
              </p>
            )}
          </>
        )}
      </div>
    </section>
  )
}

export default Overview
