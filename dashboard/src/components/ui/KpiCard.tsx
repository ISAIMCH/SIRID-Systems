import type { ComponentType, ReactNode } from 'react'
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'

export interface KpiDelta {
  // Change against the comparison period, in percent; null when there is nothing to compare with.
  percent: number | null
  label: string
  // A rise is bad news for some indicators (e.g. memberships about to expire).
  invert?: boolean
}

interface KpiCardProps {
  label: string
  value: ReactNode
  icon: ComponentType<{ size?: number; strokeWidth?: number; 'aria-hidden'?: boolean }>
  hint?: ReactNode
  delta?: KpiDelta
  tone?: 'default' | 'brand' | 'warning'
  isLoading?: boolean
}

const ICON_TONES = {
  default: 'bg-slate-100 text-slate-700',
  brand: 'bg-brand text-brand-ink',
  warning: 'bg-amber-100 text-amber-800',
}

function DeltaBadge({ percent, label, invert }: KpiDelta) {
  if (percent === null) return <span className="text-xs text-slate-500">{label}</span>
  const rounded = Math.round(percent)
  const isFlat = rounded === 0
  const isGood = invert ? rounded < 0 : rounded > 0
  const Icon = isFlat ? Minus : rounded > 0 ? ArrowUpRight : ArrowDownRight
  const tone = isFlat ? 'bg-slate-100 text-slate-600' : isGood ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
  return (
    <span className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
      <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-semibold tabular ${tone}`}>
        <Icon size={13} aria-hidden />
        {rounded > 0 ? '+' : ''}{rounded}%
      </span>
      {label}
    </span>
  )
}

// One headline number with its context: what it is, how it moved, what it means.
function KpiCard({ label, value, icon: Icon, hint, delta, tone = 'default', isLoading = false }: KpiCardProps) {
  return (
    <article className="group rounded-card border border-slate-200/80 bg-white p-4 shadow-card transition duration-200 hover:-translate-y-0.5 hover:shadow-lift sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl transition-transform duration-200 group-hover:scale-105 ${ICON_TONES[tone]}`}>
          <Icon size={18} strokeWidth={2} aria-hidden />
        </span>
      </div>
      {isLoading ? (
        <div className="mt-3 space-y-2" aria-busy="true" aria-label={`Cargando ${label}`}>
          <div className="skeleton h-8 w-24" />
          <div className="skeleton h-4 w-32" />
        </div>
      ) : (
        <>
          <p className="mt-2 font-display text-[32px] font-bold leading-none tracking-tight text-ink tabular">{value}</p>
          <div className="mt-2 min-h-[20px]">
            {delta ? <DeltaBadge {...delta} /> : hint && <span className="text-xs text-slate-500">{hint}</span>}
          </div>
        </>
      )}
    </article>
  )
}

export default KpiCard
