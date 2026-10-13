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