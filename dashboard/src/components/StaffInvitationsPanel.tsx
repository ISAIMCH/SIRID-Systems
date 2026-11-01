import { useCallback, useEffect, useState, type FormEvent } from 'react'
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
import { ROLE_LABELS, STAFF_ROLES, roleList } from '../utils/roles'
import type { GymRole } from '../types'
import GymSelect from './GymSelect'

const STATUS_LABELS: Record<StaffInvitationStatus, { label: string; className: string }> = {
  pending: { label: 'Pendiente', className: 'bg-amber-100 text-amber-800' },
  accepted: { label: 'Aceptada', className: 'bg-green-100 text-green-800' },
  rejected: { label: 'Rechazada', className: 'bg-red-100 text-red-700' },
  cancelled: { label: 'Cancelada', className: 'bg-slate-100 text-slate-600' },
  expired: { label: 'Vencida', className: 'bg-slate-100 text-slate-600' },
}

export interface InvitePrefill {
  email: string
  roles: GymRole[]
}

interface StaffInvitationsPanelProps {
  // Only the owner invites managers or cancels their invitations.
  isOwner: boolean
  // Set to open the invite form, e.g. from the header button or after "Nuevo usuario" found the account.
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
      {notice && (
        <p className="mb-4 rounded-lg border border-green-100 bg-green-50 px-4 py-3 text-sm text-green-800" role="status">{notice}</p>
      )}
      {error && (
        <p className="mb-4 rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{error}</p>
      )}

      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-slate-100 bg-slate-50/80 text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-6 py-4 font-medium">Correo</th>
              <th className="px-6 py-4 font-medium">Roles</th>
              <th className="px-6 py-4 font-medium">Sucursal</th>
              <th className="px-6 py-4 font-medium">Estado</th>
              <th className="px-6 py-4 font-medium">Vence</th>
              <th className="px-6 py-4 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {invitations.map((invitation) => {
              const status = STATUS_LABELS[invitation.status]
              const canCancel = invitation.status === 'pending' && (isOwner || !invitation.roles.includes('Gerente'))
              return (
                <tr className="transition-colors hover:bg-slate-50" key={invitation.id}>
                  <td className="whitespace-nowrap px-6 py-4 font-medium text-slate-900">{invitation.email}</td>
                  <td className="px-6 py-4">{roleList(invitation.roles)}</td>
                  <td className="whitespace-nowrap px-6 py-4 text-slate-500">{invitation.gym.name ?? '—'}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${status.className}`}>{status.label}</span>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-slate-500">
                    {invitation.status === 'pending' ? new Date(invitation.expiresAt).toLocaleDateString('es-MX') : '—'}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-right">
                    {canCancel && (
                      <button className="text-sm font-medium text-slate-500 transition hover:text-red-600" type="button" onClick={() => void cancel(invitation)}>
                        Cancelar
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
            {!isLoading && invitations.length === 0 && (
              <tr>
                <td className="px-6 py-10 text-center text-sm text-slate-500" colSpan={6}>
                  No hay invitaciones. Usa «Invitar cuenta existente» para sumar al staff a alguien que ya usa GymGo.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-emerald-700">Staff</p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-900">Invitar cuenta existente</h2>
            <p className="mt-2 text-sm text-slate-500">
              Para quien ya usa GymGo en otro gimnasio o como cliente. Se une a tu staff cuando acepta la invitación.
            </p>
          </div>
          <button className="text-2xl leading-none text-slate-400 transition hover:text-slate-700" type="button" aria-label="Cerrar" onClick={onClose}>
            ×
          </button>
        </div>

        <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="invite-email">Correo de su cuenta GymGo</label>
            <input
              className="w-full rounded-lg border border-slate-200 px-4 py-3 text-slate-900 outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-100"
              id="invite-email"
              type="email"
              autoComplete="off"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>

          <fieldset>
            <legend className="mb-2 block text-sm font-medium text-slate-700">Roles</legend>
            <div className="flex flex-wrap gap-3">
              {STAFF_ROLES.map((role) => {
                const isChecked = roles.includes(role)
                const isDisabled = role === 'Gerente' && !isOwner
                return (
                  <label
                    className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${
                      isChecked ? 'border-green-500 bg-green-50 text-green-800' : 'border-slate-200 bg-white text-slate-700'
                    } ${isDisabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
                    key={role}
                  >
                    <input
                      className="accent-green-600"
                      type="checkbox"
                      checked={isChecked}
                      disabled={isDisabled}
                      onChange={(event) => toggleRole(role, event.target.checked)}
                    />
                    {ROLE_LABELS[role]}
                  </label>
                )
              })}
            </div>
            {!isOwner && <p className="mt-2 text-xs text-slate-500">Solo el propietario invita como Gerente.</p>}
          </fieldset>

          <GymSelect id="invite-gym" label="Sucursal" value={gymId} onChange={setGymId} />

          {error && <p className="border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{error}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <button className="rounded-lg px-4 py-2 font-medium text-slate-600 transition hover:bg-slate-100 disabled:opacity-50" type="button" onClick={onClose} disabled={isSubmitting}>
              Cancelar
            </button>
            <button
              className="rounded-lg bg-[#9BFF63] px-4 py-2 font-medium text-[#0F172A] transition hover:bg-[#abff7c] disabled:cursor-not-allowed disabled:opacity-60"
              type="submit"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Enviando...' : 'Enviar invitación'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default StaffInvitationsPanel
