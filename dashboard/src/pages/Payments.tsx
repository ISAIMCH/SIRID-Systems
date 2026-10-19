import { useEffect, useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import {
  createPayment,
  deletePayment,
  getPayments,
  getPlans,
  getUsers,
  redeemPaymentPin,
  updatePayment,
} from '../services/api'
import type { Payment, PaymentPayload, PaymentRelation } from '../services/api'
import { connectSocket, disconnectSocket } from '../services/socket'
import type { Plan, User } from '../types'

interface PaymentFormState {
  userId: string
  planId: string
  amount: string
  source: string
  createdAt: string
  status: string
}

const emptyForm: PaymentFormState = {
  userId: '',
  planId: '',
  amount: '',
  source: 'reception',
  createdAt: new Date().toISOString().slice(0, 10),
  status: 'Completed',
}

function extractArray<T>(value: unknown, keys: string[]): T[] {
  if (Array.isArray(value)) return value as T[]
  if (!value || typeof value !== 'object') return []

  const record = value as Record<string, unknown>
  const candidate = keys
    .map((key) => record[key])
    .find((item) => Array.isArray(item))
    ?? Object.values(record).find((item) => Array.isArray(item))

  return Array.isArray(candidate) ? candidate as T[] : []
}

function getRecordId(record: { id?: string; _id?: string }) {
  return record.id || record._id || ''
}

function getRelationId(value: PaymentRelation | string | undefined) {
  if (typeof value === 'string') return value
  return value ? getRecordId(value) : ''
}

function getPaymentPlanName(payment: Payment) {
  if (payment.planName) return payment.planName
  if (typeof payment.plan === 'string') return payment.plan
  return payment.plan?.name || payment.plan?.nombre || ''
}

function getAssignedPlan(user: User, plans: Plan[]) {
  const membership = user.membership
  const assignedPlan = user.planId
  const assignedPlanId = getRelationId(assignedPlan) || getRelationId(membership?.planId) || getRelationId(membership?.plan)
  const assignedPlanName = (typeof assignedPlan === 'object' ? assignedPlan.name || assignedPlan.nombre : undefined)
    || (typeof membership?.plan === 'object' ? membership.plan.name || membership.plan.nombre : undefined)
    || membership?.planName

  return plans.find((plan) => (
    assignedPlanId && getRecordId(plan) === assignedPlanId
  ) || (
    assignedPlanName && (plan.name || plan.nombre) === assignedPlanName
  ))
}

function formatSource(source: string | undefined) {
  switch (source?.toLowerCase()) {
    case 'reception': return 'Recepción'
    case 'cash': return 'Efectivo'
    case 'card': return 'Tarjeta'
    case 'transfer': return 'Transferencia'
    default: return source || 'Sin método'
  }
}

function statusClasses(status: string) {
  switch (status.toLowerCase()) {
    case 'completed':
    case 'completado':
    case 'completada':
      return 'bg-green-100 text-green-800'
    case 'pending':
    case 'pendiente':
      return 'bg-yellow-100 text-yellow-800'
    case 'failed':
    case 'fallido':
    case 'fallida':
      return 'bg-red-100 text-red-800'
    default:
      return 'bg-slate-100 text-slate-600'
  }
}

function Payments() {
  const [payments, setPayments] = useState<Payment[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [plans, setPlans] = useState<Plan[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [form, setForm] = useState<PaymentFormState>(emptyForm)
  const [isEditing, setIsEditing] = useState(false)
  const [editingPaymentId, setEditingPaymentId] = useState('')
  const [hasPlan, setHasPlan] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [modalError, setModalError] = useState<string | null>(null)
  const [reference, setReference] = useState('')
  const [pin, setPin] = useState('')
  const [isRedeemingPin, setIsRedeemingPin] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  async function refreshPayments() {
    const response = await getPayments<unknown>()
    setPayments(extractArray<Payment>(response, ['data', 'payments', 'pagos']))
  }

  useEffect(() => {
    let isMounted = true

    async function loadData() {
      try {
        const [paymentsResponse, usersResponse, plansResponse] = await Promise.all([
          getPayments<unknown>(),
          getUsers<unknown>(),
          getPlans<unknown>(),
        ])
        if (!isMounted) return

        setPayments(extractArray<Payment>(paymentsResponse, ['data', 'payments', 'pagos']))
        setUsers(extractArray<User>(usersResponse, ['data', 'users']))
        setPlans(extractArray<Plan>(plansResponse, ['data', 'plans', 'planes']))
        setError(null)
      } catch (requestError) {
        if (isMounted) {
          setError(requestError instanceof Error ? requestError.message : 'No se pudieron cargar los pagos.')
        }
      } finally {
        if (isMounted) setIsLoading(false)
      }
    }

    loadData()
    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    const realtimeSocket = connectSocket()
    const refreshFromEvent = () => {
      void refreshPayments().catch((requestError: unknown) => {
        setError(requestError instanceof Error ? requestError.message : 'No se pudieron actualizar los pagos.')
      })
    }
    const events = ['payment-created', 'payment-updated', 'payment-redeemed', 'payments-updated']
    events.forEach((eventName) => realtimeSocket.on(eventName, refreshFromEvent))

    return () => {
      events.forEach((eventName) => realtimeSocket.off(eventName, refreshFromEvent))
      disconnectSocket()
    }
  }, [])

  function openCreateModal() {
    setForm(emptyForm)
    setIsEditing(false)
    setEditingPaymentId('')
    setHasPlan(false)
    setModalError(null)
    setIsModalOpen(true)
  }

  function closeModal() {
    if (isSubmitting) return
    setForm(emptyForm)
    setIsEditing(false)
    setEditingPaymentId('')
    setHasPlan(false)
    setReference('')
    setModalError(null)
    setIsModalOpen(false)
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setModalError(null)
    setIsSubmitting(true)

    try {
      const selectedPlan = plans.find((plan) => getRecordId(plan) === form.planId)
      if (!selectedPlan) throw new Error('Selecciona un plan válido.')

      const payload: PaymentPayload = {
        userId: form.userId,
        planName: selectedPlan.name || selectedPlan.nombre || '',
        amount: Number(form.amount),
        source: form.source,
        createdAt: form.createdAt,
        reference: reference.trim(),
        status: form.status,
      }
      if (isEditing && editingPaymentId) {
        await updatePayment(editingPaymentId, payload)
      } else {
        await createPayment(payload)
      }

      await refreshPayments()
      setError(null)
      setForm(emptyForm)
      setIsEditing(false)
      setEditingPaymentId('')
      setHasPlan(false)
      setReference('')
      setIsModalOpen(false)
    } catch (requestError) {
      setModalError(requestError instanceof Error ? requestError.message : 'No se pudo guardar el pago.')
    } finally {
      setIsSubmitting(false)
    }
  }

  function handleUserChange(userId: string) {
    const selectedUser = users.find((user) => getRecordId(user) === userId)
    const activePlan = selectedUser ? getAssignedPlan(selectedUser, plans) : undefined
    const activePlanPrice = activePlan?.price ?? activePlan?.precio

    setForm((current) => ({
      ...current,
      userId,
      planId: activePlan ? getRecordId(activePlan) : '',
      amount: activePlanPrice === undefined ? '0' : String(activePlanPrice),
    }))
    setHasPlan(Boolean(activePlan))
  }

  function handlePlanChange(planId: string) {
    const selectedPlan = plans.find((plan) => getRecordId(plan) === planId)
    const planPrice = selectedPlan?.price ?? selectedPlan?.precio

    setForm((current) => ({
      ...current,
      planId,
      amount: planPrice === undefined ? '' : String(planPrice),
    }))
  }

  function handleEditPayment(payment: Payment) {
    const paymentId = getRecordId(payment)
    if (!paymentId) {
      setError('No se puede editar un pago sin identificador.')
      return
    }

    const paymentUser = payment.userId || payment.user
    const userId = getRelationId(paymentUser)
    const paymentPlanName = getPaymentPlanName(payment)
    const selectedPlan = plans.find((plan) => (
      getRecordId(plan) === getRelationId(payment.plan)
      || (plan.name || plan.nombre) === paymentPlanName
    ))
    const assignedPlan = users.find((user) => getRecordId(user) === userId)

    setForm({
      userId,
      planId: selectedPlan ? getRecordId(selectedPlan) : getRelationId(payment.plan),
      amount: String(payment.amount ?? 0),
      source: payment.source || 'reception',
      createdAt: payment.createdAt ? payment.createdAt.slice(0, 10) : new Date().toISOString().slice(0, 10),
      status: payment.status || 'Completed',
    })
    setReference(payment.reference || '')
    setIsEditing(true)
    setEditingPaymentId(paymentId)
    setHasPlan(Boolean(assignedPlan && getAssignedPlan(assignedPlan, plans)))
    setModalError(null)
    setIsModalOpen(true)
  }

  async function handleRedeemPin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!pin.trim()) return
    setIsRedeemingPin(true)
    setToast(null)
    setError(null)
    try {
      await redeemPaymentPin(pin)
      await refreshPayments()
      setPin('')
      setToast('Pago cobrado y membresía activada')
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No se pudo canjear el PIN.')
    } finally {
      setIsRedeemingPin(false)
    }
  }

  async function handleDelete(payment: Payment) {
    const paymentId = getRecordId(payment)
    if (!paymentId) {
      setError('No se puede eliminar un pago sin identificador.')
      return
    }
    if (!window.confirm('¿Eliminar este pago?')) return

    try {
      await deletePayment(paymentId)
      await refreshPayments()
      setError(null)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No se pudo eliminar el pago.')
    }
  }

  return (
    <section className="min-h-screen bg-[#F8FAFC] px-8 py-10">
      <p className="text-sm font-medium uppercase tracking-[0.25em] text-slate-500">Comercial</p>
      <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight text-slate-900">Pagos</h1>
          <p className="mt-3 text-slate-500">Consulta y administra los pagos registrados.</p>
        </div>
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
          <form className="flex gap-2" onSubmit={handleRedeemPin}>
            <input
              className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-green-500 focus:ring-2 focus:ring-green-100 sm:w-52"
              type="text"
              placeholder="Código PIN Membresía"
              aria-label="Código PIN Membresía"
              value={pin}
              onChange={(event) => setPin(event.target.value)}
            />
            <button
              className="shrink-0 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:border-green-400 hover:text-green-700 disabled:cursor-not-allowed disabled:opacity-50"
              type="submit"
              disabled={isRedeemingPin || !pin.trim()}
            >
              {isRedeemingPin ? 'Canjeando...' : 'Canjear PIN'}
            </button>
          </form>
          <button
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#9BFF63] px-4 py-2 font-medium text-[#0F172A] transition hover:bg-[#abff7c]"
            type="button"
            onClick={openCreateModal}
          >
            <Plus size={18} aria-hidden="true" />
            Nuevo Pago
          </button>
        </div>
      </div>

      {toast && (
        <div className="mt-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-800" role="status">
          {toast}
        </div>
      )}

      <div className="mt-8 overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
        {error && (
          <div className="border-b border-red-100 bg-red-50 px-6 py-4 text-sm text-red-700" role="alert">
            {error}
          </div>
        )}

        {isLoading ? (
          <div className="space-y-4 p-6" aria-label="Cargando pagos" aria-busy="true">
            {Array.from({ length: 5 }).map((_, index) => (
              <div className="grid grid-cols-6 gap-6" key={index}>
                {Array.from({ length: 6 }).map((__, columnIndex) => (
                  <div className="h-4 animate-pulse rounded bg-slate-200" key={columnIndex} />
                ))}
              </div>
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-100 bg-slate-50/80 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-6 py-4 font-medium">Usuario</th>
                  <th className="px-6 py-4 font-medium">Plan</th>
                  <th className="px-6 py-4 font-medium">Monto</th>
                  <th className="px-6 py-4 font-medium">Método</th>
                  <th className="px-6 py-4 font-medium">Fecha</th>
                  <th className="px-6 py-4 font-medium">Referencia / PIN</th>
                  <th className="px-6 py-4 font-medium">Estado</th>
                  <th className="px-6 py-4 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {payments.length > 0 ? payments.map((payment, index) => {
                  const paymentId = getRecordId(payment) || `payment-${index}`
                  const user = payment.userId || payment.user
                  const userId = getRelationId(user)
                  const populatedUserName = typeof user === 'object' ? user.name || user.nombre : undefined
                  const userName = populatedUserName
                    || users.find((candidate) => getRecordId(candidate) === userId)?.name
                    || 'Sin asignar'
                  const planName = getPaymentPlanName(payment)
                  const resolvedPlanName = plans.find((candidate) =>
                    getRecordId(candidate) === getRelationId(payment.plan)
                    || (candidate.name || candidate.nombre) === planName,
                  )?.name || plans.find((candidate) =>
                    (candidate.name || candidate.nombre) === planName,
                  )?.nombre
                  const status = payment.status || 'Sin estado'
                  const isPending = ['pending', 'pendiente'].includes(status.toLowerCase())

                  return (
                    <tr className="transition-colors hover:bg-slate-50" key={paymentId}>
                      <td className="whitespace-nowrap px-6 py-4 font-medium text-slate-900">
                        {userName}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-slate-500">
                        {resolvedPlanName || planName || 'Sin plan'}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-slate-700">
                        {new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(Number(payment.amount) || 0)}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-slate-500">{formatSource(payment.source)}</td>
                      <td className="whitespace-nowrap px-6 py-4 text-slate-500">
                        {payment.createdAt && !Number.isNaN(new Date(payment.createdAt).getTime())
                          ? new Intl.DateTimeFormat('es-MX').format(new Date(payment.createdAt))
                          : 'Sin fecha'}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-slate-500">{payment.reference || 'Sin referencia'}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${statusClasses(status)}`}>
                          {status}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-right">
                        <div className="inline-flex items-center gap-3">
                          {isPending && <span className="text-xs font-medium text-slate-400">Requiere PIN</span>}
                          <button
                            className="cursor-pointer text-slate-400 transition hover:text-green-600"
                            type="button"
                            aria-label="Editar pago"
                            onClick={() => handleEditPayment(payment)}
                          >
                            <Pencil className="h-4 w-4" aria-hidden="true" />
                          </button>
                          <button
                            className="cursor-pointer text-slate-400 transition hover:text-red-600"
                            type="button"
                            aria-label="Eliminar pago"
                            onClick={() => handleDelete(payment)}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                }) : (
                  <tr>
                    <td className="px-6 py-10 text-center text-sm text-slate-500" colSpan={8}>
                      No hay pagos registrados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/50 px-4 py-8 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.2em] text-emerald-700">Comercial</p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-900">
                  {isEditing ? 'Editar pago' : 'Nuevo pago'}
                </h2>
              </div>
              <button
                className="text-2xl leading-none text-slate-400 transition hover:text-slate-700"
                type="button"
                aria-label="Cerrar modal"
                onClick={closeModal}
              >
                ×
              </button>
            </div>

            <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="payment-user">Usuario</label>
                <select
                  className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-100"
                  id="payment-user"
                  value={form.userId}
                  onChange={(event) => handleUserChange(event.target.value)}
                  disabled={isEditing}
                  required
                >
                  <option value="">Selecciona un usuario</option>
                  {users.map((user, index) => {
                    const userId = getRecordId(user) || `user-${index}`
                    return <option key={userId} value={getRecordId(user)}>{user.name || user.email}</option>
                  })}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="payment-plan">Plan</label>
                <select
                  className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-100"
                  id="payment-plan"
                  value={form.planId}
                  onChange={(event) => handlePlanChange(event.target.value)}
                  disabled={isEditing || hasPlan}
                  required
                >
                  <option value="">Selecciona un plan</option>
                  {plans.map((plan, index) => {
                    const planId = getRecordId(plan) || `plan-${index}`
                    return <option key={planId} value={getRecordId(plan)}>{plan.name || plan.nombre || 'Plan sin nombre'}</option>
                  })}
                </select>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="payment-amount">Monto</label>
                  <input
                    className={`w-full rounded-lg border border-slate-200 px-4 py-3 text-slate-900 outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-100 ${isEditing || hasPlan ? 'cursor-not-allowed bg-slate-100 text-slate-500' : 'bg-white'}`}
                    id="payment-amount"
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.amount}
                    onChange={(event) => setForm({ ...form, amount: event.target.value })}
                    readOnly={isEditing || hasPlan}
                    required
                  />
                  {(isEditing || hasPlan) && <p className="mt-1 text-xs text-slate-500">Monto protegido para conservar el registro.</p>}
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="payment-source">Método de pago</label>
                  <select
                    className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-100"
                    id="payment-source"
                    value={form.source}
                    onChange={(event) => setForm({ ...form, source: event.target.value })}
                    required
                  >
                    <option value="reception">Recepción</option>
                    <option value="cash">Efectivo</option>
                    <option value="card">Tarjeta</option>
                    <option value="transfer">Transferencia</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="payment-reference">
                  Referencia / PIN
                </label>
                <input
                  className="w-full rounded-lg border border-slate-200 px-4 py-3 text-slate-900 outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-100"
                  id="payment-reference"
                  type="text"
                  value={reference}
                  onChange={(event) => setReference(event.target.value)}
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="payment-created-at">Fecha</label>
                  <input
                    className="w-full rounded-lg border border-slate-200 px-4 py-3 text-slate-900 outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-100"
                    id="payment-created-at"
                    type="date"
                    value={form.createdAt}
                    onChange={(event) => setForm({ ...form, createdAt: event.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="payment-status">Estado</label>
                  <select
                    className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-100"
                    id="payment-status"
                    value={form.status}
                    onChange={(event) => setForm({ ...form, status: event.target.value })}
                    required
                  >
                    <option value="Completed">Completado</option>
                    <option value="Pending">Pendiente</option>
                    <option value="Failed">Fallido</option>
                  </select>
                </div>
              </div>

              {modalError && (
                <p className="border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
                  {modalError}
                </p>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  className="rounded-lg px-4 py-2 font-medium text-slate-600 transition hover:bg-slate-100 disabled:opacity-50"
                  type="button"
                  onClick={closeModal}
                  disabled={isSubmitting}
                >
                  Cancelar
                </button>
                <button
                  className="rounded-lg bg-[#9BFF63] px-4 py-2 font-medium text-[#0F172A] transition hover:bg-[#abff7c] disabled:cursor-not-allowed disabled:opacity-60"
                  type="submit"
                  disabled={isSubmitting || users.length === 0 || plans.length === 0}
                >
                  {isSubmitting ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  )
}

export default Payments