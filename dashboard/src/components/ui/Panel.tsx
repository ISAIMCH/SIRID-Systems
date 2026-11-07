import type { ComponentType, ReactNode } from 'react'

interface PanelProps {
  title: string
  description?: ReactNode
  icon?: ComponentType<{ size?: number; className?: string; 'aria-hidden'?: boolean }>
  // Filters or links, aligned to the right of the title.
  actions?: ReactNode
  className?: string
  children: ReactNode
}

// The card every dashboard section sits in: title row, optional controls, content.
function Panel({ title, description, icon: Icon, actions, className = '', children }: PanelProps) {
  return (
    <section className={`rounded-card border border-slate-200/80 bg-white p-5 shadow-card sm:p-6 ${className}`}>
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
            {Icon && <Icon size={18} className="shrink-0 text-slate-500" aria-hidden />}
            {title}
          </h2>
          {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </header>
      <div className="mt-5">{children}</div>
    </section>
  )
}

export default Panel
