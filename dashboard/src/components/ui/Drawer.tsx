import { useEffect, useId, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

interface DrawerProps {
  eyebrow?: string
  title: ReactNode
  description?: ReactNode
  onClose: () => void
  children: ReactNode
}

// A panel that slides in from the right over a dimmed page, for reading one record in depth (a client's history or progress).
// Escape closes it. Like Modal, it renders in <body> so the page's fade-in does not trap it under the sidebar.
function Drawer({ eyebrow, title, description, onClose, children }: DrawerProps) {
  const titleId = useId()

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end bg-ink/50 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <div className="flex h-full w-full max-w-3xl animate-slide-in flex-col overflow-y-auto bg-canvas shadow-lift">
        <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-5 py-5 sm:px-6">
          <div className="min-w-0">
            {eyebrow && <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-text">{eyebrow}</p>}
            <h2 className="mt-1 truncate font-display text-2xl font-bold tracking-tight text-ink" id={titleId}>{title}</h2>
            {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
          </div>
          <button
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-ink"
            type="button"
            aria-label="Cerrar"
            onClick={onClose}
          >
            <X size={20} aria-hidden />
          </button>
        </header>
        <div className="space-y-5 px-5 py-6 sm:px-6">{children}</div>
      </div>
    </div>,
    document.body,
  )
}

export default Drawer
