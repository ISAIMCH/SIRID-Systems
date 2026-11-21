import type { ReactNode } from 'react'

interface PageHeaderProps {
  // Menu section the page belongs to (Operación, Comercial...).
  eyebrow: string
  title: string
  description?: ReactNode
  // The page's main buttons, aligned to the right on wide screens.
  actions?: ReactNode
}

// Title block shared by every page: section, name, one line about it and its main action.
function PageHeader({ eyebrow, title, description, actions }: PageHeaderProps) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">{eyebrow}</p>
        <h1 className="mt-2 font-display text-4xl font-bold tracking-tight text-ink">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}

export default PageHeader
