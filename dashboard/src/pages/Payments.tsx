import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Ban, Banknote, Clock, Pencil, Receipt, Search, Undo2, Wallet } from 'lucide-react'
import {
  cancelPayment,
  getPayments,
  getPlans,
  getUsers,
  revertPayment,
  updatePayment,
} from '../services/api'
import type { Payment, PaymentPayload, PaymentRelation, PaymentStatus } from '../services/api'
import { socket } from '../services/socket'
import type { Plan, User } from '../types'
import { useStaffRoles } from '../utils/access'
import PageHeader from '../components/ui/PageHeader'
import Panel from '../components/ui/Panel'
import KpiCard from '../components/ui/KpiCard'
import Modal from '../components/ui/Modal'
import Badge, { type BadgeTone } from '../components/ui/Badge'
import EmptyState from '../components/ui/EmptyState'
import Segmented from '../components/ui/Segmented'
import { dangerButton, errorAlert, fieldClass, hintClass, iconButton, labelClass, primaryButton, secondaryButton, successAlert, tableHeadClass, tdClass, thClass } from '../components/ui/styles'

interface PaymentFormState {
  userId: string
  planId: string
  amount: string
  paymentDate: string
  status: PaymentStatus
}

type StatusFilter = 'all' | 'paid' | 'pending' | 'cancelled' | 'reverted'

const emptyForm: PaymentFormState = {
  userId: '',
  planId: '',
  amount: '',
  paymentDate: new Date().toISOString().slice(0, 10),
  status: 'paid',
}

function formatMoney(value: number) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(value)
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

function formatSource(source: string | undefined) {
  switch (source?.toLowerCase()) {
    case 'reception': return 'Recepción'
    case 'cash': return 'Efectivo'
    case 'card': return 'Tarjeta'
    case 'transfer': return 'Transferencia'
    default: return source || 'Sin método'
  }
}

// Older records may still carry English/Spanish labels; the API only accepts these three.
function toPaymentStatus(status: string | undefined): PaymentStatus {
  switch (status?.toLowerCase()) {
    case 'pending':
    case 'pendiente':
      return 'pending'
    case 'cancelled':
    case 'failed':
    case 'fallido':
      return 'cancelled'
    default:
      return 'paid'
  }
}

// Every label old records may carry, folded into the four states the history shows.
function statusGroup(status: string): Exclude<StatusFilter, 'all'> | 'other' {
  switch (status.toLowerCase()) {
    case 'paid':
    case 'completed':
    case 'completado':
    case 'completada':
      return 'paid'
    case 'pending':
    case 'pendiente':
      return 'pending'
    case 'cancelled':
    case 'failed':
    case 'fallido':
    case 'fallida':
      return 'cancelled'
    case 'reverted':
      return 'reverted'
    default:
      return 'other'
  }
}

const STATUS_VIEW: Record<ReturnType<typeof statusGroup>, { label: string; tone: BadgeTone }> = {
  paid: { label: 'Pagado', tone: 'success' },
  pending: { label: 'Pendiente', tone: 'warning' },
  cancelled: { label: 'Cancelado', tone: 'danger' },
  reverted: { label: 'Revertido', tone: 'neutral' },
  other: { label: '', tone: 'neutral' },
}

function formatDate(value: string | undefined) {
  return value && !Number.isNaN(new Date(value).getTime()) ? new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' }).format(new Date(value)) : 'Sin fecha'
}

// The reason dialog that replaces the browser prompt when cancelling a request or reverting a payment.
interface ReasonDialogState {
  kind: 'cancel' | 'revert'
  payment: Payment
  reason: string
  error: string | null
  isSubmitting: boolean
}

