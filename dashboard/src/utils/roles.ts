import type { GymRole, MemberRole } from '../types'

export const ROLE_LABELS: Record<MemberRole, string> = {
  Propietario: 'Propietario',
  Gerente: 'Gerente',
  Coach: 'Coach',
  Recepcion: 'Recepción',
  Cliente: 'Cliente',
}

export const STAFF_ROLES: GymRole[] = ['Gerente', 'Coach', 'Recepcion']

export function roleList(roles: MemberRole[]) {
  return roles.map((role) => ROLE_LABELS[role] ?? role).join(', ')
}
