import { useCallback, useEffect, useMemo, useState, type ComponentType } from 'react'
import { Link } from 'react-router-dom'
import {
  AlarmClock,
  ArrowRight,
  BadgeCheck,
  BadgePlus,
  ChartPie,
  ClipboardList,
  CreditCard,
  HeartPulse,
  Inbox,
  KeyRound,
  PackageX,
  Receipt,
  ScanLine,
  ShoppingBag,
  TrendingUp,
  UserCheck,
  UserPlus,
  Users,
  Wallet,
} from 'lucide-react'
import { getPayments, getProducts, getSales, getUsers } from '../services/api'
import type { Sale } from '../services/api'
import { socket } from '../services/socket'
import { useAuth } from '../store/useAuth'
import type { Product, User } from '../types'
import { canAccessPage, useStaffRoles } from '../utils/access'
import {
  countStates,
  daysUntil,
  expiringSoon,
  growthSeries,
  hasJoinDates,
  monthToDate,
  percentChange,
  planDistribution,
  recentSignups,
  retentionRate,
  revenueSeries,
  EXPIRING_DAYS,
  type GrowthRange,
  type MoneyEvent,
  type RevenueRange,
} from '../utils/overviewMetrics'
import { formatMembershipDate } from '../utils/membership'
import AttendanceSection, { type AttendanceSummary } from '../components/AttendanceSection'
import AreaChart from '../components/charts/AreaChart'
import BarChart from '../components/charts/BarChart'
import DonutChart from '../components/charts/DonutChart'
import StatusBar from '../components/charts/StatusBar'
import EmptyState from '../components/ui/EmptyState'
import KpiCard from '../components/ui/KpiCard'
import Panel from '../components/ui/Panel'
import Segmented from '../components/ui/Segmented'

const LOW_STOCK_THRESHOLD = 5
const SERIES = ['#0E9F6E', '#2A78D6', '#EB6834', '#8B5CF6']
const OTHER = '#A1A1AA'
// Same events the Usuarios, Pagos and Ventas pages listen to; Inicio reloads its figures on them.
const LIVE_EVENTS = ['directory-updated', 'payment-created', 'payment-updated', 'payment-redeemed', 'payments-updated', 'sale-created', 'sale-updated', 'sale-deleted', 'sales-updated']

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

interface OverviewData {
  clients: User[]
  payments: DashboardPayment[]
  sales: Sale[]
  products: Product[]
  loadedAt: Date
}

interface ActivityItem {
  id: string
  kind: 'payment' | 'sale'
  title: string
  detail: string
  amount: number
  status: string
  date?: string
}

const formatCount = (value: number) => value.toLocaleString('es-MX')
const formatMoney = (value: number) => value.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 })

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

function statusLabel(status: string) {
  switch (status.toLowerCase()) {
    case 'paid': return 'Pagado'
    case 'completed': return 'Completada'
    case 'pending': return 'Pendiente'
    case 'cancelled': return 'Cancelado'
    default: return status
  }
}

const STATUS_TONES: Record<string, string> = {
  Pagado: 'bg-emerald-50 text-emerald-700',
  Completada: 'bg-emerald-50 text-emerald-700',
  Pendiente: 'bg-amber-50 text-amber-800',
  Cancelado: 'bg-slate-100 text-slate-600',
}

function relationName(value: unknown) {
  if (!value || typeof value !== 'object') return ''
  const relation = value as { name?: string; nombre?: string }
  return relation.name || relation.nombre || ''
}

function userName(user: User) {
  return [user.name || user.firstName, user.lastName].filter(Boolean).join(' ') || user.email
}

function paymentDate(payment: DashboardPayment) {
  return payment.paymentDate || payment.createdAt || payment.date
}

function paymentActivity(payments: DashboardPayment[]): ActivityItem[] {
  return payments.map((payment, index) => ({
    id: payment.id || payment._id || payment.orderId || `payment-${index}`,
    kind: 'payment',
    title: 'Pago de membresía',
    detail: relationName(payment.user || payment.userId)
      || payment.method
      || payment.source
      || 'Pago de suscripción',
    amount: numericValue(payment.total ?? payment.amount),
    status: statusLabel(payment.status || 'Sin estado'),
    date: paymentDate(payment),
  }))
}

