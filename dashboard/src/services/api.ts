import type { AssignableRole, Equipment, GymRole, User, UserRole } from '../types'
import { ALL_GYMS, getActiveGymId } from './activeGym'

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
  name?: string
  nombre?: string
  apellidos?: string
  role?: UserRole
  isPlatformAdmin?: boolean
}

export interface SessionGym {
  id: string
  name: string
  organization: { id: string; name: string }
  roles: string[]
}

export type OrganizationStatus = 'pending' | 'active' | 'rejected' | 'suspended'

// An organization that is not active yet (or anymore); the API sends it on 403 organization_* and in the session.
export interface OrganizationNotice {
  id: string
  name: string
  status: OrganizationStatus
  reason: string | null
}

// Every gym the user works in, plus the one the API uses when no gym is selected.
export interface SessionResponse {
  user: AuthUser
  organization: { id: string; name: string } | null
  gyms: SessionGym[]
  defaultGymId: string | null
  // Organizations the user owns that SIRID has not approved, or rejected or suspended.
  organizationApplications?: OrganizationNotice[]
}

export interface LoginResponse extends SessionResponse {
  token: string
}

// The API sends { error }; msg and message are kept for older responses.
interface ApiErrorPayload {
  error?: string
  msg?: string
  message?: string
}

export class ApiError extends Error {
  response: { data: unknown }
  status: number

  constructor(message: string, data: unknown, status: number) {
    super(message)
    this.name = 'ApiError'
    this.response = { data }
    this.status = status
  }
}

export function clearStoredSession() {
  localStorage.removeItem('token')
  localStorage.removeItem('userName')
  localStorage.removeItem('userData')
  localStorage.removeItem('session')
  localStorage.removeItem('activeGymId')
}

// Requests carry the selected gym unless withGym is false.
// A 401 ends the session unless sessionOn401 is 'keep', for endpoints whose 401 is about what was sent, not about the user.
export async function apiClient<T>(
  endpoint: string,
  options: RequestInit = {},
  { withGym = true, sessionOn401 = 'clear' }: { withGym?: boolean; sessionOn401?: 'clear' | 'keep' } = {},
): Promise<T> {
  const token = localStorage.getItem('token')
  const headers = new Headers(options.headers)
  const activeGymId = getActiveGymId()
  if (withGym && activeGymId && activeGymId !== ALL_GYMS) {
    headers.set('X-Gym-Id', activeGymId)
  }

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
    if (response.status === 401 && sessionOn401 === 'clear') clearStoredSession()
    throw new ApiError(data.error || data.msg || data.message || 'No se pudo completar la solicitud.', data, response.status)
  }

  return data
}

export function login(credentials: LoginCredentials) {
  return apiClient<LoginResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(credentials),
  }, { withGym: false })
}

// The organization an API error says is blocked (403 with code organization_*), or null.
export function blockedOrganization(error: unknown): OrganizationNotice | null {
  if (!(error instanceof ApiError) || error.status !== 403) return null
  const data = error.response.data as { code?: string; organization?: OrganizationNotice }
  return data.code?.startsWith('organization_') && data.organization ? data.organization : null
}

export interface OwnerSignupPayload {
  name: string
  lastName?: string
  email: string
  password: string
  phone: string
  organizationName: string
  legalName?: string
  rfc?: string
  gymName: string
  gymAddress?: string
}

export function signupOwner(payload: OwnerSignupPayload) {
  return apiClient<{ organization: { id: string; name: string; status: OrganizationStatus }; existingAccount: boolean; message: string }>(
    '/organizations/signup',
    { method: 'POST', body: JSON.stringify(payload) },
    { withGym: false, sessionOn401: 'keep' },
  )
}

export function getCurrentSession() {
  return apiClient<SessionResponse>('/auth/me', {}, { withGym: false })
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
  // Replaces the user's roles in the selected gym (`gymId` in the all-gyms view).
  roles?: AssignableRole[]
  phone?: string
  address?: string
  isActive?: boolean
  goal?: string
  experienceLevel?: string
  availableTrainingDays?: number[]
  assignedCoach?: string
  planId?: string
  observations?: string
  gymId?: string
}

