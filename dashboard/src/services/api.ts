import type { Equipment, User, UserRole } from '../types'

export const API_BASE_URL = import.meta.env.VITE_GYMGO_API_URL

if (!API_BASE_URL) {
  throw new Error('VITE_GYMGO_API_URL no está configurada.')
}

export interface LoginCredentials {
  email: string
  password: string
}

export interface AuthUser {
  id: string
  email: string
  nombre: string
  apellidos?: string
}

export interface LoginResponse {
  token: string
  user: AuthUser
}

export interface DashboardStats {
  totalUsers: number
  activePlans: number
  revenue: number
  systemStatus: string
}

interface ApiErrorPayload {
  msg?: string
  message?: string
}

export class ApiError extends Error {
  response: { data: unknown }

  constructor(message: string, data: unknown) {
    super(message)
    this.name = 'ApiError'
    this.response = { data }
  }
}

export async function apiClient<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const token = localStorage.getItem('token')
  const headers = new Headers(options.headers)

  const isFormDataBody = typeof FormData !== 'undefined' && options.body instanceof FormData
  if (isFormDataBody) {
    headers.delete('Content-Type')
  } else if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  })
  const data = (await response.json().catch(() => ({}))) as T & ApiErrorPayload

  if (!response.ok) {
    if (response.status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('userName')
      localStorage.removeItem('userData')
    }
    throw new ApiError(data.msg || data.message || 'No se pudo completar la solicitud.', data)
  }

  return data
}

export function login(credentials: LoginCredentials) {
  return apiClient<LoginResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(credentials),
  })
}

export async function getUsers<T = AuthUser[]>(params?: { role?: string }) {
  const query = params?.role ? `?role=${encodeURIComponent(params.role)}` : ''
  const response = await apiClient<any>(`/auth/users${query}`)
  const responseData = response?.data ?? response
  const users = Array.isArray(responseData)
    ? responseData
    : (responseData?.data || responseData?.users || [])
  return (Array.isArray(users) ? users : []) as T
}

export interface UserPayload {
  name: string
  lastName: string
  email: string
  password?: string
  role: UserRole
  phone?: string
  address?: string
  documents?: string[]
  pdfFiles?: File[]
  isActive?: boolean
  goal?: string
  experienceLevel?: string
  availableTrainingDays?: number[]
  assignedCoach?: string
  planId?: string
  observations?: string
}

function userPayloadBody(userData: UserPayload): BodyInit {
  if (!userData.pdfFiles?.length) {
    const { pdfFiles: _pdfFiles, ...jsonUserData } = userData
    return JSON.stringify(jsonUserData)
  }

  const formData = new FormData()
  Object.entries(userData).forEach(([key, value]) => {
    if (key === 'pdfFiles' || value === undefined) return
    formData.append(key, Array.isArray(value) ? JSON.stringify(value) : String(value))
  })
  userData.pdfFiles.forEach((file) => formData.append('pdfFiles', file))
  return formData
}

export function createUser(userData: UserPayload) {
  return apiClient('/auth/users', {
    method: 'POST',
    body: userPayloadBody(userData),
  })
}

export function updateUser(id: string, userData: UserPayload) {
  return apiClient(`/auth/users/${id}`, {
    method: 'PUT',
    body: userPayloadBody(userData),
  })
}

export function getPlans<T = unknown[]>() {
  return apiClient<T>('/plans')
}

export function createPlan(planData: any) {
  return apiClient('/plans', {
    method: 'POST',
    body: JSON.stringify(planData),
  })
}

