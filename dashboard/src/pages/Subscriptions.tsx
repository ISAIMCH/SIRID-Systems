import { useEffect, useState } from 'react'
import { Check, Clock, CreditCard, FileCheck, MapPin, Pencil, Plus, RefreshCw, Ticket, Trash2 } from 'lucide-react'
import { createPlan, deletePlan, getPlans, updatePlan } from '../services/api'
import { useAuth } from '../store/useAuth'
import { useIsOwner } from '../utils/access'
import { useQuickAction } from '../utils/quickAction'
import type { GymAccessScope, Plan, PlanType } from '../types'
import PageHeader from '../components/ui/PageHeader'
import Panel from '../components/ui/Panel'
import Modal from '../components/ui/Modal'
import Badge, { type BadgeTone } from '../components/ui/Badge'
import EmptyState from '../components/ui/EmptyState'
import { errorAlert, fieldClass, hintClass, iconButton, labelClass, primaryButton, secondaryButton } from '../components/ui/styles'

type PlansResponse = Plan[] | {
  data?: unknown
  plans?: unknown
  planes?: unknown
  [key: string]: unknown
}

interface PlanRules {
  accessScope: GymAccessScope
  gymIds: string[]
  hasSchedule: boolean
  startTime: string
  endTime: string
  requiredDocument: '' | 'student_id'
}

interface PlanFormState extends PlanRules {
  nombre: string
  precio: string
  duracion: string
  autoRenew: boolean
  planType: PlanType
}

const PLAN_TYPES: Record<PlanType, { label: string; tone: BadgeTone }> = {
  standard: { label: 'Estándar', tone: 'neutral' },
  student: { label: 'Estudiante', tone: 'info' },
  limited_hours: { label: 'Horario limitado', tone: 'warning' },
  single_gym: { label: 'Una sucursal', tone: 'neutral' },
  promotional: { label: 'Promocional', tone: 'brand' },
}

const anyRules: PlanRules = {
  accessScope: 'all',
  gymIds: [],
  hasSchedule: false,
  startTime: '06:00',
  endTime: '14:00',
  requiredDocument: '',
}

// Choosing a type only fills in these rules; the admin can change them and the API stores what is sent.
const PLAN_TYPE_PRESETS: Record<PlanType, PlanRules> = {
  standard: anyRules,
  student: { ...anyRules, requiredDocument: 'student_id' },
  limited_hours: { ...anyRules, hasSchedule: true },
  single_gym: { ...anyRules, accessScope: 'home' },
  promotional: anyRules,
}

const emptyPlanForm: PlanFormState = {
  nombre: '',
  precio: '',
  duracion: '',
  autoRenew: true,
  planType: 'standard',
  ...anyRules,
}

const currency = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 })

function formatPrice(price: number | string | undefined) {
  const numericPrice = Number(price)
  return Number.isFinite(numericPrice) ? currency.format(numericPrice) : 'Sin precio'
}

// Plans store days; older ones may carry a free-text period.
function durationText(duration: number | string | undefined) {
  if (duration === undefined || duration === '') return null
  const days = Number(duration)
  if (!Number.isFinite(days)) return String(duration)
  return days === 1 ? '1 día' : `${days} días`
}

function planRulesFrom(plan: Plan): PlanRules {
  return {
    accessScope: plan.gymAccess?.scope ?? 'all',
    gymIds: plan.gymAccess?.gymIds ?? [],
    hasSchedule: Boolean(plan.schedule),
    startTime: plan.schedule?.startTime ?? anyRules.startTime,
    endTime: plan.schedule?.endTime ?? anyRules.endTime,
    requiredDocument: plan.requiredDocument ?? '',
  }
}

