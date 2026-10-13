export type UserRole = 'Admin' | 'Coach' | 'Cliente'

export interface User {
  id?: string
  _id?: string
  firstName: string
  lastName: string
  email: string
  role: UserRole
  status: string
}

export interface Plan {
  id?: string
  _id?: string
  name?: string
  nombre?: string
  price?: number | string
  precio?: number | string
  durationInDays?: number
  duration?: number | string
  tipoCobro?: string
  isActive?: boolean
  descripcion?: string
  destacado?: boolean
  caracteristicas?: string[]
}