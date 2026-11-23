import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Check, MailPlus, X } from 'lucide-react'
import {
  cancelStaffInvitation,
  createStaffInvitation,
  getStaffInvitations,
  type StaffInvitation,
  type StaffInvitationStatus,
} from '../services/api'
import { socket } from '../services/socket'
import { useAuth } from '../store/useAuth'
import { targetGymField } from '../utils/targetGym'
import { ROLE_LABELS, STAFF_ROLES } from '../utils/roles'
import type { GymRole } from '../types'
import GymSelect from './GymSelect'
import Modal from './ui/Modal'
import Badge, { type BadgeTone } from './ui/Badge'
import EmptyState from './ui/EmptyState'
import {
  errorAlert,
  fieldClass,
  hintClass,
  labelClass,
  primaryButton,
  secondaryButton,
  successAlert,
  tableHeadClass,
  tdClass,
  thClass,
} from './ui/styles'

const STATUS_LABELS: Record<StaffInvitationStatus, { label: string; tone: BadgeTone }> = {
  pending: { label: 'Pendiente', tone: 'warning' },
  accepted: { label: 'Aceptada', tone: 'success' },
  rejected: { label: 'Rechazada', tone: 'danger' },
  cancelled: { label: 'Cancelada', tone: 'neutral' },
  expired: { label: 'Vencida', tone: 'neutral' },
}

export interface InvitePrefill {
  email: string
  roles: GymRole[]
}

interface StaffInvitationsPanelProps {
  // Only the owner invites managers or cancels their invitations.
  isOwner: boolean
  // Set to open the invite form, e.g. from the header button or after "Agregar trabajador" found the account.
  invitePrefill: InvitePrefill | null
  onCloseInvite: () => void
}