function PlanRulesList({ plan, gymNames }: { plan: Plan; gymNames: Map<string, string> }) {
  const scope = plan.gymAccess?.scope ?? 'all'
  const gyms = scope === 'home'
    ? 'Solo la sucursal donde se vende'
    : scope === 'list'
      ? (plan.gymAccess?.gymIds ?? []).map((id) => gymNames.get(id) ?? 'Sucursal').join(', ')
      : 'Todas las sucursales'
  const schedule = plan.schedule
    ? `De ${plan.schedule.startTime} a ${plan.schedule.endTime}`
    : 'Cualquier hora'

  return (
    <ul className="space-y-1.5 text-xs text-slate-500">
      <li className="flex items-start gap-1.5"><MapPin className="mt-px shrink-0" size={14} aria-hidden />{gyms}</li>
      <li className="flex items-start gap-1.5"><Clock className="mt-px shrink-0" size={14} aria-hidden />{schedule}</li>
      {plan.autoRenew !== false && (
        <li className="flex items-start gap-1.5"><RefreshCw className="mt-px shrink-0" size={14} aria-hidden />Renovación automática</li>
      )}
      {plan.requiredDocument === 'student_id' && (
        <li className="flex items-start gap-1.5 text-sky-700"><FileCheck className="mt-px shrink-0" size={14} aria-hidden />Requiere credencial de estudiante verificada</li>
      )}
    </ul>
  )
}

async function fetchPlans() {
  const res = await getPlans<PlansResponse>()
  const plansCandidate = Array.isArray(res)
    ? res
    : res?.data || res?.plans || res?.planes || Object.values(res).find((value) => Array.isArray(value)) || []

  return Array.isArray(plansCandidate) ? (plansCandidate as Plan[]) : []
}

