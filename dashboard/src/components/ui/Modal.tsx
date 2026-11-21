import { useEffect, useId, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

interface ModalProps {
  eyebrow?: string
  title: ReactNode
  onClose: () => void
  size?: 'md' | 'lg' | 'xl'
  children: ReactNode
}

const SIZES = { md: 'max-w-md', lg: 'max-w-lg', xl: 'max-w-2xl' }

// Centered dialog over a dimmed page. Escape closes it; a click outside does not, so a half-filled form is not lost.
// It renders in <body>: the page wrapper's fade-in animation is a stacking context that would keep it under the sidebar.
function Modal({ eyebrow, title, onClose, size = 'lg', children }: ModalProps) {
  const titleId = useId()

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 backdrop-blur-sm sm:items-center sm:px-4">
      <div
        className={`max-h-[92vh] w-full ${SIZES[size]} animate-pop-in overflow-y-auto rounded-t-card bg-white p-5 shadow-lift sm:rounded-card sm:p-6`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            {eyebrow && <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-text">{eyebrow}</p>}
            <h2 className="mt-1 font-display text-2xl font-bold tracking-tight text-ink" id={titleId}>{title}</h2>
          </div>
          <button
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-ink"
            type="button"
            aria-label="Cerrar"
            onClick={onClose}
          >
            <X size={20} aria-hidden />
          </button>
        </div>
        <div className="mt-5">{children}</div>
      </div>
    </div>,
    document.body,
  )
}

export default Modal
