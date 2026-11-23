import { Clock, ShieldAlert, XCircle } from 'lucide-react'
import { Link } from 'react-router-dom'
import Badge, { type BadgeTone } from './ui/Badge'
import { primaryButton, secondaryButton } from './ui/styles'
import type { OrganizationNotice } from '../services/api'

const STATUS_COPY = {
  pending: {
    icon: Clock,
    tone: 'warning' as BadgeTone,
    label: 'En revisión',
    text: 'SIRID está revisando tu solicitud y te llamará al teléfono que registraste. Mientras tanto no puedes crear planes, personal ni otros datos. Inicia sesión más tarde para ver si ya fue aprobada.',
  },
  rejected: {
    icon: XCircle,
    tone: 'danger' as BadgeTone,
    label: 'Rechazada',
    text: 'SIRID no aprobó tu solicitud. Corrige los datos y envíala de nuevo con el mismo correo y contraseña.',
  },
  suspended: {
    icon: ShieldAlert,
    tone: 'danger' as BadgeTone,
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

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Tu organización</p>
      <h1 className="mt-1.5 font-display text-2xl font-bold tracking-tight text-ink">{notice.name}</h1>
      <div className="mt-3"><Badge tone={copy.tone} icon={copy.icon}>{copy.label}</Badge></div>
      <p className="mt-5 text-sm leading-6 text-slate-600">{copy.text}</p>
      {notice.reason && (
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Motivo</p>
          <p className="mt-1 text-sm text-slate-800">{notice.reason}</p>
        </div>
      )}
      <div className="mt-8 flex flex-col gap-3">
        {notice.status === 'rejected' && (
          <Link className={`${primaryButton} min-h-[44px] w-full`} to="/signup">
            Enviar solicitud de nuevo
          </Link>
        )}
        <button className={`${secondaryButton} min-h-[44px] w-full`} type="button" onClick={onBack}>
          Volver al inicio de sesión
        </button>
      </div>
    </div>
  )
}

export default OrganizationStatusCard