function Subscriptions() {
  const { organizationGyms } = useAuth()
  const gymNames = new Map(organizationGyms.map((gym) => [gym.id, gym.name]))
  // Plans are the organization's catalog: only the owner manages them; Recepcion reads them to charge them.
  const canManage = useIsOwner()
  const [plans, setPlans] = useState<Plan[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [form, setForm] = useState<PlanFormState>(emptyPlanForm)
  const [specificationsText, setSpecificationsText] = useState('')
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [modalError, setModalError] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true

    async function loadPlans() {
      try {
        const plansArray = await fetchPlans()
        if (isMounted) {
          setPlans(plansArray)
          setError(null)
        }
      } catch (requestError) {
        if (isMounted) setError(requestError instanceof Error ? requestError.message : 'No se pudieron cargar los planes.')
      } finally {
        if (isMounted) setIsLoading(false)
      }
    }

    loadPlans()
    return () => {
      isMounted = false
    }
  }, [])

  function openModal() {
    setEditingPlan(null)
    setForm(emptyPlanForm)
    setSpecificationsText('')
    setModalError(null)
    setIsModalOpen(true)
  }

  useQuickAction('nuevo', openModal, canManage)

  function closeModal() {
    if (isSubmitting) return
    setModalError(null)
    setForm(emptyPlanForm)
    setSpecificationsText('')
    setEditingPlan(null)
    setIsModalOpen(false)
  }

  function editPlan(plan: Plan) {
    const planPrice = plan.price ?? plan.precio
    const planDuration = plan.durationInDays ?? plan.duration
    setEditingPlan(plan)
    setForm({
      nombre: plan.name || plan.nombre || '',
      precio: planPrice === undefined ? '' : String(planPrice),
      duracion: planDuration === undefined ? '' : String(planDuration),
      autoRenew: plan.autoRenew ?? true,
      planType: plan.planType ?? 'standard',
      ...planRulesFrom(plan),
    })
    setSpecificationsText((plan.specifications ?? plan.caracteristicas)?.join(', ') || '')
    setModalError(null)
    setIsModalOpen(true)
  }

  async function removePlan(plan: Plan) {
    const planId = plan._id || plan.id
    if (!planId) {
      setError('No se puede eliminar un plan sin identificador.')
      return
    }
    if (!window.confirm(`¿Eliminar el plan ${plan.name || plan.nombre || 'sin nombre'}?`)) return

    try {
      await deletePlan(planId)
      setPlans(await fetchPlans())
      setError(null)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No se pudo eliminar el plan.')
    }
  }

  async function handleCreatePlan(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setModalError(null)
    setIsSubmitting(true)

    try {
      const specifications = specificationsText.split(',').map((specification) => specification.trim()).filter(Boolean)
      const payload = {
        name: form.nombre.trim(),
        price: Number(form.precio),
        durationInDays: Number(form.duracion),
        autoRenew: form.autoRenew,
        planType: form.planType,
        specifications,
        gymAccess: { scope: form.accessScope, gymIds: form.accessScope === 'list' ? form.gymIds : [] },
        schedule: form.hasSchedule ? { startTime: form.startTime, endTime: form.endTime } : null,
        requiredDocument: form.requiredDocument || null,
      }
      if (form.accessScope === 'list' && form.gymIds.length === 0) throw new Error('Elige al menos una sucursal.')
      if (form.hasSchedule && form.startTime === form.endTime) throw new Error('La hora de salida debe ser distinta a la de entrada.')

      const planId = editingPlan?._id || editingPlan?.id
      if (editingPlan && planId) {
        await updatePlan(planId, payload)
      } else {
        await createPlan(payload)
      }
      setPlans(await fetchPlans())
      setError(null)
      setForm(emptyPlanForm)
      setSpecificationsText('')
      setEditingPlan(null)
      setIsModalOpen(false)
    } catch (requestError) {
      setModalError(
        requestError instanceof Error
          ? requestError.message
          : editingPlan ? 'No se pudo actualizar el plan.' : 'No se pudo crear el plan.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  const activeCount = plans.filter((plan) => plan.isActive ?? true).length

  return (
    <section className="min-h-screen bg-canvas px-4 py-8 sm:px-8 sm:py-10">
      <PageHeader
        eyebrow="Comercial"
        title="Suscripciones"
        description={canManage ? 'Los planes de membresía que vende tu organización, su precio y sus reglas de acceso.' : 'Los planes de membresía que Caja puede cobrar.'}
        actions={canManage && (
          <button className={primaryButton} type="button" onClick={openModal}>
            <Plus size={18} aria-hidden /> Nuevo plan
          </button>
        )}
      />

      <Panel
        className="mt-6"
        title="Planes de membresía"
        icon={CreditCard}
        description={isLoading ? undefined : `${plans.length} ${plans.length === 1 ? 'plan' : 'planes'} · ${activeCount} activo${activeCount === 1 ? '' : 's'}`}
      >
        {error && <p className={`${errorAlert} mb-4`} role="alert">{error}</p>}

        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label="Cargando planes" aria-busy="true">
            {Array.from({ length: 3 }).map((_, index) => <div className="skeleton h-64 w-full rounded-card" key={index} />)}
          </div>
        ) : plans.length === 0 ? (
          <EmptyState icon={Ticket} title="Aún no hay planes">
            {canManage ? 'Crea tu primer plan de membresía para cobrarlo en Caja y en la app.' : 'Cuando el propietario cree planes aparecerán aquí.'}
          </EmptyState>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {plans.map((plan, index) => {
              const planId = plan.id || plan._id || `plan-${index}`
              const planName = plan.name || plan.nombre || 'Plan sin nombre'
              const planPrice = plan.price ?? plan.precio
              const planDuration = durationText(plan.durationInDays ?? plan.duration ?? plan.tipoCobro)
              const isActive = plan.isActive ?? true
              const planType = PLAN_TYPES[plan.planType ?? 'standard']
              const specifications = plan.specifications ?? plan.caracteristicas ?? []

              return (
                <li
                  className={`group flex flex-col rounded-card border border-slate-200 bg-white p-5 transition duration-200 hover:-translate-y-0.5 hover:shadow-lift ${isActive ? '' : 'opacity-75'}`}
                  key={planId}
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 font-semibold text-ink">{planName}</p>
                    <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                      <Badge tone={planType.tone}>{planType.label}</Badge>
                      {!isActive && <Badge>Inactivo</Badge>}
                    </div>
                  </div>

                  <p className="mt-4 flex items-baseline gap-1.5">
                    <span className="font-display text-4xl font-bold leading-none tracking-tight text-ink tabular">{formatPrice(planPrice)}</span>
                    {planDuration && <span className="text-sm text-slate-500">/ {planDuration}</span>}
                  </p>

                  {plan.descripcion && <p className="mt-3 line-clamp-2 text-sm text-slate-500">{plan.descripcion}</p>}

                  <div className="mt-4">
                    <PlanRulesList plan={plan} gymNames={gymNames} />
                  </div>

                  {specifications.length > 0 && (
                    <ul className="mt-4 space-y-1.5 border-t border-slate-100 pt-4 text-sm text-slate-600">
                      {specifications.map((feature) => (
                        <li className="flex items-start gap-2" key={feature}>
                          <Check className="mt-0.5 shrink-0 text-brand-text" size={15} aria-hidden />
                          {feature}
                        </li>
                      ))}
                    </ul>
                  )}

                  {canManage && (
                    <div className="mt-auto pt-4">
                      <div className="flex justify-end gap-1 border-t border-slate-100 pt-3">
                        <button className={`${iconButton} hover:text-brand-text`} type="button" aria-label={`Editar ${planName}`} title="Editar" onClick={() => editPlan(plan)}>
                          <Pencil size={17} aria-hidden />
                        </button>
                        <button className={`${iconButton} hover:bg-red-50 hover:text-red-600`} type="button" aria-label={`Eliminar ${planName}`} title="Eliminar" onClick={() => void removePlan(plan)}>
                          <Trash2 size={17} aria-hidden />
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </Panel>

      {isModalOpen && (
        <Modal eyebrow="Suscripciones" title={editingPlan ? 'Editar plan' : 'Nuevo plan'} onClose={closeModal} size="xl">
          <form className="space-y-5" onSubmit={handleCreatePlan}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass} htmlFor="plan-name">Nombre del plan</label>
                <input
                  className={fieldClass}
                  id="plan-name"
                  type="text"
                  value={form.nombre}
                  onChange={(event) => setForm({ ...form, nombre: event.target.value })}
                  required
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="plan-type">Tipo de plan</label>
                <select
                  className={fieldClass}
                  id="plan-type"
                  value={form.planType}
                  onChange={(event) => {
                    const planType = event.target.value as PlanType
                    setForm({ ...form, planType, ...PLAN_TYPE_PRESETS[planType] })
                  }}
                  aria-describedby="plan-type-hint"
                >
                  {Object.entries(PLAN_TYPES).map(([value, { label }]) => <option key={value} value={value}>{label}</option>)}
                </select>
                <p className={hintClass} id="plan-type-hint">Llena las reglas de acceso de abajo; puedes ajustarlas antes de guardar.</p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass} htmlFor="plan-price">Precio (MXN)</label>
                <input
                  className={fieldClass}
                  id="plan-price"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.precio}
                  onChange={(event) => setForm({ ...form, precio: event.target.value })}
                  required
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="plan-duration">Duración en días</label>
                <input
                  className={fieldClass}
                  id="plan-duration"
                  type="number"
                  min="1"
                  value={form.duracion}
                  onChange={(event) => setForm({ ...form, duracion: event.target.value })}
                  required
                />
              </div>
            </div>

            <fieldset className="space-y-4 rounded-xl border border-slate-200 p-4">
              <legend className="px-1 text-sm font-semibold text-ink">Reglas de acceso</legend>

              <div>
                <label className={labelClass} htmlFor="plan-access-scope">Sucursales</label>
                <select
                  className={fieldClass}
                  id="plan-access-scope"
                  value={form.accessScope}
                  onChange={(event) => setForm({ ...form, accessScope: event.target.value as GymAccessScope })}
                >
                  <option value="all">Todas las sucursales</option>
                  <option value="home">Solo la sucursal donde se vende</option>
                  <option value="list">Sucursales específicas</option>
                </select>
                {form.accessScope === 'list' && (
                  organizationGyms.length > 0 ? (
                    <div className="mt-3 flex max-h-40 flex-wrap gap-2 overflow-y-auto">
                      {organizationGyms.map((gym) => {
                        const isChecked = form.gymIds.includes(gym.id)
                        return (
                          <label
                            className={`inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand/40 ${isChecked ? 'border-brand-text/30 bg-brand-soft font-medium text-brand-ink' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}
                            key={gym.id}
                          >
                            <input
                              className="sr-only"
                              type="checkbox"
                              checked={isChecked}
                              onChange={(event) => setForm({
                                ...form,
                                gymIds: event.target.checked ? [...form.gymIds, gym.id] : form.gymIds.filter((id) => id !== gym.id),
                              })}
                            />
                            {isChecked && <Check size={13} aria-hidden />}
                            {gym.name}
                          </label>
                        )
                      })}
                    </div>
                  ) : (
                    <p className="mt-3 rounded-xl border border-dashed border-slate-200 px-4 py-3 text-sm text-slate-500">No hay sucursales disponibles.</p>
                  )
                )}
              </div>

              <div>
                <label className="flex items-center justify-between gap-4" htmlFor="plan-has-schedule">
                  <span className="text-sm font-medium text-slate-700">Limitar el horario de entrada</span>
                  <input
                    className="h-5 w-5 accent-brand-text"
                    id="plan-has-schedule"
                    type="checkbox"
                    checked={form.hasSchedule}
                    onChange={(event) => setForm({ ...form, hasSchedule: event.target.checked })}
                  />
                </label>
                {form.hasSchedule && (
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelClass} htmlFor="plan-start-time">Desde</label>
                      <input
                        className={fieldClass}
                        id="plan-start-time"
                        type="time"
                        value={form.startTime}
                        onChange={(event) => setForm({ ...form, startTime: event.target.value })}
                        required
                      />
                    </div>
                    <div>
                      <label className={labelClass} htmlFor="plan-end-time">Hasta</label>
                      <input
                        className={fieldClass}
                        id="plan-end-time"
                        type="time"
                        value={form.endTime}
                        onChange={(event) => setForm({ ...form, endTime: event.target.value })}
                        required
                      />
                    </div>
                    <p className="col-span-2 text-xs text-slate-500">
                      Hora local de cada sucursal. Si la hora de salida es menor que la de entrada, el horario cruza la medianoche. La salida del gimnasio siempre se permite.
                    </p>
                  </div>
                )}
              </div>

              <div>
                <label className={labelClass} htmlFor="plan-required-document">Documento requerido</label>
                <select
                  className={fieldClass}
                  id="plan-required-document"
                  value={form.requiredDocument}
                  onChange={(event) => setForm({ ...form, requiredDocument: event.target.value as PlanRules['requiredDocument'] })}
                >
                  <option value="">Ninguno</option>
                  <option value="student_id">Credencial de estudiante</option>
                </select>
                {form.requiredDocument && (
                  <p className={hintClass}>Se puede vender sin el documento; el acceso se niega hasta que esté verificado y vigente.</p>
                )}
              </div>
            </fieldset>

            <div>
              <label className={labelClass} htmlFor="plan-specifications">Especificaciones</label>
              <textarea
                className={`${fieldClass} min-h-24 resize-y`}
                id="plan-specifications"
                value={specificationsText}
                onChange={(event) => setSpecificationsText(event.target.value)}
                placeholder="Acceso 24/7, Regaderas, App"
                rows={3}
                aria-describedby="plan-specifications-hint"
              />
              <p className={hintClass} id="plan-specifications-hint">Separadas por comas. Se muestran en la tarjeta del plan.</p>
            </div>

            <label className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 px-4 py-3" htmlFor="plan-auto-renew">
              <span className="text-sm font-medium text-ink">Renovación automática</span>
              <input
                className="h-5 w-5 accent-brand-text"
                id="plan-auto-renew"
                type="checkbox"
                checked={form.autoRenew}
                onChange={(event) => setForm({ ...form, autoRenew: event.target.checked })}
              />
            </label>

            {modalError && <p className={errorAlert} role="alert">{modalError}</p>}

            <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
              <button className={secondaryButton} type="button" onClick={closeModal} disabled={isSubmitting}>Cancelar</button>
              <button className={primaryButton} type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Guardando...' : editingPlan ? 'Guardar cambios' : 'Crear plan'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  )
}

export default Subscriptions
