import {
  Building2,
  CreditCard,
  ClipboardList,
  Dumbbell,
  FileText,
  Hammer,
  Package,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Menu,
  Receipt,
  ScanLine,
  ShoppingCart,
  Users,
  Wrench,
  BookOpen,
  Gem,
  X,
} from 'lucide-react'
import { useEffect, useState, type ComponentType } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../store/useAuth'
import { ALL_GYMS } from '../services/activeGym'
import { SUBSCRIPTION_REQUIRED_EVENT } from '../services/api'
import { connectSocket, disconnectSocket, socket } from '../services/socket'
import { canAccessPage, useStaffRoles } from '../utils/access'
import StaffInvitationsNotice from '../components/StaffInvitationsNotice'
import PlanUpgradeModal from '../components/PlanUpgradeModal'
import { formatLongDate } from '../utils/planFeatures'

interface NavItem {
  label: string
  to: string
  icon: ComponentType<{ size?: number; strokeWidth?: number; 'aria-hidden'?: boolean }>
  end?: boolean
  section?: string
  disabled?: boolean
  // Only for SIRID staff (User.isPlatformAdmin).
  platformOnly?: boolean
  // Only for the organization's owner (the session carries their GymGo plan).
  ownerOnly?: boolean
}

const navigation: NavItem[] = [
  { label: 'Inicio', to: '/', icon: LayoutDashboard, end: true },
  { label: 'Gimnasios', to: '/gyms', icon: Dumbbell, section: 'Operación' },
  { label: 'Control de acceso', to: '/access', icon: ScanLine, section: 'Operación' },
  { label: 'Equipo', to: '/equipment', icon: Wrench, section: 'Operación' },
  { label: 'Mantenimiento', to: '/maintenance', icon: Hammer, section: 'Operación' },
  { label: 'Inventario', to: '/inventory', icon: Package, section: 'Operación' },
  { label: 'Usuarios', to: '/users', icon: Users, section: 'Operación' },
  { label: 'Documentos', to: '/documents', icon: FileText, section: 'Operación' },
  { label: 'Ejercicios', to: '/exercises', icon: Dumbbell, section: 'Entrenamiento' },
  { label: 'Rutinas', to: '/routines', icon: ClipboardList, section: 'Entrenamiento' },
  { label: 'Promociones', to: '/promotions', icon: Megaphone, section: 'Comercial' },
  { label: 'Pagos', to: '/payments', icon: Receipt, section: 'Comercial' },
  { label: 'Ventas', to: '/sales', icon: ShoppingCart, section: 'Comercial' },
  { label: 'Suscripciones', to: '/subscriptions', icon: CreditCard, section: 'Comercial' },
  { label: 'Mi plan GymGo', to: '/billing', icon: Gem, section: 'Cuenta', ownerOnly: true },
  { label: 'Organizaciones', to: '/platform', icon: Building2, end: true, section: 'SIRID', platformOnly: true },
  { label: 'Catálogo global', to: '/platform/exercises', icon: BookOpen, section: 'SIRID', platformOnly: true },
]

const APPLICATION_STATUS = { pending: 'está en revisión', rejected: 'fue rechazada', suspended: 'está suspendida', active: 'está activa' } as const

function Wordmark() {
  return (
    <span className="flex items-center gap-2.5">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand font-display text-lg font-bold text-brand-ink" aria-hidden="true">G</span>
      <span className="font-display text-xl font-bold tracking-tight text-white">Gym<span className="text-brand">Go</span></span>
    </span>
  )
}

