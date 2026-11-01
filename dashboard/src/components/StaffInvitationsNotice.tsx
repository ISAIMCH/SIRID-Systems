import { useCallback, useEffect, useState } from 'react'
import { getMyStaffInvitations, respondToStaffInvitation, type StaffInvitation } from '../services/api'
import { connectSocket, disconnectSocket, socket } from '../services/socket'
import { useAuth } from '../store/useAuth'
import { roleList } from '../utils/roles'

// Invitations from other gyms to join their staff, for someone who already works in the dashboard.
// Clients only answer in the app, since the dashboard is for staff.
function StaffInvitationsNotice() {
  const { refreshSession } = useAuth()
  const [invitations, setInvitations] = useState<StaffInvitation[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    getMyStaffInvitations()
      .then((response) => setInvitations(response.invitations))
      .catch(() => setInvitations([]))
  }, [])

  useEffect(() => {
    load()
    socket.on('staff-invitation:updated', load)
    return () => { socket.off('staff-invitation:updated', load) }
  }, [load])

  async function respond(invitation: StaffInvitation, answer: 'accept' | 'reject') {
    setBusyId(invitation.id)
    setError(null)
    try {
      await respondToStaffInvitation(invitation.id, answer)
      setInvitations((current) => current.filter((item) => item.id !== invitation.id))
      if (answer === 'accept') {
        // The new gym joins the selector, and the socket reconnects to get that organization's events.
        await refreshSession()
        disconnectSocket()
        connectSocket()
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No se pudo responder la invitación.')
      load()
    } finally {
      setBusyId(null)
    }
  }

  if (invitations.length === 0) return null

  return (
    <div className="border-b border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 sm:px-8" role="status">
      {invitations.map((invitation) => (
        <div className="flex flex-col gap-2 py-1 sm:flex-row sm:items-center sm:justify-between" key={invitation.id}>
          <p>
            <strong>{invitation.organization.name ?? 'Un gimnasio'}</strong> te invita a su staff en{' '}
            <strong>{invitation.gym.name ?? 'una sucursal'}</strong> como {roleList(invitation.roles)}
            {invitation.invitedBy?.name ? ` (de ${invitation.invitedBy.name})` : ''}.
            Vence el {new Date(invitation.expiresAt).toLocaleDateString('es-MX')}.
          </p>
          <div className="flex shrink-0 gap-2">
            <button
              className="rounded-lg px-3 py-1.5 font-medium text-emerald-800 transition hover:bg-emerald-100 disabled:opacity-50"
              type="button"
              disabled={busyId !== null}
              onClick={() => void respond(invitation, 'reject')}
            >
              Rechazar
            </button>
            <button
              className="rounded-lg bg-[#9BFF63] px-3 py-1.5 font-medium text-[#0F172A] transition hover:bg-[#abff7c] disabled:opacity-50"
              type="button"
              disabled={busyId !== null}
              onClick={() => void respond(invitation, 'accept')}
            >
              {busyId === invitation.id ? 'Guardando...' : 'Aceptar'}
            </button>
          </div>
        </div>
      ))}
      {error && <p className="mt-1 text-red-700" role="alert">{error}</p>}
    </div>
  )
}

export default StaffInvitationsNotice
