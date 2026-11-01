export type UserRole = 'Admin' | 'Coach' | 'Recepcion' | 'Cliente'

// Propietario and Cliente cover the whole organization; staff roles are held per gym and combine freely.
export type GymRole = 'Gerente' | 'Coach' | 'Recepcion'
export type MemberRole = 'Propietario' | 'Cliente' | GymRole
// What the users form assigns: Cliente alone, or any mix of staff roles in one gym.
export type AssignableRole = 'Cliente' | GymRole

export interface User {
  id?: string
  _id?: string
  name?: string
  firstName?: string
  lastName?: string
  email: string
  // Legacy single role (Propietario and Gerente are Admin); `roles` and `gymRoles` give the full picture.
  role: UserRole
  roles?: MemberRole[]
  gymRoles?: Array<{ gymId: string; roles: GymRole[] }>
  // False when other organizations also use the account: only its holder changes the email or password.
  canEditCredentials?: boolean
  // Opened by reception and not activated in the app yet.
  pendingActivation?: boolean
  status?: string
  isActive?: boolean
  phone?: string
  address?: string
  documents?: string[]
  goal?: string
  experienceLevel?: string
  availableTrainingDays?: number[]
  assignedCoach?: string | UserReference
  planId?: string | UserReference
  membership?: UserMembership
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

export interface UserMembership {
  planId?: string | UserReference
  plan?: string | UserReference
  planName?: string
  status?: 'pending' | 'active' | 'suspended' | 'expired'
  startsAt?: string
  expiresAt?: string
}

export type PlanType = 'standard' | 'student' | 'limited_hours' | 'single_gym' | 'promotional'
// all: every gym of the organization; home: the gym where it is sold; list: only gymIds.
export type GymAccessScope = 'all' | 'home' | 'list'

export interface PlanSchedule {
  startTime: string
  endTime: string
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
  autoRenew?: boolean
  planType?: PlanType
  // Access rules; the type only prefills them in the form.
  gymAccess?: { scope: GymAccessScope; gymIds?: string[] }
  schedule?: PlanSchedule | null
  requiredDocument?: 'student_id' | null
  specifications?: string[]
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
  // Units in the selected gym (or the main one); stockByGym lists every gym the user sees.
  stock: number
  stockByGym?: Array<{ gymId: string; quantity: number }>
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
  imageUrl?: string
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
  validUntil?: string
  isActive: boolean
  imageUrl?: string
  // store: products in sales and the app; membership: plans charged in Payments.
  appliesTo?: PromotionTarget
  applicableProducts?: string[]
  applicablePlans?: string[]
  requiredDocument?: 'student_id' | null
}

export type PromotionTarget = 'store' | 'membership'