export function createUser(userData: UserPayload) {
  return apiClient('/auth/users', {
    method: 'POST',
    body: JSON.stringify(userData),
  })
}

// The plain code comes back once; the API keeps only its hash.
export interface ActivationCode {
  code: string
  expiresAt: string
}

export interface ClientEnrollmentPayload {
  name: string
  lastName?: string
  email: string
  phone: string
  gymId?: string
}

// A new account brings an activation code; an existing GymGo account is linked (its holder gets a notice in the app),
// or gets a new code when it was never activated.
export interface ClientEnrollmentResult {
  user: User
  linkedExisting: boolean
  alreadyClient?: boolean
  activation: ActivationCode | null
}

// Reception registers a client who has no app yet, so a membership can be charged right away.
export function enrollClient(payload: ClientEnrollmentPayload) {
  return apiClient<ClientEnrollmentResult>('/auth/clients', { method: 'POST', body: JSON.stringify(payload) })
}

// Only while the account is not activated; the previous code stops working.
export function regenerateActivationCode(userId: string) {
  return apiClient<{ activation: ActivationCode }>(`/auth/clients/${userId}/activation-code`, { method: 'POST' })
}

export function updateUser(id: string, userData: UserPayload) {
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
    method: 'PATCH',
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
  planId?: PaymentRelation | string
  amount: number | string
  source?: string
  paymentDate?: string
  createdAt?: string
  reference?: string
  status: string
  // Set when a membership promotion priced the payment.
  promotionId?: string | null
  listPrice?: number
  discountApplied?: number
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
  gymId?: string
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

// Reports clients send from the app about broken equipment.
export type MaintenanceStatus = 'pending' | 'in_progress' | 'resolved'

export interface MaintenanceReport {
  _id: string
  gymId?: string
  equipment: { _id: string; name?: string; zone?: string; brand?: string; status?: string } | null
  reportedBy: { _id: string; name?: string; email?: string } | null
  description: string
  status: MaintenanceStatus
  adminNote?: string
  // Whether the report holds one unit of the equipment out of service.
  equipmentOutOfService?: boolean
  resolvedAt?: string
  createdAt: string
}

export function getMaintenanceReports(status?: MaintenanceStatus) {
  return apiClient<{ reports: MaintenanceReport[] }>(`/maintenance/reports${status ? `?status=${status}` : ''}`)
}

// Resolving always gives the unit back; while in progress equipmentStatus takes one unit out of service or returns it.
export function updateMaintenanceReport(id: string, data: {
  status: 'in_progress' | 'resolved'
  equipmentStatus?: 'available' | 'out_of_service'
  adminNote?: string
}) {
  return apiClient<{ report: MaintenanceReport }>(`/maintenance/reports/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
}

export function deletePayment(id: string) {
  return apiClient(`/payments/${id}`, {
    method: 'DELETE',
  })
}

export type PaymentStatus = 'paid' | 'pending' | 'cancelled'

export interface PaymentPayload {
  userId: string
  planId: string
  // Ignored by the API when promotionId is sent: it prices the plan with the promotion.
  amount: number
  promotionId?: string | null
  source: 'reception'
  paymentDate: string
  reference?: string
  status: PaymentStatus
  gymId?: string
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
  gymId?: string
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

export function getPromotions<T = unknown[]>(appliesTo?: 'store' | 'membership') {
  return apiClient<T>(appliesTo ? `/promotions?appliesTo=${appliesTo}` : '/promotions')
}

export interface MembershipQuoteOption {
  promotionId: string
  title: string
  discountPercentage: number
  requiredDocument: string | null
  validUntil: string | null
  // false: the client lacks the required document; null: no client chosen yet.
  eligible: boolean | null
  listPrice: number
  discountApplied: number
  amount: number
}

export interface MembershipQuote {
  listPrice: number
  promotions: MembershipQuoteOption[]
  best: MembershipQuoteOption | null
}

// Current membership promotions for the plan and the price with each one.
export function getPaymentQuote(planId: string, userId?: string) {
  const query = new URLSearchParams({ planId, ...(userId ? { userId } : {}) })
  return apiClient<MembershipQuote>(`/payments/quote?${query}`)
}

export interface PromotionPayload {
  title: string
  description: string
  discountPercentage: number
  validUntil?: string
  isActive: boolean
  imageUrl?: string
  appliesTo: 'store' | 'membership'
  applicableProducts?: string[]
  applicablePlans?: string[]
  requiredDocument?: 'student_id' | null
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

export function getInventory<T = unknown[]>() {
  return apiClient<T>('/inventory')
}

export function getStoreProducts<T = unknown[]>() {
  return apiClient<T>('/store/products')
}
export interface Gym {
  id: string
  name: string
  address: string
  // IANA name; the gym's days and hours (plan schedules, attendance, access log) follow it.
  timezone: string
  // Most people inside at once; null when no limit is set.
  capacity: number | null
  joinCode: string | null
}

export interface GymPayload {
  name: string
  address?: string
  timezone: string
  capacity: number | null
}

export interface AccessDevice {
  id: string
  name: string
  gymId: string
  keyPreview: string
  lastSeenAt: string | null
  revokedAt: string | null
  createdAt: string
}

export interface AccessResult {
  id?: string
  event: 'check-in' | 'check-out'
  occurredAt: string
  gymId: string
  userId: string
  userName: string
}

export interface GymLimits {
  activeGyms: number
  gymLimit: number
}

export function getGyms() {
  return apiClient<{ gyms: Gym[]; limits?: GymLimits }>('/gyms')
}

// Only the owner opens gyms, up to the limit SIRID set.
export function createGym(payload: GymPayload) {
  return apiClient<{ gym: Gym; gyms: SessionGym[] }>('/gyms', { method: 'POST', body: JSON.stringify(payload) })
}

// Owners edit every gym; managers the gyms they run.
export function updateGym(gymId: string, payload: GymPayload) {
  return apiClient<{ gym: Gym; gyms: SessionGym[] }>(`/gyms/${gymId}`, { method: 'PATCH', body: JSON.stringify(payload) })
}

export function regenerateJoinCode(gymId: string) {
  return apiClient<{ gym: Gym }>(`/gyms/${gymId}/join-code`, { method: 'POST' })
}

export function getAccessDevices() {
  return apiClient<{ devices: AccessDevice[] }>('/access-devices')
}

// The key comes back only once; the API stores its hash.
export function createAccessDevice(data: { name: string; gymId?: string }) {
  return apiClient<{ device: AccessDevice; key: string }>('/access-devices', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export function revokeAccessDevice(id: string) {
  return apiClient<{ device: AccessDevice }>(`/access-devices/${id}`, { method: 'DELETE' })
}

// Staff scanning a client's QR; gymId is required in the all-gyms view.
// The API answers 401 for an expired or invalid QR, which must not sign the receptionist out.
export function registerQrAccess(data: { qrToken: string; gymId?: string }) {
  return apiClient<{ accepted: boolean; access: AccessResult }>('/iot/access', {
    method: 'POST',
    body: JSON.stringify(data),
  }, { sessionOn401: 'keep' })
}

export type DocumentKind = 'staff' | 'client'
export type DocumentStatus = 'pending' | 'verified' | 'rejected'
export type DocumentCategory = 'cv' | 'identification' | 'fiscal' | 'certification' | 'availability' | 'evaluation' | 'student_id' | 'other'
export type DocumentAction = 'upload' | 'view' | 'download' | 'verify' | 'reject' | 'delete' | 'purge'

export interface DocumentPerson {
  id: string
  name: string
  lastName?: string
  email?: string
}

export interface GymDocument {
  id: string
  owner: DocumentPerson | string | null
  kind: DocumentKind
  category: DocumentCategory
  originalName: string
  mimeType: string
  size: number
  status: DocumentStatus
  rejectionReason: string
  validUntil: string | null
  reviewedBy: DocumentPerson | string | null
  reviewedAt: string | null
  uploadedBy: DocumentPerson | string | null
  createdAt: string
}

export interface DocumentLog {
  id: string
  action: DocumentAction
  actor: DocumentPerson | null
  owner: DocumentPerson | null
  document: { id: string; originalName: string; category: DocumentCategory; kind: DocumentKind } | null
  ip: string
  createdAt: string
}

export function getDocuments(params: { kind?: DocumentKind; status?: DocumentStatus; ownerId?: string } = {}) {
  const query = new URLSearchParams(Object.entries(params).filter(([, value]) => value) as [string, string][]).toString()
  return apiClient<{ documents: GymDocument[] }>(`/documents${query ? `?${query}` : ''}`)
}

export function uploadDocument(data: { file: File; category: DocumentCategory; ownerId: string }) {
  const formData = new FormData()
  formData.append('category', data.category)
  formData.append('ownerId', data.ownerId)
  formData.append('file', data.file)
  return apiClient<{ document: GymDocument }>('/documents', { method: 'POST', body: formData })
}

// A link to R2 that expires in a few minutes; each one is recorded in the log.
export function getDocumentUrl(id: string, download = false) {
  return apiClient<{ url: string }>(`/documents/${id}/url${download ? '?download=1' : ''}`)
}

export function reviewDocument(id: string, data: { status: 'verified' | 'rejected'; rejectionReason?: string; validUntil?: string }) {
  return apiClient<{ document: GymDocument }>(`/documents/${id}/review`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

export function deleteDocument(id: string) {
  return apiClient<{ document: GymDocument }>(`/documents/${id}`, { method: 'DELETE' })
}

export function getDocumentLogs(params: { ownerId?: string; limit?: number } = {}) {
  const query = new URLSearchParams()
  if (params.ownerId) query.set('ownerId', params.ownerId)
  if (params.limit) query.set('limit', String(params.limit))
  return apiClient<{ logs: DocumentLog[] }>(`/documents/logs${query.size ? `?${query}` : ''}`)
}

// Destroys every file of the person in R2 (an LFPDPPP request made in person); owners only. The log keeps the records.
export function purgeUserDocuments(userId: string) {
  return apiClient<{ purged: number }>(`/documents/users/${userId}/purge`, { method: 'POST' })
}

// SIRID master panel: organizations with counts only, never the people inside them.
export interface PlatformOrganization {
  id: string
  name: string
  slug: string
  legalName: string | null
  rfc: string | null
  status: OrganizationStatus
  statusReason: string | null
  gymLimit: number
  allowedTransitions: OrganizationStatus[]
  createdAt: string
  approvedAt: string | null
  owner: { name: string; lastName: string; email: string; phone: string | null } | null
  counts: { gyms: number; staff: number; clients: number; activeMemberships: number }
  gyms?: { id: string; name: string; address: string; timezone: string; isActive: boolean; createdAt: string }[]
}

export function getPlatformOrganizations(params: { status?: OrganizationStatus; search?: string } = {}) {
  const query = new URLSearchParams(Object.entries(params).filter(([, value]) => value) as [string, string][]).toString()
  return apiClient<{ organizations: PlatformOrganization[]; statusCounts: Record<OrganizationStatus, number> }>(
    `/platform/organizations${query ? `?${query}` : ''}`,
    {},
    { withGym: false },
  )
}

export function getPlatformOrganization(id: string) {
  return apiClient<{ organization: PlatformOrganization }>(`/platform/organizations/${id}`, {}, { withGym: false })
}

export function updateOrganizationStatus(id: string, payload: { status: Exclude<OrganizationStatus, 'pending'>; reason?: string }) {
  return apiClient<{ organization: PlatformOrganization }>(
    `/platform/organizations/${id}/status`,
    { method: 'PATCH', body: JSON.stringify(payload) },
    { withGym: false },
  )
}

export function updateOrganizationGymLimit(id: string, gymLimit: number) {
  return apiClient<{ organization: PlatformOrganization }>(
    `/platform/organizations/${id}`,
    { method: 'PATCH', body: JSON.stringify({ gymLimit }) },
    { withGym: false },
  )
}

// Etapa 6: a client's consent for one gym's staff to see their history from every organization.
export type HistoryShareStatus = 'pending' | 'approved' | 'rejected' | 'revoked'

export interface HistoryShare {
  id: string
  status: HistoryShareStatus
  includeSensitive: boolean
  requestedAt: string
  respondedAt: string | null
  revokedAt: string | null
  clientId: string
  clientName?: string
  gym: { id: string; name: string | null }
  organization: { id: string; name: string | null }
  requestedBy: { id: string; name: string | null } | null
}

export interface HistoryOrigin {
  organization: { id: string; name: string | null }
  gym: { id: string; name: string | null } | null
}

export interface SharedWorkout extends HistoryOrigin {
  _id: string
  routineTitle: string
  routineGoal?: string
  completedAt: string
  durationMinutes: number
  totalVolumeKg: number
  caloriesBurned?: number
  perceivedExertion?: number
  clientNotes?: string
  completedSets?: number
}

export interface SharedRoutine extends HistoryOrigin {
  id?: string
  _id?: string
  title: string
  goal?: string
  status?: string
  updatedAt?: string
}

export interface SharedHistory {
  share: HistoryShare
  client: { id: string; name: string | null }
  workouts: SharedWorkout[]
  routines: SharedRoutine[]
  sensitive: { weightKg: number | null; heightCm: number | null; restrictions: string } | null
}

export interface HistoryAccessLogEntry {
  id: string
  viewer: { id: string; name: string | null }
  client: { id: string; name: string | null }
  gym: { id: string; name: string | null }
  sections: ('workouts' | 'routines' | 'sensitive')[]
  createdAt: string
}

export function getHistoryShares(clientId?: string) {
  return apiClient<{ shares: HistoryShare[] }>(`/history-shares${clientId ? `?clientId=${clientId}` : ''}`)
}

// In the all-gyms view the gym that asks is required.
export function requestHistoryShare(payload: { clientId: string; gymId?: string }) {
  return apiClient<{ share: HistoryShare }>('/history-shares', { method: 'POST', body: JSON.stringify(payload) })
}

export function getSharedHistory(shareId: string) {
  return apiClient<SharedHistory>(`/history-shares/${shareId}/history`)
}

export function getHistoryAccessLogs(clientId?: string) {
  return apiClient<{ logs: HistoryAccessLogEntry[] }>(`/history-shares/logs${clientId ? `?clientId=${clientId}` : ''}`)
}

export type StaffInvitationStatus = 'pending' | 'accepted' | 'rejected' | 'cancelled' | 'expired'

// A gym's offer to an existing GymGo account to join its staff; it takes effect when the person accepts.
export interface StaffInvitation {
  id: string
  email: string
  roles: GymRole[]
  status: StaffInvitationStatus
  gym: { id: string; name: string | null }
  organization: { id: string; name: string | null }
  invitedBy: { id: string; name: string | null } | null
  createdAt: string
  expiresAt: string
  respondedAt: string | null
}

export function getStaffInvitations() {
  return apiClient<{ invitations: StaffInvitation[] }>('/staff-invitations')
}

// The API answers the same whether the account exists or not; `message` says so.
export function createStaffInvitation(payload: { email: string; roles: GymRole[]; gymId?: string }) {
  return apiClient<{ invitation: StaffInvitation; message: string }>('/staff-invitations', { method: 'POST', body: JSON.stringify(payload) })
}

export function cancelStaffInvitation(invitationId: string) {
  return apiClient<{ invitation: StaffInvitation }>(`/staff-invitations/${invitationId}/cancel`, { method: 'POST' })
}

// The signed-in person's own invitations, from any organization.
export function getMyStaffInvitations() {
  return apiClient<{ invitations: StaffInvitation[] }>('/staff-invitations/me', {}, { withGym: false })
}

export function respondToStaffInvitation(invitationId: string, answer: 'accept' | 'reject') {
  return apiClient<{ invitation: StaffInvitation }>(`/staff-invitations/me/${invitationId}/${answer}`, { method: 'POST' }, { withGym: false })
}

export type AnalyticsPeriod = 'day' | 'week' | 'month'

export interface ClientAnalyticsPoint {
  // HH:00 for a day, YYYY-MM-DD for a week or month.
  label: string
  durationMinutes: number
  totalVolumeKg: number
  caloriesBurned: number
}

// Staff only count the sessions the client trained with their organization.
export interface ClientAnalytics {
  clientId: string
  period: AnalyticsPeriod
  date: string
  timezone: string
  totals: { sessionCount: number; durationMinutes: number; totalVolumeKg: number; caloriesBurned: number }
  bestLift: { weightKg: number; exerciseName?: string; completedAt: string } | null
  chartData: ClientAnalyticsPoint[]
}

export function getClientAnalytics(clientId: string, params: { period: AnalyticsPeriod; date: string; timezone: string }) {
  const query = new URLSearchParams(params).toString()
  return apiClient<ClientAnalytics>(`/analytics/client/${clientId}?${query}`)
}

// Notes of the active organization; a Coach only edits those of their assigned clients.
export function updateClientObservations(clientId: string, observations: string) {
  return apiClient<{ user: { id: string; observations: string } }>(`/users/${clientId}/observations`, {
    method: 'PATCH',
    body: JSON.stringify({ observations }),
  })
}

// Days and hours are local to each gym's time zone; `timezone` is null when the visible gyms use several.
export interface OperationsDashboard {
  period: 'day' | 'week'
  timezone: string | null
  timezones: string[]
  today: { checkIns: number; checkOuts: number }
  currentOccupancy: number
  dailyAttendance: Array<{ date: string; checkIns: number; checkOuts: number }>
  hourlyDemand: Array<{ hour: number; checkIns: number }>
  peakHour: { hour: number; checkIns: number } | null
}

export function getOperationsDashboard(period: 'day' | 'week') {
  return apiClient<OperationsDashboard>(`/analytics/dashboard?period=${period}`)
}

export interface OccupancyGym {
  id: string
  name: string
  timezone: string
  capacity: number | null
  count: number
  // Newest first.
  people: Array<{ id: string; name: string; since: string }>
}

// Who is inside each visible gym right now.
export function getOccupancy() {
  return apiClient<{ generatedAt: string; gyms: OccupancyGym[] }>('/access/occupancy')
}

export type AccessLogEvent = 'check-in' | 'check-out' | 'denied'

// Socket `access:recorded`: an entry, an exit or a refused attempt at one of the user's gyms.
export interface AccessRecordedEvent {
  id: string
  event: AccessLogEvent
  occurredAt: string
  gymId: string
  userId: string
  userName: string
  reason?: { code: string; message: string }
}

export interface AccessLogEntry {
  id: string
  occurredAt: string
  event: AccessLogEvent
  // auto: the API closed a check-in left open when the client entered another gym.
  source: 'qr' | 'pin' | 'auto'
  reason: { code: string | null; message: string } | null
  gym: { id: string; name: string; timezone: string | null }
  client: { id: string; name: string; email?: string } | null
  validatedBy: string | null
  device: string | null
}

export interface AccessLogFilters {
  gymId?: string
  event?: AccessLogEvent
  // YYYY-MM-DD in each gym's local time; both ends included.
  from?: string
  to?: string
  search?: string
  page?: number
}

export function getAccessLogs(filters: AccessLogFilters) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== '') params.set(key, String(value))
  }
  return apiClient<{ page: number; pageSize: number; total: number; entries: AccessLogEntry[] }>(`/access/logs?${params}`)
}
