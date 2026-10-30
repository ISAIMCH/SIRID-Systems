import { useAuth } from '../store/useAuth'

export type StaffRole = 'Admin' | 'Coach' | 'Recepcion'

// Mirrors the API's authorize() for each page's main data; pages not listed are open to every staff role.
const PAGE_ROLES: Record<string, StaffRole[]> = {
  '/gyms': ['Admin', 'Recepcion'],
  '/access': ['Admin', 'Recepcion'],
  '/equipment': ['Admin', 'Coach'],
  '/inventory': ['Admin'],
  '/exercises': ['Admin', 'Coach'],
  '/routines': ['Admin', 'Coach'],
  '/promotions': ['Admin', 'Recepcion'],
  '/payments': ['Admin', 'Recepcion'],
  '/sales': ['Admin', 'Recepcion'],
  '/subscriptions': ['Admin', 'Recepcion'],
}

// Same mapping as the API: Propietario and Gerente act as Admin.
function toStaffRole(role: string): StaffRole | null {
  if (role === 'Propietario' || role === 'Gerente' || role === 'Admin') return 'Admin'
  if (role === 'Coach' || role === 'Recepcion') return role
  return null
}

// Roles in the active gym (every gym of the organization in the all-gyms view); sessions without gyms use the legacy role.
export function useStaffRoles() {
  const { session, activeGymId, isAllGyms, organizationGyms } = useAuth()
  const gyms = session?.gyms ?? []
  const scopeGyms = isAllGyms ? organizationGyms : gyms.filter((gym) => gym.id === activeGymId)
  const roleNames = scopeGyms.length > 0 ? scopeGyms.flatMap((gym) => gym.roles) : [session?.user.role ?? '']
  return new Set(roleNames.map(toStaffRole).filter((role) => role !== null))
}

// `path` is a page path like '/payments'; nested paths are checked by their first segment.
export function canAccessPage(roles: Set<StaffRole>, path: string) {
  const pageRoles = PAGE_ROLES[`/${path.split('/')[1] ?? ''}`]
  return pageRoles ? pageRoles.some((role) => roles.has(role)) : roles.size > 0
}