export function updatePlan(id: string, planData: any) {
  return apiClient(`/plans/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(planData),
  })
}

export function deletePlan(id: string) {
  return apiClient(`/plans/${id}`, {
    method: 'DELETE',
  })
}

export interface RoutineRelation {
  id?: string
  _id?: string
  name?: string
  nombre?: string
  firstName?: string
  lastName?: string
  email?: string
}

export interface RoutineExercise {
  exerciseId: string
  targetReps?: number | null
  targetWeight?: number | null
  targetDuration?: number | null
  targetDistance?: number | null
  targetLevel?: number | null
  name?: string
  muscleGroup?: string
  equipment?: string | null
  videoUrl?: string
  isCardio?: boolean
  reps?: number | null
  weight?: number | null
  time?: number | null
}

export interface RoutineBlock {
  dayOfWeek: number
  type: 'single' | 'superset' | 'circuit'
  sets: number
  restSeconds: number
  exercises: RoutineExercise[]
  order?: number
  structure?: 'Individual' | 'Superset' | 'Circuito'
  blockSets?: number
  restTime?: number
  scheduleDays?: string[]
}

export interface RoutineDefinition {
  title: string
  objective: string
  level: string
  durationWeeks: number
  blocks: RoutineBlock[]
}

export interface RoutineTemplate extends RoutineDefinition {
  id?: string
  _id?: string
}

export interface Routine extends RoutineDefinition {
  id?: string
  _id?: string
  assignedTo?: User | RoutineRelation | string | null
  status?: string
}

export type RoutineTemplatePayload = RoutineDefinition

export interface RoutinePayload extends RoutineDefinition {
  assignedTo: string
  status?: string
}

export function getTemplates<T = RoutineTemplate[]>() {
  return apiClient<T>('/routine-templates')
}

export function createTemplate(data: RoutineTemplatePayload) {
  return apiClient('/routine-templates', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export function updateTemplate(id: string, data: RoutineTemplatePayload) {
  return apiClient(`/routine-templates/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export function deleteTemplate(id: string) {
  return apiClient(`/routine-templates/${id}`, {
    method: 'DELETE',
  })
}

export function assignTemplateToClient(templateId: string, clientId: string) {
  return apiClient(`/routine-templates/${templateId}/assign`, {
    method: 'POST',
    body: JSON.stringify({ clientId }),
  })
}

export function getRoutines<T = unknown[]>() {
  return apiClient<T>('/routines')
}

export function createRoutine(data: RoutinePayload) {
  return apiClient('/routines', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export function updateRoutine(id: string, data: RoutinePayload) {
  return apiClient(`/routines/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export function deleteRoutine(id: string) {
  return apiClient(`/routines/${id}`, {
    method: 'DELETE',
  })
}

export function getPayments<T = unknown[]>() {
  return apiClient<T>('/payments')
}

export function redeemPaymentPin(pin: string) {
  return apiClient('/payments/redeem', {
    method: 'PATCH',
    body: JSON.stringify({ pin: pin.trim() }),
  })
}

export interface PaymentRelation {
  id?: string
  _id?: string
  name?: string
  nombre?: string
}

export interface Payment {
  id?: string
  _id?: string
  user?: PaymentRelation | string
  userId?: PaymentRelation | string
  planName?: string
  plan?: PaymentRelation | string
  amount: number | string
  source?: string
  createdAt?: string
  reference?: string
  status: string
}

export function createPayment(paymentData: PaymentPayload) {
  return apiClient('/payments', {
    method: 'POST',
    body: JSON.stringify(paymentData),
  })
}

export function updatePayment(id: string, paymentData: PaymentPayload) {
  return apiClient(`/payments/${id}`, {
    method: 'PUT',
    body: JSON.stringify(paymentData),
  })
}

export interface SaleRelation {
  id?: string
  _id?: string
  name?: string
  nombre?: string
}

export interface SaleItem {
  productId: SaleRelation | string
  quantity: number
  price?: number | string
  name?: string
}

export interface Sale {
  id?: string
  _id?: string
  userId?: SaleRelation | string
  items: SaleItem[]
  totalAmount: number | string
  status: string
  createdAt?: string
  date?: string
}

export interface SalePayload {
  userId: string
  items: Array<{ productId: string; quantity: number }>
  status: string
  promotionId?: string
}

export function getSales<T = unknown[]>() {
  return apiClient<T>('/sales')
}

export function redeemSalePin(pin: string) {
  return apiClient('/sales/redeem', {
    method: 'PATCH',
    body: JSON.stringify({ pin: pin.trim() }),
  })
}

export function createSale(data: SalePayload) {
  return apiClient('/sales', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export function updateSale(id: string, data: Partial<SalePayload>) {
  const statusMap: Record<string, string> = {
    pagado: 'paid',
    pendiente: 'pending',
    cancelado: 'cancelled',
    cancelada: 'cancelled',
  }
  const normalizedData = data.status
    ? { ...data, status: statusMap[data.status.toLowerCase()] || data.status }
    : data

  return apiClient(`/sales/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(normalizedData),
  })
}

export function deletePayment(id: string) {
  return apiClient(`/payments/${id}`, {
    method: 'DELETE',
  })
}

export interface PaymentPayload {
  userId: string
  planName: string
  amount: number
  source: string
  createdAt: string
  reference: string
  status: string
}

export function getProducts<T = unknown[]>() {
  return apiClient<T>('/products')
}

export function createProduct(data: any) {
  return apiClient('/products', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export function updateProduct(id: string, data: any) {
  return apiClient(`/products/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export function deleteProduct(id: string) {
  return apiClient(`/products/${id}`, {
    method: 'DELETE',
  })
}

export interface EquipmentPayload {
  name: string
  zone: string
  brand: string
  type: string
  imageUrl?: string
  totalQuantity: number
  maintenanceQuantity: number
  status: 'available' | 'maintenance' | 'unavailable'
}

export function getEquipment<T = Equipment[]>() {
  return apiClient<T>('/equipment')
}

export function createEquipment(data: EquipmentPayload) {
  return apiClient('/equipment', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export function updateEquipment(id: string, data: EquipmentPayload) {
  return apiClient(`/equipment/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export function deleteEquipment(id: string) {
  return apiClient(`/equipment/${id}`, {
    method: 'DELETE',
  })
}

export interface Exercise {
  id?: string
  _id?: string
  name: string
  originalName?: string
  muscleGroup: string
  equipment?: string | null
  videoUrl?: string
}

export interface ExercisePayload {
  name: string
  muscleGroup: string
  equipment: string | null
  videoUrl: string | null
}

export function getExercises<T = Exercise[]>() {
  return apiClient<T>('/exercises')
}

export function createExercise(data: ExercisePayload) {
  return apiClient('/exercises', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export function updateExercise(id: string, data: ExercisePayload) {
  return apiClient(`/exercises/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export function deleteExercise(id: string) {
  return apiClient(`/exercises/${id}`, {
    method: 'DELETE',
  })
}

export function getPromotions<T = unknown[]>() {
  return apiClient<T>('/promotions')
}

export interface PromotionPayload {
  title: string
  description: string
  discountPercentage: number
  validUntil: string
  isActive: boolean
  imageUrl?: string
  applicableProducts?: string[]
}

export function createPromotion(data: PromotionPayload) {
  return apiClient('/promotions', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export function updatePromotion(id: string, data: PromotionPayload) {
  return apiClient(`/promotions/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export function deletePromotion(id: string) {
  return apiClient(`/promotions/${id}`, {
    method: 'DELETE',
  })
}

function extractArray(value: unknown, keys: string[]) {
  if (Array.isArray(value)) return value
  if (!value || typeof value !== 'object') return []

  const record = value as Record<string, unknown>
  const keyedArray = keys.map((key) => record[key]).find((item) => Array.isArray(item))
  if (Array.isArray(keyedArray)) return keyedArray

  return Object.values(record).find((item) => Array.isArray(item)) || []
}

export async function getDashboardStats(): Promise<DashboardStats> {
  try {
    const stats = await apiClient<Partial<DashboardStats>>('/analytics/dashboard')
    return {
      totalUsers: Number(stats.totalUsers) || 0,
      activePlans: Number(stats.activePlans) || 0,
      revenue: Number(stats.revenue) || 0,
      systemStatus: stats.systemStatus || 'En línea',
    }
  } catch {
    const [usersResponse, plansResponse] = await Promise.all([
      getUsers<unknown>(),
      getPlans<unknown>(),
    ])
    const users = extractArray(usersResponse, ['data', 'users'])
    const plans = extractArray(plansResponse, ['data', 'plans', 'planes'])
    const activePlans = plans.filter((plan) => {
      if (!plan || typeof plan !== 'object') return false
      return (plan as Record<string, unknown>).isActive !== false
    }).length

    return {
      totalUsers: users.length,
      activePlans,
      revenue: 0,
      systemStatus: 'En línea',
    }
  }
}

export function getInventory<T = unknown[]>() {
  return apiClient<T>('/inventory')
}

export function getStoreProducts<T = unknown[]>() {
  return apiClient<T>('/store/products')
}