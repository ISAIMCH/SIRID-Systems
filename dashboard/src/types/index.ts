export type UserRole = 'Admin' | 'Coach' | 'Cliente'

export interface User {
  id?: string
  _id?: string
  name?: string
  firstName?: string
  lastName?: string
  email: string
  role: UserRole
  status?: string
  isActive?: boolean
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

export interface Product {
  id?: string
  _id?: string
  name: string
  category: string
  price: number | string
  stock: number
}

export type EquipmentStatus = 'operational' | 'maintenance' | 'broken'

export interface Equipment {
  id?: string
  _id?: string
  name: string
  type: string
  status: EquipmentStatus
  lastMaintenance?: string
  nextMaintenance?: string
}