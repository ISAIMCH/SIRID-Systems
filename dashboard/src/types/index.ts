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
  phone?: string
  goal?: string
  experienceLevel?: string
  availableTrainingDays?: number[]
  assignedCoach?: string | UserReference
  planId?: string | UserReference
  observations?: string
}

export interface UserReference {
  id?: string
  _id?: string
  name?: string
  nombre?: string
  firstName?: string
  lastName?: string
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
  imageUrl?: string
}

export type EquipmentStatus = 'operational' | 'maintenance' | 'broken'

export interface Equipment {
  id?: string
  _id?: string
  name: string
  zone: string
  brand: string
  type?: string
  totalQuantity?: number
  maintenanceQuantity?: number
  status: EquipmentStatus
  activeReportsCount?: number
}

export interface Promotion {
  id?: string
  _id?: string
  title: string
  description: string
  discountPercentage: number
  validUntil: string
  isActive: boolean
  imageUrl?: string
}