// Invitations for people who already have a GymGo account (in this or another organization) to join the staff.
function StaffInvitationsPanel({ isOwner, invitePrefill, onCloseInvite }: StaffInvitationsPanelProps) {
  const { isAllGyms } = useAuth()
  const [invitations, setInvitations] = useState<StaffInvitation[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(() => {
    getStaffInvitations()
      .then((response) => {
        setInvitations(response.invitations)
        setError(null)
      })
      .catch((requestError: unknown) => setError(requestError instanceof Error ? requestError.message : 'No se pudieron cargar las invitaciones.'))
      .finally(() => setIsLoading(false))
  }, [])

  useEffect(() => {
    load()
    socket.on('staff-invitation:updated', load)
    return () => { socket.off('staff-invitation:updated', load) }
  }, [load])

  async function cancel(invitation: StaffInvitation) {
    if (!window.confirm(`¿Cancelar la invitación para ${invitation.email}?`)) return
    try {
      await cancelStaffInvitation(invitation.id)
      load()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No se pudo cancelar la invitación.')
    }
  }

  return (
    <div>
      {notice && <p className={`${successAlert} mb-4`} role="status">{notice}</p>}
      {error && <p className={`${errorAlert} mb-4`} role="alert">{error}</p>}

      {isLoading ? (
        <div className="space-y-3" aria-label="Cargando invitaciones" aria-busy="true">
          {Array.from({ length: 3 }).map((_, index) => <div className="skeleton h-12 w-full" key={index} />)}
        </div>
      ) : invitations.length === 0 ? (
        <EmptyState icon={MailPlus} title="No hay invitaciones">
          Usa «Invitar existente» para sumar al staff a alguien que ya usa GymGo.
        </EmptyState>
      ) : (
        <div className="-mx-5 overflow-x-auto sm:-mx-6">
          <table className="min-w-full text-left text-sm">
            <thead className={tableHeadClass}>
              <tr>
                <th className={thClass}>Correo</th>
                <th className={thClass}>Roles</th>
                <th className={thClass}>Sucursal</th>
                <th className={thClass}>Estado</th>
                <th className={thClass}>Vence</th>
                <th className={thClass}><span className="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {invitations.map((invitation) => {
                const status = STATUS_LABELS[invitation.status]
                const canCancel = invitation.status === 'pending' && (isOwner || !invitation.roles.includes('Gerente'))
                return (
                  <tr className="transition-colors hover:bg-slate-50" key={invitation.id}>
                    <td className={`${tdClass} whitespace-nowrap font-medium text-ink`}>{invitation.email}</td>
                    <td className={tdClass}>
                      <div className="flex flex-wrap gap-1.5">
                        {invitation.roles.map((role) => <Badge tone={role === 'Gerente' ? 'brand' : 'neutral'} key={role}>{ROLE_LABELS[role] ?? role}</Badge>)}
                      </div>
                    </td>
                    <td className={`${tdClass} whitespace-nowrap text-slate-500`}>{invitation.gym.name ?? '—'}</td>
                    <td className={tdClass}><Badge tone={status.tone}>{status.label}</Badge></td>
                    <td className={`${tdClass} whitespace-nowrap text-slate-500 tabular`}>
                      {invitation.status === 'pending' ? new Date(invitation.expiresAt).toLocaleDateString('es-MX') : '—'}
                    </td>
                    <td className={`${tdClass} whitespace-nowrap text-right`}>
                      {canCancel && (
                        <button
                          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-500 transition hover:bg-red-50 hover:text-red-700"
                          type="button"
                          onClick={() => void cancel(invitation)}
                        >
                          <X size={15} aria-hidden /> Cancelar
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {invitePrefill && (
        <InviteModal
          isOwner={isOwner}
          isAllGyms={isAllGyms}
          prefill={invitePrefill}
          onClose={onCloseInvite}
          onSent={(message) => {
            setNotice(message)
            onCloseInvite()
            load()
          }}
        />
      )}
    </div>
  )
}

interface InviteModalProps {
  isOwner: boolean
  isAllGyms: boolean
  prefill: InvitePrefill
  onClose: () => void
  onSent: (message: string) => void
}

function InviteModal({ isOwner, isAllGyms, prefill, onClose, onSent }: InviteModalProps) {
  const [email, setEmail] = useState(prefill.email)
  const [roles, setRoles] = useState<GymRole[]>(prefill.roles.filter((role) => isOwner || role !== 'Gerente'))
  const [gymId, setGymId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  function toggleRole(role: GymRole, checked: boolean) {
    setRoles((current) => STAFF_ROLES.filter((item) => (item === role ? checked : current.includes(item))))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setIsSubmitting(true)
    try {
      if (roles.length === 0) throw new Error('Selecciona al menos un rol.')
      const response = await createStaffInvitation({ email: email.trim(), roles, ...targetGymField(isAllGyms, gymId) })
      onSent(response.message)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No se pudo enviar la invitación.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Modal eyebrow="Staff" title="Invitar cuenta existente" onClose={() => { if (!isSubmitting) onClose() }}>
      <form className="space-y-5" onSubmit={handleSubmit}>
        <p className="-mt-1 text-sm text-slate-500">
          Para quien ya usa GymGo en otro gimnasio o como cliente. Se une a tu staff cuando acepta la invitación.
        </p>
        <div>
          <label className={labelClass} htmlFor="invite-email">Correo de su cuenta GymGo</label>
          <input
            className={fieldClass}
            id="invite-email"
            type="email"
            autoComplete="off"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </div>

        <fieldset>
          <legend className={labelClass}>Roles</legend>
          <div className="flex flex-wrap gap-2">
            {STAFF_ROLES.map((role) => {
              const isChecked = roles.includes(role)
              const isDisabled = role === 'Gerente' && !isOwner
              return (
                <label
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand/40 ${
                    isChecked ? 'border-brand-text/30 bg-brand-soft font-medium text-brand-ink' : 'border-slate-200 text-slate-600 hover:border-slate-300'
                  } ${isDisabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
                  key={role}
                >
                  <input
                    className="sr-only"
                    type="checkbox"
                    checked={isChecked}
                    disabled={isDisabled}
                    onChange={(event) => toggleRole(role, event.target.checked)}
                  />
                  {isChecked && <Check size={13} aria-hidden />}
                  {ROLE_LABELS[role]}
                </label>
              )
            })}
          </div>
          {!isOwner && <p className={hintClass}>Solo el propietario invita como Gerente.</p>}
        </fieldset>

        <GymSelect id="invite-gym" label="Sucursal" value={gymId} onChange={setGymId} />

        {error && <p className={errorAlert} role="alert">{error}</p>}

        <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
          <button className={secondaryButton} type="button" onClick={onClose} disabled={isSubmitting}>Cancelar</button>
          <button className={primaryButton} type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Enviando...' : 'Enviar invitación'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

export default StaffInvitationsPanel