function AdminLayout() {
  const { signOut, session, activeGymId, setActiveGymId, canSeeAllGyms, isPlatformMode, refreshSession } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const gyms = session?.gyms ?? []
  const organizations = [...new Map(gyms.map((gym) => [gym.organization.id, gym.organization])).values()]

  const roles = useStaffRoles()
  const isPlatformAdmin = Boolean(session?.user.isPlatformAdmin)
  const subscription = session?.subscription ?? null
  const billingOnly = Boolean(subscription?.billingOnly)
  // In the SIRID panel the gym modules are hidden until a gym is picked in the selector; with a lapsed plan
  // the owner only sees billing.
  const visibleNavigation = navigation.filter((item) => {
    if (item.platformOnly) return isPlatformAdmin
    if (item.ownerOnly) return Boolean(subscription) && !isPlatformMode
    return !isPlatformMode && !billingOnly && canAccessPage(roles, item.to)
  })
  const showPlanBanner = Boolean(subscription) && !isPlatformMode && location.pathname !== '/billing'
    && (subscription?.phase !== 'ok' || subscription?.status === 'trialing')

  // The plan changed (a payment landed, it lapsed): reload the session so menus and banners follow.
  useEffect(() => {
    const onPlanChange = () => { refreshSession() }
    const onRequired = () => { refreshSession().finally(() => navigate('/billing', { replace: true })) }
    socket.on('subscription:updated', onPlanChange)
    window.addEventListener(SUBSCRIPTION_REQUIRED_EVENT, onRequired)
    return () => {
      socket.off('subscription:updated', onPlanChange)
      window.removeEventListener(SUBSCRIPTION_REQUIRED_EVENT, onRequired)
    }
  }, [refreshSession, navigate])
  // Staff of another gym who also applied to open their own see how the request is going.
  const applications = session?.organizationApplications ?? []
  // On phones and tablets the sidebar slides in over the page, so reception can use the access scanner there.
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const userName = session?.user.name || session?.user.nombre || session?.user.email || ''
  const roleLabel = isPlatformMode ? 'SIRID' : [...roles].join(' · ')

  // One connection for the whole session; its rooms cover every gym, so switching gyms keeps it.
  useEffect(() => {
    connectSocket()
    return () => disconnectSocket()
  }, [])

  // Escape closes the drawer, as any overlay.
  useEffect(() => {
    if (!isMenuOpen) return
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setIsMenuOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isMenuOpen])

  return (
    <div className="min-h-screen bg-canvas">
      <div
        className={`fixed inset-0 z-20 bg-ink/50 backdrop-blur-[2px] transition-opacity duration-200 lg:hidden ${isMenuOpen ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
        aria-hidden="true"
        onClick={() => setIsMenuOpen(false)}
      />
      <aside
        className={`fixed inset-y-0 left-0 z-30 flex h-screen w-[264px] flex-col bg-ink text-slate-400 transition-transform duration-300 ease-out lg:translate-x-0 ${isMenuOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'}`}
        aria-label="Menú lateral"
      >
        <div className="flex items-center justify-between px-5 pb-5 pt-6">
          <Wordmark />
          <button className="grid h-9 w-9 place-items-center rounded-lg text-slate-400 transition hover:bg-white/5 hover:text-white lg:hidden" type="button" aria-label="Cerrar menú" onClick={() => setIsMenuOpen(false)}>
            <X size={20} aria-hidden />
          </button>
        </div>

        {gyms.length > 0 && (
          <div className="px-4">
            <label className="mb-1.5 block px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500" htmlFor="active-gym">
              Sucursal
            </label>
            <select
              className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm font-medium text-white outline-none transition hover:border-white/20 focus:border-brand disabled:opacity-70 [&>optgroup]:bg-ink [&>option]:bg-ink"
              id="active-gym"
              value={activeGymId ?? ''}
              onChange={(event) => setActiveGymId(event.target.value)}
              disabled={gyms.length === 1 && !isPlatformAdmin}
            >
              {isPlatformAdmin && <option value="">Panel SIRID</option>}
              {canSeeAllGyms && <option value={ALL_GYMS}>Todas las sucursales</option>}
              {organizations.length > 1
                ? organizations.map((organization) => (
                  <optgroup key={organization.id} label={organization.name}>
                    {gyms.filter((gym) => gym.organization.id === organization.id)
                      .map((gym) => <option key={gym.id} value={gym.id}>{gym.name}</option>)}
                  </optgroup>
                ))
                : gyms.map((gym) => <option key={gym.id} value={gym.id}>{gym.name}</option>)}
            </select>
          </div>
        )}

        <nav className="mt-4 flex-1 overflow-y-auto px-3 pb-4" aria-label="Navegación principal">
          {visibleNavigation.map(({ label, to, icon: Icon, end, section, disabled }, index) => (
            <div key={to}>
              {section && visibleNavigation[index - 1]?.section !== section && (
                <p className="mb-1 mt-5 px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                  {section}
                </p>
              )}
              {disabled ? (
                <div
                  className="flex cursor-not-allowed items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-600"
                  aria-disabled="true"
                  title="Módulo en mantenimiento"
                >
                  <Icon size={18} strokeWidth={1.8} aria-hidden />
                  <span>{label}</span>
                </div>
              ) : (
                <NavLink
                  to={to}
                  end={end}
                  onClick={() => setIsMenuOpen(false)}
                  className={({ isActive }) =>
                    `group relative mb-0.5 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors duration-150 ${
                      isActive
                        ? 'bg-white/10 text-white'
                        : 'text-slate-400 hover:bg-white/5 hover:text-white'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <span
                        className={`absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-brand transition-all duration-200 ${isActive ? 'opacity-100' : 'scale-y-0 opacity-0'}`}
                        aria-hidden="true"
                      />
                      <span className={isActive ? 'text-brand' : 'transition-colors group-hover:text-white'}>
                        <Icon size={18} strokeWidth={isActive ? 2.2 : 1.8} aria-hidden />
                      </span>
                      <span>{label}</span>
                    </>
                  )}
                </NavLink>
              )}
            </div>
          ))}
        </nav>

        <div className="border-t border-white/10 p-3">
          <div className="flex items-center gap-3 rounded-xl px-2 py-2">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/10 text-sm font-semibold uppercase text-white" aria-hidden="true">
              {userName.slice(0, 1)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white">{userName}</p>
              {roleLabel && <p className="truncate text-xs text-slate-500">{roleLabel}</p>}
            </div>
            <button
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-400 transition hover:bg-white/5 hover:text-white"
              type="button"
              onClick={signOut}
              aria-label="Cerrar sesión"
              title="Cerrar sesión"
            >
              <LogOut size={18} aria-hidden />
            </button>
          </div>
        </div>
      </aside>

      <main className="h-screen min-h-screen overflow-y-auto lg:ml-[264px]">
        <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-white/5 bg-ink/95 px-4 py-3 text-white backdrop-blur lg:hidden">
          <button className="grid h-10 w-10 place-items-center rounded-lg text-slate-300 transition hover:bg-white/5 hover:text-white" type="button" aria-label="Abrir menú" aria-expanded={isMenuOpen} onClick={() => setIsMenuOpen(true)}>
            <Menu size={22} aria-hidden />
          </button>
          <Wordmark />
        </div>
        {applications.map((application) => (
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:px-8" key={application.id} role="status">
            Tu organización <strong>{application.name}</strong> {APPLICATION_STATUS[application.status]}
            {application.reason ? `: ${application.reason}` : '.'}
          </div>
        ))}
        {showPlanBanner && subscription && (
          <div
            className={`flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5 text-sm sm:px-8 ${subscription.phase === 'ok' ? 'border-slate-200 bg-white text-slate-700' : 'border-red-200 bg-red-50 text-red-900'}`}
            role="status"
          >
            <p>
              {subscription.phase === 'ok'
                ? <>Prueba de <strong>GymGo {subscription.planName}</strong>: te quedan <strong className="tabular">{subscription.daysLeft} {subscription.daysLeft === 1 ? 'día' : 'días'}</strong>, hasta el {formatLongDate(subscription.trialEndsAt)}.</>
                : <>Tu plan de GymGo venció. {subscription.phase === 'grace' ? `Tu equipo puede seguir hasta el ${formatLongDate(subscription.graceEndsAt)}.` : 'Tu gimnasio está pausado.'}</>}
            </p>
            <Link className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold transition ${subscription.phase === 'ok' ? 'bg-brand text-brand-ink hover:bg-brand-hover' : 'bg-red-600 text-white hover:bg-red-700'}`} to="/billing">
              <Gem size={14} aria-hidden /> {subscription.phase === 'ok' ? 'Ver mi plan' : 'Pagar ahora'}
            </Link>
          </div>
        )}
        <StaffInvitationsNotice />
        {/* Pages remount when the gym changes, so they reload their data for it; each route fades in. */}
        <div className="animate-page-in" key={`${activeGymId ?? 'sin-sucursal'}:${location.pathname}`}>
          <Outlet />
        </div>
      </main>
      <PlanUpgradeModal />
    </div>
  )
}

export default AdminLayout
