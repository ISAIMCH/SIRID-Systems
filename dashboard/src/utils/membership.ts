import type { UserMembership } from '../types'
import type { BadgeTone } from '../components/ui/Badge'

// Same rule as the API's hasActiveMembership: active, already started and not expired.
export function hasCurrentMembership(membership: UserMembership | undefined, now = new Date()) {
  return membership?.status === 'active'
    && (!membership.startsAt || new Date(membership.startsAt) <= now)
    && (!membership.expiresAt || new Date(membership.expiresAt) >= now)
}

// An active membership past its date shows as expired before the API's job marks it.
export function membershipBadge(membership: UserMembership | undefined, now = new Date()): { label: string; tone: BadgeTone } {
  if (!membership?.status) return { label: 'Sin membresía', tone: 'neutral' }
  if (hasCurrentMembership(membership, now)) return { label: 'Vigente', tone: 'success' }
  if (membership.status === 'active' && membership.startsAt && new Date(membership.startsAt) > now) {
    return { label: 'Por iniciar', tone: 'info' }
  }
  if (membership.status === 'active' || membership.status === 'expired') return { label: 'Vencida', tone: 'danger' }
  if (membership.status === 'suspended') return { label: 'Suspendida', tone: 'warning' }
  return { label: 'Pago pendiente', tone: 'warning' }
}

export function formatMembershipDate(value: string | undefined) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' }).format(date)
}
