import {
  CreditCard,
  Dumbbell,
  Package,
  LayoutDashboard,
  Megaphone,
  Receipt,
  Users,
  Wrench,
} from 'lucide-react'
import { NavLink, Outlet } from 'react-router-dom'

const navigation = [
  { label: 'Inicio', to: '/', icon: LayoutDashboard, end: true, section: undefined },
  { label: 'Gimnasios', to: '/gyms', icon: Dumbbell, section: undefined },
  { label: 'Equipo', to: '/equipment', icon: Wrench, section: undefined },
  { label: 'Inventario', to: '/inventory', icon: Package, section: undefined },
  { label: 'Usuarios', to: '/users', icon: Users, section: undefined },
  { label: 'Promociones', to: '/promotions', icon: Megaphone, section: 'Comercial' },
  { label: 'Pagos', to: '/payments', icon: Receipt, section: 'Comercial' },
  { label: 'Suscripciones', to: '/subscriptions', icon: CreditCard, section: 'Comercial' },
]

function AdminLayout() {
  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <aside className="fixed inset-y-0 left-0 z-10 flex w-64 flex-col bg-[#0F172A] px-4 py-6 text-slate-300">
        <div className="border-b border-slate-700/70 px-3 pb-6">
          <p className="text-xl font-semibold tracking-tight text-white">GymGo</p>
          <p className="mt-1 text-xs font-medium uppercase tracking-[0.25em] text-[#9BFF63]">
            Admin portal
          </p>
        </div>

        <nav className="mt-8 space-y-2" aria-label="Navegación principal">
          {navigation.map(({ label, to, icon: Icon, end, section }, index) => (
            <div key={to}>
              {section && navigation[index - 1]?.section !== section && (
                <p className="mb-2 mt-5 px-3 text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
                  {section}
                </p>
              )}
              <NavLink
                to={to}
                end={end}
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
            </div>
          ))}
        </nav>

        <div className="mt-auto border-t border-slate-700/70 px-3 pt-5">
          <p className="text-xs text-slate-500">Panel de operaciones</p>
          <p className="mt-1 text-sm text-slate-300">Versión inicial</p>
        </div>
      </aside>

      <main className="ml-64 min-h-screen">
        <Outlet />
      </main>
    </div>
  )
}

export default AdminLayout