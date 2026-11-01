import type { UserMembership } from '../types'

// Same rule as the API's hasActiveMembership: active, already started and not expired.
export function hasCurrentMembership(membership: UserMembership | undefined, now = new Date()) {
  return membership?.status === 'active'
    && (!membership.startsAt || new Date(membership.startsAt) <= now)
    && (!membership.expiresAt || new Date(membership.expiresAt) >= now)
}

// An active membership past its date shows as expired before the API's job marks it.
export function membershipBadge(membership: UserMembership | undefined, now = new Date()) {
  if (!membership?.status) return { label: 'Sin membresía', tone: 'bg-slate-100 text-slate-600' }
  if (hasCurrentMembership(membership, now)) return { label: 'Vigente', tone: 'bg-green-100 text-green-800' }
  if (membership.status === 'active' && membership.startsAt && new Date(membership.startsAt) > now) {
    return { label: 'Por iniciar', tone: 'bg-sky-100 text-sky-800' }
  }
  if (membership.status === 'active' || membership.status === 'expired') return { label: 'Vencida', tone: 'bg-red-100 text-red-800' }
  if (membership.status === 'suspended') return { label: 'Suspendida', tone: 'bg-amber-100 text-amber-800' }
  return { label: 'Pago pendiente', tone: 'bg-amber-100 text-amber-800' }
}

export function formatMembershipDate(value: string | undefined) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' }).format(date)
}
