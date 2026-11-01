import {
  Building2,
  CreditCard,
  ClipboardList,
  Dumbbell,
  FileText,
  Package,
  LayoutDashboard,
  Megaphone,
  Menu,
  Receipt,
  ScanLine,
  ShoppingCart,
  Users,
  Wrench,
} from 'lucide-react'
import { useEffect, useState, type ComponentType } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../store/useAuth'
import { ALL_GYMS } from '../services/activeGym'
import { connectSocket, disconnectSocket } from '../services/socket'
import { canAccessPage, useStaffRoles } from '../utils/access'
import StaffInvitationsNotice from '../components/StaffInvitationsNotice'

interface NavItem {
  label: string
  to: string
  icon: ComponentType<{ size?: number; strokeWidth?: number }>
  end?: boolean
  section?: string
  disabled?: boolean
  // Only for SIRID staff (User.isPlatformAdmin).
  platformOnly?: boolean
}

const navigation: NavItem[] = [
  { label: 'Inicio', to: '/', icon: LayoutDashboard, end: true },
  { label: 'Gimnasios', to: '/gyms', icon: Dumbbell },
  { label: 'Control de acceso', to: '/access', icon: ScanLine },
  { label: 'Equipo', to: '/equipment', icon: Wrench },
  { label: 'Inventario', to: '/inventory', icon: Package },
  { label: 'Usuarios', to: '/users', icon: Users },
  { label: 'Documentos', to: '/documents', icon: FileText },
  { label: 'Ejercicios', to: '/exercises', icon: Dumbbell, section: 'Entrenamiento' },
  { label: 'Rutinas', to: '/routines', icon: ClipboardList, section: 'Entrenamiento' },
  { label: 'Promociones', to: '/promotions', icon: Megaphone, section: 'Comercial' },
  { label: 'Pagos', to: '/payments', icon: Receipt, section: 'Comercial' },
  { label: 'Ventas', to: '/sales', icon: ShoppingCart, section: 'Comercial' },
  { label: 'Suscripciones', to: '/subscriptions', icon: CreditCard, section: 'Comercial' },
  { label: 'Organizaciones', to: '/platform', icon: Building2, section: 'SIRID', platformOnly: true },
]

const APPLICATION_STATUS = { pending: 'está en revisión', rejected: 'fue rechazada', suspended: 'está suspendida', active: 'está activa' } as const

function AdminLayout() {
  const { signOut, session, activeGymId, setActiveGymId, canSeeAllGyms, isPlatformMode } = useAuth()
  const gyms = session?.gyms ?? []
  const organizations = [...new Map(gyms.map((gym) => [gym.organization.id, gym.organization])).values()]

  const roles = useStaffRoles()
  const isPlatformAdmin = Boolean(session?.user.isPlatformAdmin)
  // In the SIRID panel the gym modules are hidden until a gym is picked in the selector.
  const visibleNavigation = navigation.filter((item) => {
    if (item.platformOnly) return isPlatformAdmin
    return !isPlatformMode && canAccessPage(roles, item.to)
  })
  // Staff of another gym who also applied to open their own see how the request is going.
  const applications = session?.organizationApplications ?? []
  // On phones the sidebar slides in over the page, so reception can use the access scanner there.
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  // One connection for the whole session; its rooms cover every gym, so switching gyms keeps it.
  useEffect(() => {
    connectSocket()
    return () => disconnectSocket()
  }, [])

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      {isMenuOpen && (
        <div className="fixed inset-0 z-20 bg-slate-900/50 md:hidden" aria-hidden="true" onClick={() => setIsMenuOpen(false)} />
      )}
      <aside className={`fixed inset-y-0 left-0 z-30 flex h-screen w-64 flex-col overflow-y-auto bg-[#0F172A] px-4 py-6 text-slate-300 transition-transform md:translate-x-0 ${isMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="border-b border-slate-700/70 px-3 pb-6">
          <p className="text-xl font-semibold tracking-tight text-white">GymGo</p>
          <p className="mt-1 text-xs font-medium uppercase tracking-[0.25em] text-[#9BFF63]">
            Admin portal
          </p>
        </div>

        {gyms.length > 0 && (
          <div className="mt-6 px-3">
            <label className="mb-2 block text-xs font-medium uppercase tracking-[0.2em] text-slate-500" htmlFor="active-gym">
              Sucursal
            </label>
            <select
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white outline-none transition focus:border-[#9BFF63] disabled:opacity-70"
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

        <nav className="mt-8 space-y-2" aria-label="Navegación principal">
          {visibleNavigation.map(({ label, to, icon: Icon, end, section, disabled }, index) => (
            <div key={to}>
              {section && visibleNavigation[index - 1]?.section !== section && (
                <p className="mb-2 mt-5 px-3 text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
                  {section}
                </p>
              )}
              {disabled ? (
                <div
                  className="flex cursor-not-allowed items-center gap-3 px-3 py-3 text-sm font-medium text-slate-600"
                  aria-disabled="true"
                  title="Módulo en mantenimiento"
                >
                  <Icon size={19} strokeWidth={1.8} />
                  <span>{label}</span>
                </div>
              ) : (
                <NavLink
                  to={to}
                  end={end}
                  onClick={() => setIsMenuOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-3 text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-white/10 text-[#9BFF63]'
                        : 'text-slate-400 hover:bg-white/5 hover:text-white'
                    }`
                  }
                >
                  <Icon size={19} strokeWidth={1.8} />
                  <span>{label}</span>
                </NavLink>
              )}
            </div>
          ))}
        </nav>

        <div className="mt-auto border-t border-slate-700/70 px-3 pt-5">
          <p className="text-xs text-slate-500">Panel de operaciones</p>
          <p className="mt-1 text-sm text-slate-300">Versión inicial</p>
          <button
            className="mt-4 text-sm font-medium text-slate-400 transition-colors hover:text-white"
            type="button"
            onClick={signOut}
          >
            Cerrar sesión
          </button>
        </div>
      </aside>

      <main className="h-screen min-h-screen overflow-y-auto md:ml-64">
        <div className="sticky top-0 z-10 flex items-center gap-3 bg-[#0F172A] px-4 py-3 text-white md:hidden">
          <button className="rounded-lg p-1 text-slate-300 transition hover:text-white" type="button" aria-label="Abrir menú" onClick={() => setIsMenuOpen(true)}>
            <Menu size={22} />
          </button>
          <p className="font-semibold tracking-tight">GymGo</p>
        </div>
        {applications.map((application) => (
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:px-8" key={application.id} role="status">
            Tu organización <strong>{application.name}</strong> {APPLICATION_STATUS[application.status]}
            {application.reason ? `: ${application.reason}` : '.'}
          </div>
        ))}
        <StaffInvitationsNotice />
        {/* Pages remount when the gym changes, so they reload their data for it. */}
        <Outlet key={activeGymId ?? 'sin-sucursal'} />
      </main>
    </div>
  )
}

export default AdminLayout