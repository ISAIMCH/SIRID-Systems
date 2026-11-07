import type { ComponentType, ReactNode } from 'react'

interface EmptyStateProps {
  icon: ComponentType<{ size?: number; 'aria-hidden'?: boolean }>
  title: string
  children?: ReactNode
}

// What a section shows when there is no data yet, and what would fill it.
function EmptyState({ icon: Icon, title, children }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 px-6 py-10 text-center">
      <span className="grid h-11 w-11 place-items-center rounded-full bg-slate-100 text-slate-500">
        <Icon size={20} aria-hidden />
      </span>
      <p className="mt-3 text-sm font-semibold text-ink">{title}</p>
      {children && <p className="mt-1 max-w-sm text-sm text-slate-500">{children}</p>}
    </div>
  )
}

export default EmptyState
