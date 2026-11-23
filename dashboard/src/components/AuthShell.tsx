import type { ReactNode } from 'react'
import { BarChart3, QrCode, Users } from 'lucide-react'

const HIGHLIGHTS = [
  { icon: QrCode, text: 'Acceso con QR y torniquetes en cada sucursal' },
  { icon: Users, text: 'Clientes, membresías y staff en un solo lugar' },
  { icon: BarChart3, text: 'Ingresos, asistencia y aforo en tiempo real' },
]

function Logo({ dark = false }: { dark?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand font-display text-lg font-bold text-brand-ink" aria-hidden="true">G</span>
      <span className={`font-display text-xl font-bold tracking-tight ${dark ? 'text-white' : 'text-ink'}`}>Gym<span className={dark ? 'text-brand' : 'text-brand-text'}>Go</span></span>
    </span>
  )
}

interface AuthShellProps {
  // Small label above the card on phones and over the title on desktop (e.g. "Panel administrativo").
  eyebrow: string
  width?: 'md' | '2xl'
  children: ReactNode
}

// Shared frame for the public screens (login, signup): brand panel on desktop, a card with the form beside it.
function AuthShell({ eyebrow, width = 'md', children }: AuthShellProps) {
  return (
    <main className="flex min-h-screen bg-canvas">
      <aside className="relative hidden w-[400px] shrink-0 flex-col justify-between overflow-hidden bg-ink p-10 text-slate-300 lg:flex xl:w-[460px]">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-brand/20 blur-3xl" aria-hidden="true" />
        <Logo dark />
        <div className="relative">
          <h2 className="font-display text-3xl font-bold leading-tight tracking-tight text-white">
            Tu gimnasio, <span className="text-brand">bajo control</span>.
          </h2>
          <ul className="mt-8 space-y-4">
            {HIGHLIGHTS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-sm">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/5 text-brand ring-1 ring-white/10">
                  <Icon size={18} aria-hidden />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-slate-500">GymGo · SIRID Systems</p>
      </aside>

      <div className="flex flex-1 flex-col items-center justify-center px-4 py-10 sm:px-6">
        <div className={`w-full ${width === '2xl' ? 'max-w-2xl' : 'max-w-md'}`}>
          <div className="mb-6 lg:hidden"><Logo /></div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-brand-text">{eyebrow}</p>
          <section className="animate-pop-in rounded-card border border-slate-100 bg-white p-6 shadow-card sm:p-8">
            {children}
          </section>
        </div>
      </div>
    </main>
  )
}

export default AuthShell