function saleActivity(sales: Sale[]): ActivityItem[] {
  return sales.map((sale, index) => ({
    id: sale.id || sale._id || `sale-${index}`,
    kind: 'sale',
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

function toTime(value: string | undefined) {
  const time = value ? new Date(value).getTime() : 0
  return Number.isNaN(time) ? 0 : time
}

function expiresInLabel(days: number | null) {
  if (days === null) return ''
  if (days <= 0) return 'Vence hoy'
  if (days === 1) return 'Vence mañana'
  return `Vence en ${days} días`
}

interface QuickAction {
  label: string
  description: string
  to: string
  icon: ComponentType<{ size?: number; 'aria-hidden'?: boolean }>
  visible: boolean
}

function Overview() {
  const { session, organizationGyms, activeGymId, isAllGyms } = useAuth()
  const roles = useStaffRoles()
  const canSeeBilling = canAccessPage(roles, '/payments')
  // The API's attendance analytics are for managers and Coaches.
  const canSeeAttendance = roles.has('Admin') || roles.has('Coach')
  const canEnroll = roles.has('Admin') || roles.has('Recepcion')
  const [data, setData] = useState<OverviewData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [attendance, setAttendance] = useState<AttendanceSummary | null>(null)
  const [revenueRange, setRevenueRange] = useState<RevenueRange>('30d')
  const [growthRange, setGrowthRange] = useState<GrowthRange>('12m')
  const [growthView, setGrowthView] = useState<'total' | 'added'>('total')
  const handleAttendance = useCallback((summary: AttendanceSummary) => setAttendance(summary), [])

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

      setData({
        clients: extractArray<User>(getResult(0, 'usuarios'), ['data', 'users']).filter(isClient),
        payments: extractArray<DashboardPayment>(getResult(1, 'pagos'), ['data', 'payments', 'pagos']),
        sales: extractArray<Sale>(getResult(2, 'ventas'), ['data', 'sales', 'ventas']),
        products: extractArray<Product>(getResult(3, 'productos'), ['data', 'products', 'productos']),
        loadedAt: new Date(),
      })
      setError(failures.length ? `No se pudieron cargar algunos datos: ${failures.join('; ')}` : null)
    }

    loadOverview().catch((requestError: unknown) => {
      if (!isMounted) return
      setError(requestError instanceof Error ? requestError.message : 'No se pudo cargar el resumen.')
      setData({ clients: [], payments: [], sales: [], products: [], loadedAt: new Date() })
    })

    return () => {
      isMounted = false
    }
  }, [canSeeBilling, reloadKey])

  // Payments, sales and sign-ups made anywhere (reception, the app) update the figures without reloading the page.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const refresh = () => {
      clearTimeout(timer)
      timer = setTimeout(() => setReloadKey((key) => key + 1), 600)
    }
    LIVE_EVENTS.forEach((eventName) => socket.on(eventName, refresh))
    return () => {
      clearTimeout(timer)
      LIVE_EVENTS.forEach((eventName) => socket.off(eventName, refresh))
    }
  }, [])

  const metrics = useMemo(() => {
    if (!data) return null
    const now = data.loadedAt
    const revenueEvents: MoneyEvent[] = [
      ...data.payments.filter((payment) => isSuccessfulPayment(payment.status))
        .map((payment) => ({ amount: numericValue(payment.total ?? payment.amount), date: new Date(paymentDate(payment) ?? 0) })),
      ...data.sales.filter((sale) => isSuccessfulPayment(sale.status))
        .map((sale) => ({ amount: numericValue(sale.totalAmount), date: new Date(sale.createdAt || sale.date || 0) })),
    ].filter((event) => !Number.isNaN(event.date.getTime()))
    const states = countStates(data.clients, now)

    return {
      now,
      revenueEvents,
      states,
      month: monthToDate(revenueEvents, now),
      retention: retentionRate(states),
      signups: recentSignups(data.clients, now),
      hasJoinDates: hasJoinDates(data.clients),
      activeAccounts: data.clients.filter((client) => client.isActive !== false && !client.pendingActivation).length,
      pendingActivation: data.clients.filter((client) => client.pendingActivation).length,
      plans: planDistribution(data.clients, now),
      expiring: expiringSoon(data.clients, now),
      pendingPayments: data.payments.filter((payment) => payment.status?.toLowerCase() === 'pending').length,
      // A product counts as low when any visible gym is running out of it.
      lowStock: data.products.filter((product) => (product.stockByGym?.length
        ? product.stockByGym.some((item) => item.quantity <= LOW_STOCK_THRESHOLD)
        : numericValue(product.stock) <= LOW_STOCK_THRESHOLD)).length,
      activity: [...saleActivity(data.sales), ...paymentActivity(data.payments)]
        .sort((first, second) => toTime(second.date) - toTime(first.date))
        .slice(0, 6),
    }
  }, [data])

  const revenue = useMemo(() => (metrics ? revenueSeries(metrics.revenueEvents, revenueRange, metrics.now) : null), [metrics, revenueRange])
  const growth = useMemo(() => (data && metrics ? growthSeries(data.clients, growthRange, metrics.now) : []), [data, metrics, growthRange])

  const firstName = (session?.user.name || session?.user.nombre || '').split(' ')[0]
  const scopeName = isAllGyms
    ? 'Todas las sucursales'
    : organizationGyms.find((gym) => gym.id === activeGymId)?.name ?? session?.organization?.name ?? 'GymGo'
  const [today] = useState(() => new Intl.DateTimeFormat('es-MX', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date()))

  const quickActions: QuickAction[] = [
    { label: 'Registrar cliente', description: 'Alta con código de activación', to: '/users?accion=registrar', icon: UserPlus, visible: canEnroll },
    { label: 'Crear membresía', description: 'Nuevo plan de suscripción', to: '/subscriptions?accion=nuevo', icon: BadgePlus, visible: roles.has('Admin') },
    { label: 'Registrar pago', description: 'Cobro de membresía', to: '/payments?accion=nuevo', icon: Receipt, visible: canSeeBilling },
    { label: 'Asistencias', description: 'Control de acceso en vivo', to: '/access', icon: ScanLine, visible: canAccessPage(roles, '/access') },
    { label: 'Crear rutina', description: 'Rutina asignada a un cliente', to: '/routines?accion=nuevo', icon: ClipboardList, visible: canAccessPage(roles, '/routines') },
  ]
  const visibleActions = quickActions.filter((action) => action.visible)

  const isLoading = !metrics
  const states = metrics?.states
  const clientCount = data?.clients.length ?? 0
  const currentMemberships = states ? states.current + states.expiring : 0

  return (
    <section className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <header className="flex flex-col gap-1">
        <p className="text-sm font-medium capitalize text-slate-500">{today} · <span className="normal-case">{scopeName}</span></p>
        <h1 className="font-display text-4xl font-bold tracking-tight text-ink sm:text-[44px]">
          {firstName ? `Hola, ${firstName}` : 'Inicio'}
        </h1>
        <p className="text-slate-500">Así va tu gimnasio hoy.</p>
      </header>

      {visibleActions.length > 0 && (
        <nav className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5" aria-label="Acciones rápidas">
          {visibleActions.map(({ label, description, to, icon: Icon }, index) => (
            <Link
              className={`group flex min-h-[64px] items-center gap-3 rounded-2xl border px-3 py-3 transition duration-200 hover:-translate-y-0.5 sm:px-4 ${
                index === 0
                  ? 'border-ink bg-ink text-white hover:shadow-lift'
                  : 'border-slate-200/80 bg-white text-ink shadow-card hover:border-slate-300 hover:shadow-lift'
              }`}
              to={to}
              key={to}
            >
              <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl transition-transform duration-200 group-hover:scale-105 ${index === 0 ? 'bg-brand text-brand-ink' : 'bg-slate-100 text-slate-700'}`}>
                <Icon size={19} aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">{label}</span>
                <span className={`hidden truncate text-xs sm:block ${index === 0 ? 'text-slate-400' : 'text-slate-500'}`}>{description}</span>
              </span>
            </Link>
          ))}
        </nav>
      )}

      {error && (
        <div className="mt-6 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          {error}
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Clientes registrados"
          icon={Users}
          isLoading={isLoading}
          value={formatCount(clientCount)}
          hint={metrics?.pendingActivation ? `${formatCount(metrics.pendingActivation)} por activar en la app` : 'Todos con la app activada'}
        />
        <KpiCard
          label="Cuentas activas"
          icon={UserCheck}
          isLoading={isLoading}
          value={formatCount(metrics?.activeAccounts ?? 0)}
          hint={clientCount ? `${Math.round(((metrics?.activeAccounts ?? 0) / clientCount) * 100)}% de los clientes` : 'Sin clientes todavía'}
        />
        <KpiCard
          label="Membresías vigentes"
          icon={BadgeCheck}
          tone="brand"
          isLoading={isLoading}
          value={formatCount(currentMemberships)}
          hint={`de ${formatCount(clientCount)} clientes`}
        />
        <KpiCard
          label={`Por vencer (${EXPIRING_DAYS} días)`}
          icon={AlarmClock}
          tone={states?.expiring ? 'warning' : 'default'}
          isLoading={isLoading}
          value={formatCount(states?.expiring ?? 0)}
          hint={states?.expiring ? 'Contáctalos para renovar' : 'Ninguna vence esta semana'}
        />
        {canSeeAttendance && (
          <KpiCard
            label="Asistencias hoy"
            icon={ScanLine}
            isLoading={!attendance}
            value={formatCount(attendance?.checkIns ?? 0)}
            hint={`${formatCount(attendance?.occupancy ?? 0)} dentro ahora`}
          />
        )}
        <KpiCard
          label="Nuevos registros (30 días)"
          icon={UserPlus}
          isLoading={isLoading}
          value={metrics?.hasJoinDates ? formatCount(metrics.signups.current) : '—'}
          delta={metrics?.hasJoinDates
            ? { percent: percentChange(metrics.signups.current, metrics.signups.previous), label: 'vs. 30 días previos' }
            : undefined}
          hint={metrics?.hasJoinDates ? undefined : 'Requiere actualizar la API'}
        />
        {canSeeBilling && (
          <KpiCard
            label="Ingresos del mes"
            icon={Wallet}
            isLoading={isLoading}
            value={formatMoney(metrics?.month.current ?? 0)}
            delta={metrics ? { percent: percentChange(metrics.month.current, metrics.month.previous), label: 'vs. mismo corte del mes pasado' } : undefined}
          />
        )}
        <KpiCard
          label="Retención"
          icon={HeartPulse}
          isLoading={isLoading}
          value={metrics?.retention === null || metrics?.retention === undefined ? '—' : `${Math.round(metrics.retention)}%`}
          hint={states ? `${formatCount(states.expired + states.suspended)} vencidas o suspendidas` : undefined}
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        {canSeeBilling && (
          <Panel
            className="xl:col-span-2"
            title="Ingresos"
            icon={TrendingUp}
            description={revenue
              ? (
                <>
                  <span className="font-display text-2xl font-bold text-ink tabular">{formatMoney(revenue.current)}</span>
                  {' '}
                  <span className="tabular">
                    {(() => {
                      const change = percentChange(revenue.current, revenue.previous)
                      return change === null ? 'sin ingresos en el periodo anterior' : `${change >= 0 ? '+' : ''}${Math.round(change)}% vs. periodo anterior`
                    })()}
                  </span>
                </>
              )
              : 'Pagos de membresía y ventas de tienda cobrados.'}
            actions={(
              <Segmented
                label="Periodo de ingresos"
                value={revenueRange}
                options={[['7d', '7 días'], ['30d', '30 días'], ['12m', '12 meses']]}
                onChange={setRevenueRange}
              />
            )}
          >
            {!revenue ? (
              <div className="skeleton h-64 rounded-xl" aria-busy="true" aria-label="Cargando ingresos" />
            ) : revenue.current === 0 && revenue.previous === 0 ? (
              <EmptyState icon={Wallet} title="Sin ingresos en este periodo">
                Los pagos confirmados y las ventas entregadas aparecerán aquí.
              </EmptyState>
            ) : (
              <AreaChart
                data={revenue.points}
                caption="Ingresos por periodo comparados con el periodo anterior"
                seriesLabel="Periodo actual"
                compareLabel={revenueRange === '12m' ? 'Año anterior' : 'Periodo anterior'}
                formatValue={formatMoney}
              />
            )}
          </Panel>
        )}

        <Panel
          className={canSeeBilling ? '' : 'xl:col-span-3'}
          title="Estado de clientes"
          icon={Users}
          description="Activos frente a inactivos, según su membresía."
        >
          {!states ? (
            <div className="space-y-3" aria-busy="true" aria-label="Cargando estado de clientes">
              <div className="skeleton h-4 rounded-full" />
              <div className="skeleton h-28 rounded-xl" />
            </div>
          ) : clientCount === 0 ? (
            <EmptyState icon={Users} title="Aún no hay clientes">Registra el primero desde «Registrar cliente».</EmptyState>
          ) : (
            <>
              <StatusBar
                caption="Clientes por estado de membresía"
                data={[
                  { key: 'current', label: 'Vigente', value: states.current, colorClass: 'bg-emerald-600' },
                  { key: 'expiring', label: 'Por vencer', value: states.expiring, colorClass: 'bg-amber-400', description: `Vence en ${EXPIRING_DAYS} días o menos` },
                  { key: 'expired', label: 'Vencida', value: states.expired, colorClass: 'bg-red-500' },
                  { key: 'suspended', label: 'Suspendida', value: states.suspended, colorClass: 'bg-orange-700' },
                  { key: 'pending', label: 'Pendiente', value: states.pending, colorClass: 'bg-sky-500', description: 'Pago pendiente o por iniciar' },
                  { key: 'none', label: 'Sin membresía', value: states.none, colorClass: 'bg-slate-300' },
                ]}
              />
              <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4">
                <div>
                  <p className="text-xs text-slate-500">Activos</p>
                  <p className="font-display text-2xl font-bold text-ink tabular">{formatCount(currentMemberships)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Inactivos</p>
                  <p className="font-display text-2xl font-bold text-ink tabular">{formatCount(clientCount - currentMemberships)}</p>
                </div>
              </div>
            </>
          )}
        </Panel>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        {canSeeAttendance && (
          <div className="xl:col-span-2">
            <AttendanceSection onSummary={handleAttendance} />
          </div>
        )}

        <Panel
          className={canSeeAttendance ? '' : 'xl:col-span-3'}
          title="Próximas a vencer"
          icon={AlarmClock}
          description={`Membresías que terminan en los próximos ${EXPIRING_DAYS} días.`}
          actions={<Link className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-medium text-brand-text transition hover:bg-brand-soft" to="/users">Ver clientes <ArrowRight size={14} aria-hidden /></Link>}
        >
          {!metrics ? (
            <div className="space-y-3" aria-busy="true" aria-label="Cargando vencimientos">
              {Array.from({ length: 4 }, (_, index) => <div className="skeleton h-12 rounded-xl" key={index} />)}
            </div>
          ) : metrics.expiring.length === 0 ? (
            <EmptyState icon={BadgeCheck} title="Nada por vencer">Ninguna membresía vigente termina esta semana.</EmptyState>
          ) : (
            <ul className="-mx-2 max-h-[420px] divide-y divide-slate-100 overflow-y-auto">
              {metrics.expiring.map((client) => {
                const days = daysUntil(client.membership?.expiresAt, metrics.now)
                return (
                  <li className="flex items-center gap-3 rounded-xl px-2 py-3 transition-colors hover:bg-slate-50" key={client.id || client._id || client.email}>
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-100 text-sm font-semibold uppercase text-slate-600" aria-hidden>
                      {userName(client).slice(0, 1)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink">{userName(client)}</p>
                      <p className="truncate text-xs text-slate-500">{client.membership?.planName || 'Membresía'} · {formatMembershipDate(client.membership?.expiresAt)}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${days !== null && days <= 1 ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-800'}`}>
                      {expiresInLabel(days)}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </Panel>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Panel
          className="xl:col-span-2"
          title="Crecimiento de clientes"
          icon={UserPlus}
          description={metrics?.hasJoinDates === false
            ? 'La API conectada aún no envía la fecha de alta de los clientes.'
            : 'Clientes actuales según el mes en que se unieron.'}
          actions={(
            <>
              <Segmented label="Medida de crecimiento" value={growthView} options={[['total', 'Total'], ['added', 'Nuevos']]} onChange={setGrowthView} />
              <Segmented label="Periodo de crecimiento" value={growthRange} options={[['6m', '6 meses'], ['12m', '12 meses']]} onChange={setGrowthRange} />
            </>
          )}
        >
          {!metrics ? (
            <div className="skeleton h-64 rounded-xl" aria-busy="true" aria-label="Cargando crecimiento" />
          ) : !metrics.hasJoinDates ? (
            <EmptyState icon={TrendingUp} title="Datos de alta no disponibles">
              Actualiza la API a la versión que incluye «joinedAt» en GET /users para ver el crecimiento.
            </EmptyState>
          ) : growthView === 'total' ? (
            <AreaChart
              data={growth.map((month) => ({ key: month.key, label: month.label, name: month.name, value: month.total }))}
              caption="Total de clientes al cierre de cada mes"
              seriesLabel="Clientes"
            />
          ) : (
            <BarChart
              data={growth.map((month) => ({ key: month.key, label: month.label, name: month.name, value: month.added }))}
              caption="Nuevos clientes por mes"
              valueLabel="Nuevos clientes por mes"
            />
          )}
        </Panel>

        <Panel title="Distribución de membresías" icon={ChartPie} description="Membresías vigentes por plan.">
          {!metrics ? (
            <div className="skeleton mx-auto h-44 w-44 rounded-full" aria-busy="true" aria-label="Cargando distribución" />
          ) : metrics.plans.length === 0 ? (
            <EmptyState icon={CreditCard} title="Sin membresías vigentes">Cuando un cliente pague su plan aparecerá aquí.</EmptyState>
          ) : (
            <DonutChart
              caption="Membresías vigentes por plan"
              totalLabel="vigentes"
              data={metrics.plans.map((plan, index) => ({
                key: plan.label,
                label: plan.label,
                value: plan.value,
                color: plan.label === 'Otros' ? OTHER : SERIES[index] ?? OTHER,
              }))}
            />
          )}
        </Panel>
      </div>

      {canSeeBilling && (
        <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
          <Panel
            className="xl:col-span-2"
            title="Actividad reciente"
            icon={ShoppingBag}
            description="Últimos pagos y ventas."
            actions={<Link className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-medium text-brand-text transition hover:bg-brand-soft" to="/payments">Ver pagos <ArrowRight size={14} aria-hidden /></Link>}
          >
            {!metrics ? (
              <div className="space-y-3" aria-busy="true" aria-label="Cargando actividad">
                {Array.from({ length: 4 }, (_, index) => <div className="skeleton h-12 rounded-xl" key={index} />)}
              </div>
            ) : metrics.activity.length === 0 ? (
              <EmptyState icon={Inbox} title="Sin actividad reciente">Los pagos y ventas nuevos aparecerán aquí al momento.</EmptyState>
            ) : (
              <ul className="-mx-2 divide-y divide-slate-100">
                {metrics.activity.map((activity) => (
                  <li className="flex items-center gap-3 rounded-xl px-2 py-3 transition-colors hover:bg-slate-50" key={`${activity.kind}-${activity.id}`}>
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600" aria-hidden>
                      {activity.kind === 'payment' ? <CreditCard size={17} /> : <ShoppingBag size={17} />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink">{activity.title}</p>
                      <p className="truncate text-xs text-slate-500">{activity.detail} · {formatActivityDate(activity.date)}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-semibold text-ink tabular">{formatMoney(activity.amount)}</p>
                      <span className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_TONES[activity.status] ?? 'bg-slate-100 text-slate-600'}`}>
                        {activity.status}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Pendientes" icon={Inbox} description="Lo que necesita atención.">
            {!metrics ? (
              <div className="space-y-3" aria-busy="true" aria-label="Cargando pendientes">
                {Array.from({ length: 3 }, (_, index) => <div className="skeleton h-14 rounded-xl" key={index} />)}
              </div>
            ) : (
              <ul className="space-y-2">
                {[
                  { label: 'Pagos por confirmar', value: metrics.pendingPayments, icon: Receipt, to: '/payments' },
                  { label: `Productos con stock bajo (≤ ${LOW_STOCK_THRESHOLD})`, value: metrics.lowStock, icon: PackageX, to: '/inventory' },
                  { label: 'Cuentas por activar', value: metrics.pendingActivation, icon: KeyRound, to: '/users' },
                ].map(({ label, value, icon: Icon, to }) => {
                  const content = (
                    <>
                      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${value ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-500'}`}>
                        <Icon size={17} aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1 text-sm text-slate-600">{label}</span>
                      <span className="font-display text-xl font-bold text-ink tabular">{formatCount(value)}</span>
                    </>
                  )
                  return (
                    <li key={label}>
                      {canAccessPage(roles, to) ? (
                        <Link className="flex items-center gap-3 rounded-xl border border-slate-100 px-3 py-2.5 transition hover:border-slate-200 hover:bg-slate-50" to={to}>
                          {content}
                        </Link>
                      ) : (
                        <div className="flex items-center gap-3 rounded-xl border border-slate-100 px-3 py-2.5">{content}</div>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </Panel>
        </div>
      )}
    </section>
  )
}

export default Overview
