import { Clock, ShieldAlert, XCircle } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { OrganizationNotice } from '../services/api'

const STATUS_COPY = {
  pending: {
    icon: Clock,
    tone: 'border-amber-200 bg-amber-50 text-amber-800',
    label: 'En revisión',
    text: 'SIRID está revisando tu solicitud y te llamará al teléfono que registraste. Mientras tanto no puedes crear planes, personal ni otros datos. Inicia sesión más tarde para ver si ya fue aprobada.',
  },
  rejected: {
    icon: XCircle,
    tone: 'border-red-200 bg-red-50 text-red-800',
    label: 'Rechazada',
    text: 'SIRID no aprobó tu solicitud. Corrige los datos y envíala de nuevo con el mismo correo y contraseña.',
  },
  suspended: {
    icon: ShieldAlert,
    tone: 'border-red-200 bg-red-50 text-red-800',
    label: 'Suspendida',
    text: 'Tu organización está suspendida. Nadie de tu equipo puede entrar hasta que SIRID la reactive. Contacta a SIRID.',
  },
} as const

interface OrganizationStatusCardProps {
  notice: OrganizationNotice
  onBack: () => void
}

// What the login screen shows to the owner of an organization that is not active.
function OrganizationStatusCard({ notice, onBack }: OrganizationStatusCardProps) {
  const copy = STATUS_COPY[notice.status === 'active' ? 'pending' : notice.status]
  const Icon = copy.icon

  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">Tu organización</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">{notice.name}</h1>
      <p className={`mt-4 inline-flex items-center gap-2 border px-3 py-1 text-sm font-medium ${copy.tone}`}>
        <Icon size={16} aria-hidden="true" /> {copy.label}
      </p>
      <p className="mt-5 text-sm leading-6 text-slate-600">{copy.text}</p>
      {notice.reason && (
        <div className="mt-4 border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">Motivo</p>
          <p className="mt-1 text-sm text-slate-800">{notice.reason}</p>
        </div>
      )}
      <div className="mt-8 flex flex-col gap-3">
        {notice.status === 'rejected' && (
          <Link className="w-full bg-[#9BFF63] px-4 py-3 text-center font-semibold text-[#0F172A] transition hover:bg-[#abff7c]" to="/signup">
            Enviar solicitud de nuevo
          </Link>
        )}
        <button className="w-full border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50" type="button" onClick={onBack}>
          Volver al inicio de sesión
        </button>
      </div>
    </div>
  )
}

export default OrganizationStatusCard
