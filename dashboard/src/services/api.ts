import type { Equipment, EquipmentStatus } from '../types'

const API_BASE_URL = import.meta.env.VITE_GYMGO_API_URL

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

export async function apiClient<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const token = localStorage.getItem('token')
  const headers = new Headers(options.headers)

  if (options.body && !headers.has('Content-Type')) {
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
    throw new Error(data.msg || data.message || 'No se pudo completar la solicitud.')
  }

  return data
}

export function login(credentials: LoginCredentials) {
  return apiClient<LoginResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(credentials),
  })
}

export function getUsers<T = AuthUser[]>() {
  return apiClient<T>('/auth/users')
}

export function createUser(userData: any) {
  return apiClient('/auth/users', {
    method: 'POST',
    body: JSON.stringify(userData),
  })
}

export function updateUser(id: string, userData: any) {
  return apiClient(`/auth/users/${id}`, {
    method: 'PUT',
    body: JSON.stringify(userData),
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

export function getPayments<T = unknown[]>() {
  return apiClient<T>('/payments')
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
}

export function getSales<T = unknown[]>() {
  return apiClient<T>('/sales')
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
  totalQuantity: number
  maintenanceQuantity: number
  status: EquipmentStatus
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

export function getPromotions<T = unknown[]>() {
  return apiClient<T>('/promotions')
}

export function createPromotion(data: any) {
  return apiClient('/promotions', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export function updatePromotion(id: string, data: any) {
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