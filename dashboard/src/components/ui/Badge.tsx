import type { ComponentType, ReactNode } from 'react'

export type BadgeTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'brand'

const TONES: Record<BadgeTone, string> = {
  success: 'bg-emerald-50 text-emerald-700 ring-emerald-600/15',
  warning: 'bg-amber-50 text-amber-800 ring-amber-600/20',
  danger: 'bg-red-50 text-red-700 ring-red-600/15',
  info: 'bg-sky-50 text-sky-700 ring-sky-600/15',
  neutral: 'bg-slate-100 text-slate-600 ring-slate-500/15',
  brand: 'bg-brand-soft text-brand-text ring-brand-text/20',
}

interface BadgeProps {
  tone?: BadgeTone
  icon?: ComponentType<{ size?: number; 'aria-hidden'?: boolean }>
  children: ReactNode
}

// A short status label (Pagado, Pendiente, Fuera de servicio) colored by what it means.
function Badge({ tone = 'neutral', icon: Icon, children }: BadgeProps) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${TONES[tone]}`}>
      {Icon && <Icon size={12} aria-hidden />}
      {children}
    </span>
  )
}

export default Badge