function Payments() {
  // Charging lives in Caja. Here Recepcion cancels pending requests; only Admins edit pending payments or revert paid ones.
  const canManage = useStaffRoles().has('Admin')
  const [payments, setPayments] = useState<Payment[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [plans, setPlans] = useState<Plan[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [form, setForm] = useState<PaymentFormState>(emptyForm)
  const [editingPaymentId, setEditingPaymentId] = useState('')
  // A paid payment already activated its membership, so the API keeps its plan and amount.
  const [isPaidRecord, setIsPaidRecord] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [modalError, setModalError] = useState<string | null>(null)
  const [reference, setReference] = useState('')
  const [toast, setToast] = useState<string | null>(null)
  const [reasonDialog, setReasonDialog] = useState<ReasonDialogState | null>(null)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [searchTerm, setSearchTerm] = useState('')
  // Fixed when the page opens: "this month" for the indicators.
  const [monthStart] = useState(() => { const now = new Date(); return new Date(now.getFullYear(), now.getMonth(), 1).getTime() })

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
    const refreshFromEvent = () => {
      void refreshPayments().catch((requestError: unknown) => {
        setError(requestError instanceof Error ? requestError.message : 'No se pudieron actualizar los pagos.')
      })
    }
    const events = ['payment-created', 'payment-updated', 'payment-redeemed', 'payments-updated']
    events.forEach((eventName) => socket.on(eventName, refreshFromEvent))

    return () => {
      events.forEach((eventName) => socket.off(eventName, refreshFromEvent))
    }
  }, [])

  // The confirmation fades on its own.
  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 4000)
    return () => window.clearTimeout(timer)
  }, [toast])

  function closeModal() {
    if (isSubmitting) return
    setForm(emptyForm)
    setEditingPaymentId('')
    setIsPaidRecord(false)
    setReference('')
    setModalError(null)
    setIsModalOpen(false)
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setModalError(null)
    setIsSubmitting(true)

    try {
      if (!editingPaymentId) return
      const payload: PaymentPayload = {
        userId: form.userId,
        planId: form.planId,
        amount: Number(form.amount),
        source: 'reception',
        paymentDate: form.paymentDate,
        reference: reference.trim() || undefined,
        status: form.status,
      }
      await updatePayment(editingPaymentId, payload)
      await refreshPayments()
      setError(null)
      setForm(emptyForm)
      setEditingPaymentId('')
      setIsPaidRecord(false)
      setReference('')
      setIsModalOpen(false)
      setToast('Pago actualizado')
    } catch (requestError) {
      setModalError(requestError instanceof Error ? requestError.message : 'No se pudo guardar el pago.')
    } finally {
      setIsSubmitting(false)
    }
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
      getRecordId(plan) === getRelationId(payment.planId ?? payment.plan)
      || (plan.name || plan.nombre) === paymentPlanName
    ))
    setForm({
      userId,
      planId: selectedPlan ? getRecordId(selectedPlan) : getRelationId(payment.planId ?? payment.plan),
      amount: String(payment.amount ?? 0),
      paymentDate: (payment.paymentDate || payment.createdAt || new Date().toISOString()).slice(0, 10),
      status: toPaymentStatus(payment.status),
    })
    setReference(payment.reference || '')
    setEditingPaymentId(paymentId)
    setIsPaidRecord(toPaymentStatus(payment.status) === 'paid')
    setModalError(null)
    setIsModalOpen(true)
  }

  function openReasonDialog(kind: ReasonDialogState['kind'], payment: Payment) {
    if (!getRecordId(payment)) return
    setReasonDialog({ kind, payment, reason: '', error: null, isSubmitting: false })
  }

  function closeReasonDialog() {
    if (reasonDialog?.isSubmitting) return
    setReasonDialog(null)
  }

  // A pending request is cancelled (its PIN stops working). A paid payment is reverted, never deleted: the membership
  // loses the time it still gave and the record stays in the history.
  async function confirmReason(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!reasonDialog) return
    const { kind, payment } = reasonDialog
    const reason = reasonDialog.reason.trim()
    if (kind === 'revert' && reason.length < 3) {
      setReasonDialog({ ...reasonDialog, error: 'Escribe un motivo de al menos 3 caracteres para revertir el pago.' })
      return
    }
    if (kind === 'cancel' && reason && reason.length < 3) {
      setReasonDialog({ ...reasonDialog, error: 'El motivo debe tener al menos 3 caracteres.' })
      return
    }
    setReasonDialog({ ...reasonDialog, error: null, isSubmitting: true })
    try {
      const paymentId = getRecordId(payment)
      if (kind === 'cancel') await cancelPayment(paymentId, reason || undefined)
      else await revertPayment(paymentId, reason)
      await refreshPayments()
      setError(null)
      setReasonDialog(null)
      setToast(kind === 'cancel' ? 'Solicitud cancelada' : 'Pago revertido')
    } catch (requestError) {
      const fallback = kind === 'cancel' ? 'No se pudo cancelar el pago.' : 'No se pudo revertir el pago.'
      setReasonDialog((current) => current && { ...current, isSubmitting: false, error: requestError instanceof Error ? requestError.message : fallback })
    }
  }

  // One view model per payment, shared by the table and the phone cards.
  const rows = payments.map((payment, index) => {
    const user = payment.userId || payment.user
    const userId = getRelationId(user)
    const populatedUserName = typeof user === 'object' ? user.name || user.nombre : undefined
    const userName = populatedUserName || users.find((candidate) => getRecordId(candidate) === userId)?.name || 'Sin asignar'
    const planName = getPaymentPlanName(payment)
    const resolvedPlanName = plans.find((candidate) =>
      getRecordId(candidate) === getRelationId(payment.plan)
      || (candidate.name || candidate.nombre) === planName,
    )?.name || plans.find((candidate) => (candidate.name || candidate.nombre) === planName)?.nombre
    const status = payment.status || 'Sin estado'
    const group = statusGroup(status)
    return {
      payment,
      key: getRecordId(payment) || `payment-${index}`,
      userName,
      planName: resolvedPlanName || planName || 'Sin plan',
      amount: Number(payment.amount) || 0,
      discount: Number(payment.discountApplied) || 0,
      group,
      statusLabel: STATUS_VIEW[group].label || status,
      isPending: group === 'pending',
      isPaid: status.toLowerCase() === 'paid',
      closedReason: payment.reversal?.reason ?? payment.cancelReason,
    }
  })

  const search = searchTerm.trim().toLocaleLowerCase()
  const visibleRows = rows.filter((row) => (statusFilter === 'all' || row.group === statusFilter)
    && (!search || `${row.userName} ${row.planName} ${row.payment.reference ?? ''}`.toLocaleLowerCase().includes(search)))
  const countFor = (filter: StatusFilter) => filter === 'all' ? rows.length : rows.filter((row) => row.group === filter).length
  const paidThisMonth = rows.filter((row) => row.group === 'paid' && new Date(row.payment.paymentDate || row.payment.createdAt || 0).getTime() >= monthStart)
  const pendingRows = rows.filter((row) => row.isPending)
  const closedCount = countFor('cancelled') + countFor('reverted')
  const filterOptions = ([['all', 'Todos'], ['paid', 'Pagados'], ['pending', 'Pendientes'], ['cancelled', 'Cancelados'], ['reverted', 'Revertidos']] as const)
    .map(([value, label]) => [value, `${label} ${countFor(value)}`] as const)

  const rowActions = (row: (typeof rows)[number]) => (
    <div className="flex items-center justify-end gap-1">
      {row.isPending && canManage && (
        <button className={`${iconButton} hover:text-brand-text`} type="button" aria-label="Editar pago pendiente" title="Editar solicitud pendiente" onClick={() => handleEditPayment(row.payment)}>
          <Pencil size={16} aria-hidden />
        </button>
      )}
      {row.isPending && (
        <button className={`${iconButton} hover:bg-red-50 hover:text-red-600`} type="button" aria-label="Cancelar solicitud" title="Cancelar solicitud" onClick={() => openReasonDialog('cancel', row.payment)}>
          <Ban size={16} aria-hidden />
        </button>
      )}
      {row.isPaid && canManage && (
        <button className={`${iconButton} hover:bg-red-50 hover:text-red-600`} type="button" aria-label="Revertir pago" title="Revertir pago" onClick={() => openReasonDialog('revert', row.payment)}>
          <Undo2 size={16} aria-hidden />
        </button>
      )}
    </div>
  )

  const rowNote = (row: (typeof rows)[number]) => {
    if (row.isPending) return 'Se cobra en Caja con el PIN del cliente'
    if (!row.isPaid && row.closedReason) return `Motivo: ${row.closedReason}`
    return null
  }

  return (
    <section className="min-h-screen bg-canvas px-4 py-8 sm:px-8 sm:py-10">
      <PageHeader
        eyebrow="Comercial"
        title="Pagos"
        description="Historial de pagos de membresía. Los cobros se hacen en Caja."
        actions={<Link className={primaryButton} to="/caja"><Wallet size={18} aria-hidden /> Ir a Caja</Link>}
      />

      {toast && <p className={`${successAlert} mt-4 animate-pop-in font-medium`} role="status">{toast}</p>}

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
        <KpiCard
          label="Cobrado este mes"
          value={formatMoney(paidThisMonth.reduce((sum, row) => sum + row.amount, 0))}
          icon={Banknote}
          tone="brand"
          isLoading={isLoading}
          hint={`${paidThisMonth.length} pago${paidThisMonth.length === 1 ? '' : 's'} de membresía`}
        />
        <KpiCard
          label="Solicitudes pendientes"
          value={pendingRows.length}
          icon={Clock}
          tone={pendingRows.length > 0 ? 'warning' : 'default'}
          isLoading={isLoading}
          hint={pendingRows.length > 0 ? `${formatMoney(pendingRows.reduce((sum, row) => sum + row.amount, 0))} por cobrar en Caja` : 'Nada por cobrar'}
        />
        <KpiCard label="Cancelados o revertidos" value={closedCount} icon={Undo2} isLoading={isLoading} hint="En todo el historial" />
      </div>

      <Panel
        className="mt-6"
        title="Historial"
        icon={Receipt}
        description={isLoading ? undefined : `${visibleRows.length} de ${rows.length} pago${rows.length === 1 ? '' : 's'}`}
      >
        {error && <p className={`${errorAlert} mb-4`} role="alert">{error}</p>}

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <label className="relative block w-full lg:max-w-xs">
            <span className="sr-only">Buscar pago</span>
            <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} aria-hidden />
            <input className={`${fieldClass} pl-10`} type="search" placeholder="Buscar socio, plan o referencia" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} />
          </label>
          <div className="-mx-1 overflow-x-auto px-1 pb-1">
            <Segmented label="Estado" value={statusFilter} options={filterOptions} onChange={setStatusFilter} />
          </div>
        </div>

        <div className="mt-4">
          {isLoading ? (
            <div className="space-y-3" aria-busy="true" aria-label="Cargando pagos">
              {Array.from({ length: 5 }).map((_, index) => <div className="skeleton h-12 w-full" key={index} />)}
            </div>
          ) : visibleRows.length === 0 ? (
            <EmptyState icon={Receipt} title={rows.length === 0 ? 'Aún no hay pagos' : 'Sin coincidencias'}>
              {rows.length === 0 ? 'Los cobros de membresía que hagas en Caja aparecerán aquí.' : 'Cambia la búsqueda o el filtro de estado.'}
            </EmptyState>
          ) : (
            <>
              <ul className="space-y-3 md:hidden">
                {visibleRows.map((row) => (
                  <li className="rounded-xl border border-slate-200 p-4" key={row.key}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-ink">{row.userName}</p>
                        <p className="truncate text-xs text-slate-500">{row.planName} · {formatDate(row.payment.createdAt)}</p>
                      </div>
                      <p className="shrink-0 font-semibold text-ink tabular">{formatMoney(row.amount)}</p>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge tone={STATUS_VIEW[row.group].tone}>{row.statusLabel}</Badge>
                        <span className="text-xs text-slate-500">{formatSource(row.payment.source)}</span>
                      </div>
                      {rowActions(row)}
                    </div>
                    {rowNote(row) && <p className="mt-2 truncate text-xs text-slate-500">{rowNote(row)}</p>}
                  </li>
                ))}
              </ul>

              <div className="-mx-5 hidden overflow-x-auto sm:-mx-6 md:block">
                <table className="min-w-full text-left text-sm">
                  <thead className={tableHeadClass}>
                    <tr>
                      <th className={thClass}>Socio</th>
                      <th className={thClass}>Plan</th>
                      <th className={`${thClass} text-right`}>Monto</th>
                      <th className={thClass}>Método</th>
                      <th className={thClass}>Fecha</th>
                      <th className={thClass}>Referencia</th>
                      <th className={thClass}>Estado</th>
                      <th className={thClass}><span className="sr-only">Acciones</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {visibleRows.map((row) => (
                      <tr className="transition-colors hover:bg-slate-50/70" key={row.key}>
                        <td className={`${tdClass} whitespace-nowrap font-semibold text-ink`}>{row.userName}</td>
                        <td className={`${tdClass} whitespace-nowrap text-slate-500`}>{row.planName}</td>
                        <td className={`${tdClass} whitespace-nowrap text-right`}>
                          <span className="font-semibold text-ink tabular">{formatMoney(row.amount)}</span>
                          {row.discount > 0 && <p className="text-xs text-brand-text">Promoción −{formatMoney(row.discount)}</p>}
                        </td>
                        <td className={`${tdClass} whitespace-nowrap text-slate-500`}>{formatSource(row.payment.source)}</td>
                        <td className={`${tdClass} whitespace-nowrap text-slate-500`}>{formatDate(row.payment.createdAt)}</td>
                        <td className={`${tdClass} whitespace-nowrap text-slate-500`}>{row.payment.reference || '—'}</td>
                        <td className={tdClass}>
                          <Badge tone={STATUS_VIEW[row.group].tone}>{row.statusLabel}</Badge>
                          {rowNote(row) && <p className="mt-1 max-w-[14rem] truncate text-xs text-slate-500" title={rowNote(row) ?? undefined}>{rowNote(row)}</p>}
                        </td>
                        <td className={tdClass}>{rowActions(row)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </Panel>

      {reasonDialog && (
        <Modal
          eyebrow="Pagos"
          title={reasonDialog.kind === 'cancel' ? 'Cancelar solicitud' : 'Revertir pago'}
          onClose={closeReasonDialog}
          size="md"
        >
          <form className="space-y-4" onSubmit={confirmReason}>
            <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
              {reasonDialog.kind === 'cancel'
                ? 'El PIN del cliente dejará de funcionar. La solicitud queda en el historial como cancelada.'
                : 'La membresía pierde el tiempo que este pago aún daba y, si fue el último pago, recupera el plan anterior. El pago queda en el historial como revertido. No se registra devolución de dinero.'}
            </p>
            <div>
              <label className={labelClass} htmlFor="payment-reason">Motivo {reasonDialog.kind === 'cancel' ? '(opcional)' : ''}</label>
              <textarea
                className={fieldClass}
                id="payment-reason"
                rows={3}
                maxLength={500}
                value={reasonDialog.reason}
                onChange={(event) => setReasonDialog({ ...reasonDialog, reason: event.target.value, error: null })}
                required={reasonDialog.kind === 'revert'}
                autoFocus
              />
            </div>
            {reasonDialog.error && <p className={errorAlert} role="alert">{reasonDialog.error}</p>}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button className={secondaryButton} type="button" onClick={closeReasonDialog} disabled={reasonDialog.isSubmitting}>Volver</button>
              <button className={dangerButton} type="submit" disabled={reasonDialog.isSubmitting}>
                {reasonDialog.isSubmitting ? 'Guardando...' : reasonDialog.kind === 'cancel' ? 'Cancelar solicitud' : 'Revertir pago'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {isModalOpen && (
        <Modal eyebrow="Pagos" title="Editar pago" onClose={closeModal}>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className={labelClass} htmlFor="payment-user">Socio</label>
              <select className={fieldClass} id="payment-user" value={form.userId} disabled required>
                <option value="">Selecciona un usuario</option>
                {users.map((user, index) => {
                  const userId = getRecordId(user) || `user-${index}`
                  return <option key={userId} value={getRecordId(user)}>{user.name || user.email}</option>
                })}
              </select>
            </div>

            <div>
              <label className={labelClass} htmlFor="payment-plan">Plan</label>
              <select className={fieldClass} id="payment-plan" value={form.planId} onChange={(event) => handlePlanChange(event.target.value)} disabled={isPaidRecord} required>
                <option value="">Selecciona un plan</option>
                {plans.map((plan, index) => {
                  const planId = getRecordId(plan) || `plan-${index}`
                  return <option key={planId} value={getRecordId(plan)}>{plan.name || plan.nombre || 'Plan sin nombre'}</option>
                })}
              </select>
              {isPaidRecord && <p className={hintClass}>El pago ya activó la membresía; para cambiar de plan registra un pago nuevo.</p>}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass} htmlFor="payment-amount">Monto</label>
                {/* The API charges the plan's price or the promotion's: an amount typed here would be refused. */}
                <input className={`${fieldClass} cursor-not-allowed bg-slate-50 text-slate-500`} id="payment-amount" type="number" min="0" step="0.01" value={form.amount} readOnly required />
                <p className={hintClass}>{isPaidRecord ? 'Monto protegido para conservar el registro.' : 'Precio del plan. Los descuentos solo se aplican con una promoción vigente.'}</p>
              </div>
              <div>
                <label className={labelClass} htmlFor="payment-source">Método de pago</label>
                <select className={fieldClass} id="payment-source" value="reception" disabled>
                  <option value="reception">Recepción</option>
                </select>
              </div>
            </div>

            <div>
              <label className={labelClass} htmlFor="payment-reference">Referencia / PIN</label>
              <input className={fieldClass} id="payment-reference" type="text" value={reference} onChange={(event) => setReference(event.target.value)} />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass} htmlFor="payment-created-at">Fecha</label>
                <input className={fieldClass} id="payment-created-at" type="date" value={form.paymentDate} onChange={(event) => setForm({ ...form, paymentDate: event.target.value })} required />
              </div>
              <div>
                <label className={labelClass} htmlFor="payment-status">Estado</label>
                <select className={fieldClass} id="payment-status" value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as PaymentStatus })} required>
                  <option value="paid">Pagado</option>
                  <option value="pending">Pendiente</option>
                  <option value="cancelled">Cancelado</option>
                </select>
              </div>
            </div>

            {modalError && <p className={errorAlert} role="alert">{modalError}</p>}

            <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
              <button className={secondaryButton} type="button" onClick={closeModal} disabled={isSubmitting}>Cancelar</button>
              <button className={primaryButton} type="submit" disabled={isSubmitting || users.length === 0 || plans.length === 0}>
                {isSubmitting ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  )
}

export default Payments
