import { useEffect, useState } from 'react'
import { Clock, FileCheck, MapPin, MoreVertical, Pencil, Trash2 } from 'lucide-react'
import { createPlan, deletePlan, getPlans, updatePlan } from '../services/api'
import { useAuth } from '../store/useAuth'
import { useStaffRoles } from '../utils/access'
import type { GymAccessScope, Plan, PlanType } from '../types'

type PlansResponse = Plan[] | {
  data?: unknown
  plans?: unknown
  planes?: unknown
  [key: string]: unknown
}

function PlanSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3" aria-label="Cargando planes" aria-busy="true">
      {Array.from({ length: 3 }).map((_, index) => (
        <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm" key={index}>
          <div className="h-5 w-2/5 animate-pulse rounded bg-slate-200" />
          <div className="mt-6 h-10 w-3/5 animate-pulse rounded bg-slate-200" />
          <div className="mt-5 h-4 w-full animate-pulse rounded bg-slate-200" />
          <div className="mt-3 h-4 w-4/5 animate-pulse rounded bg-slate-200" />
        </div>
      ))}
    </div>
  )
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

const PLAN_TYPE_LABELS: Record<PlanType, string> = {
  standard: 'Estándar',
  student: 'Estudiante',
  limited_hours: 'Horario limitado',
  single_gym: 'Una sucursal',
  promotional: 'Promocional',
}

const PLAN_TYPE_BADGES: Record<PlanType, string> = {
  standard: 'bg-slate-100 text-slate-600',
  student: 'bg-sky-100 text-sky-800',
  limited_hours: 'bg-violet-100 text-violet-800',
  single_gym: 'bg-emerald-100 text-emerald-800',
  promotional: 'bg-amber-100 text-amber-800',
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

const fieldClassName = 'w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-100'

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
    <ul className="mt-5 space-y-2 text-sm text-slate-600">
      <li className="flex items-start gap-2"><MapPin className="mt-0.5 shrink-0 text-slate-400" size={16} aria-hidden="true" />{gyms}</li>
      <li className="flex items-start gap-2"><Clock className="mt-0.5 shrink-0 text-slate-400" size={16} aria-hidden="true" />{schedule}</li>
      {plan.requiredDocument === 'student_id' && (
        <li className="flex items-start gap-2"><FileCheck className="mt-0.5 shrink-0 text-slate-400" size={16} aria-hidden="true" />Requiere credencial de estudiante verificada</li>
      )}
    </ul>
  )
}

async function fetchPlans() {
  const res = await getPlans<PlansResponse>()
  console.log('Raw API Response:', res)
  const plansCandidate = Array.isArray(res)
    ? res
    : res?.data || res?.plans || res?.planes || Object.values(res).find((value) => Array.isArray(value)) || []

  return Array.isArray(plansCandidate) ? (plansCandidate as Plan[]) : []
}

function Subscriptions() {
  const { organizationGyms } = useAuth()
  const gymNames = new Map(organizationGyms.map((gym) => [gym.id, gym.name]))
  // Recepcion reads plans to charge them; only Admins manage them.
  const canManage = useStaffRoles().has('Admin')
  const [plans, setPlans] = useState<Plan[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [form, setForm] = useState<PlanFormState>(emptyPlanForm)
  const [specificationsText, setSpecificationsText] = useState('')
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
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
        if (isMounted) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : 'No se pudieron cargar los planes.',
          )
        }
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
    setOpenMenuId(null)
    setIsModalOpen(true)
  }

  async function removePlan(plan: Plan) {
    const planId = plan._id || plan.id
    if (!planId) {
      setError('No se puede eliminar un plan sin identificador.')
      return
    }
    if (!window.confirm('¿Estás seguro de eliminar este plan?')) return

    try {
      await deletePlan(planId)
      setPlans(await fetchPlans())
      setError(null)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No se pudo eliminar el plan.')
    } finally {
      setOpenMenuId(null)
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
      const refreshedPlans = await fetchPlans()
      setPlans(refreshedPlans)
      setError(null)
      setForm(emptyPlanForm)
      setSpecificationsText('')
      setEditingPlan(null)
      setIsModalOpen(false)
    } catch (requestError) {
      setModalError(
        requestError instanceof Error
          ? requestError.message
          : editingPlan
            ? 'No se pudo actualizar el plan.'
            : 'No se pudo crear el plan.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  const formatPrice = (price: number | string | undefined) => {
    const numericPrice = Number(price)
    if (!Number.isFinite(numericPrice)) return 'Precio no disponible'

    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
      maximumFractionDigits: 0,
    }).format(numericPrice)
  }

  return (
    <section className="min-h-screen bg-[#F8FAFC] px-8 py-10">
      <p className="text-sm font-medium uppercase tracking-[0.25em] text-slate-500">Facturación</p>
      <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight text-slate-900">Suscripciones</h1>
          <p className="mt-3 text-slate-500">Supervisa los planes y suscripciones activas.</p>
        </div>
        {canManage && (
          <button
            className="rounded-lg bg-[#9BFF63] px-4 py-2 font-medium text-[#0F172A] transition hover:bg-[#abff7c]"
            type="button"
            onClick={openModal}
          >
            + Nuevo Plan
          </button>
        )}
      </div>

      <div className="mt-8">
        {error && (
          <div className="mb-6 border border-red-100 bg-red-50 px-6 py-4 text-sm text-red-700" role="alert">
            {error}
          </div>
        )}

        {isLoading ? (
          <PlanSkeleton />
        ) : plans.length > 0 ? (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {plans.map((plan, index) => {
              const planId = plan.id || plan._id || `plan-${index}`
              const planName = plan.name || plan.nombre || 'Plan sin nombre'
              const planPrice = plan.price ?? plan.precio
              const planDuration = plan.durationInDays ?? plan.duration ?? plan.tipoCobro
              const isActive = plan.isActive ?? true
              const planType = plan.planType ?? 'standard'
              const specifications = plan.specifications ?? plan.caracteristicas ?? []

              return (
                <article
                  className="relative rounded-2xl border border-slate-100 bg-white p-6 shadow-sm transition-shadow hover:shadow-md"
                  key={planId}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <h2 className="text-xl font-semibold text-slate-900">{planName}</h2>
                      <span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${PLAN_TYPE_BADGES[planType]}`}>
                        {PLAN_TYPE_LABELS[planType]}
                      </span>
                    </div>
                    <div className="relative flex items-center gap-2">
                      <span
                        className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${
                          isActive ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {isActive ? 'Activo' : 'Inactivo'}
                      </span>
                      {canManage && (
                        <button
                          className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                          type="button"
                          aria-label={`Acciones de ${planName}`}
                          onClick={() => setOpenMenuId(openMenuId === planId ? null : planId)}
                        >
                          <MoreVertical size={18} />
                        </button>
                      )}
                      {canManage && openMenuId === planId && (
                        <div className="absolute right-0 top-9 z-10 w-36 rounded-lg border border-slate-100 bg-white py-1 shadow-lg">
                          <button
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                            type="button"
                            onClick={() => editPlan(plan)}
                          >
                            <Pencil size={15} />
                            Editar
                          </button>
                          <button
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                            type="button"
                            onClick={() => removePlan(plan)}
                          >
                            <Trash2 size={15} />
                            Eliminar
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  <p className="mt-7 text-4xl font-semibold tracking-tight text-slate-900">
                    {formatPrice(planPrice)}
                  </p>
                  {planDuration && <p className="mt-2 text-sm text-slate-500">{planDuration}</p>}

                  {plan.descripcion && <p className="mt-5 text-sm leading-6 text-slate-500">{plan.descripcion}</p>}

                  <PlanRulesList plan={plan} gymNames={gymNames} />

                  {specifications.length > 0 && (
                    <ul className="mt-6 space-y-2 border-t border-slate-100 pt-5 text-sm text-slate-600">
                      {specifications.map((feature) => (
                        <li key={feature}>{feature}</li>
                      ))}
                    </ul>
                  )}
                </article>
              )
            })}
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-100 bg-white px-6 py-12 text-center text-sm text-slate-500 shadow-sm">
            No hay planes disponibles para mostrar.
          </div>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.2em] text-emerald-700">Suscripciones</p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-900">
                  {editingPlan ? 'Editar Plan' : 'Nuevo plan'}
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

            <form className="mt-6 space-y-5" onSubmit={handleCreatePlan}>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="plan-name">
                  Nombre del Plan
                </label>
                <input
                  className="w-full rounded-lg border border-slate-200 px-4 py-3 text-slate-900 outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-100"
                  id="plan-name"
                  type="text"
                  value={form.nombre}
                  onChange={(event) => setForm({ ...form, nombre: event.target.value })}
                  required
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="plan-type">
                  Tipo de Plan
                </label>
                <select
                  className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-100"
                  id="plan-type"
                  value={form.planType}
                  onChange={(event) => {
                    const planType = event.target.value as PlanType
                    setForm({ ...form, planType, ...PLAN_TYPE_PRESETS[planType] })
                  }}
                >
                  {Object.entries(PLAN_TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                <p className="mt-2 text-xs text-slate-500">
                  El tipo llena las reglas de acceso de abajo; puedes ajustarlas antes de guardar.
                </p>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="plan-price">
                  Precio
                </label>
                <input
                  className="w-full rounded-lg border border-slate-200 px-4 py-3 text-slate-900 outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-100"
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
                <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="plan-duration">
                  Duración en días
                </label>
                <input
                  className="w-full rounded-lg border border-slate-200 px-4 py-3 text-slate-900 outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-100"
                  id="plan-duration"
                  type="number"
                  min="1"
                  value={form.duracion}
                  onChange={(event) => setForm({ ...form, duracion: event.target.value })}
                  required
                />
              </div>

              <fieldset className="space-y-4 rounded-xl border border-slate-200 p-4">
                <legend className="px-1 text-sm font-semibold text-slate-900">Reglas de acceso</legend>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="plan-access-scope">
                    Sucursales
                  </label>
                  <select
                    className={fieldClassName}
                    id="plan-access-scope"
                    value={form.accessScope}
                    onChange={(event) => setForm({ ...form, accessScope: event.target.value as GymAccessScope })}
                  >
                    <option value="all">Todas las sucursales</option>
                    <option value="home">Solo la sucursal donde se vende</option>
                    <option value="list">Sucursales específicas</option>
                  </select>
                  {form.accessScope === 'list' && (
                    <div className="mt-3 max-h-40 space-y-2 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-3">
                      {organizationGyms.length > 0 ? organizationGyms.map((gym) => (
                        <label className="flex items-center gap-3 rounded-md bg-white px-3 py-2 text-sm text-slate-700" key={gym.id}>
                          <input
                            className="h-4 w-4 accent-green-500"
                            type="checkbox"
                            checked={form.gymIds.includes(gym.id)}
                            onChange={(event) => setForm({
                              ...form,
                              gymIds: event.target.checked ? [...form.gymIds, gym.id] : form.gymIds.filter((id) => id !== gym.id),
                            })}
                          />
                          {gym.name}
                        </label>
                      )) : (
                        <p className="text-sm text-slate-500">No hay sucursales disponibles.</p>
                      )}
                    </div>
                  )}
                </div>

                <div>
                  <label className="flex items-center gap-3 text-sm font-medium text-slate-700" htmlFor="plan-has-schedule">
                    <input
                      className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                      id="plan-has-schedule"
                      type="checkbox"
                      checked={form.hasSchedule}
                      onChange={(event) => setForm({ ...form, hasSchedule: event.target.checked })}
                    />
                    Limitar el horario de entrada
                  </label>
                  {form.hasSchedule && (
                    <div className="mt-3 grid grid-cols-2 gap-3">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor="plan-start-time">Desde</label>
                        <input
                          className={fieldClassName}
                          id="plan-start-time"
                          type="time"
                          value={form.startTime}
                          onChange={(event) => setForm({ ...form, startTime: event.target.value })}
                          required
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor="plan-end-time">Hasta</label>
                        <input
                          className={fieldClassName}
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
                  <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="plan-required-document">
                    Documento requerido
                  </label>
                  <select
                    className={fieldClassName}
                    id="plan-required-document"
                    value={form.requiredDocument}
                    onChange={(event) => setForm({ ...form, requiredDocument: event.target.value as PlanRules['requiredDocument'] })}
                  >
                    <option value="">Ninguno</option>
                    <option value="student_id">Credencial de estudiante</option>
                  </select>
                  {form.requiredDocument && (
                    <p className="mt-2 text-xs text-slate-500">
                      Se puede vender sin el documento; el acceso se niega hasta que esté verificado y vigente.
                    </p>
                  )}
                </div>
              </fieldset>

              <label className="flex items-center gap-3 text-sm font-medium text-slate-700" htmlFor="plan-auto-renew">
                <input
                  className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  id="plan-auto-renew"
                  type="checkbox"
                  checked={form.autoRenew}
                  onChange={(event) => setForm({ ...form, autoRenew: event.target.checked })}
                />
                Renovación Automática
              </label>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="plan-specifications">
                  Especificaciones
                </label>
                <textarea
                  className="min-h-24 w-full resize-y rounded-lg border border-slate-200 px-4 py-3 text-slate-900 outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-100"
                  id="plan-specifications"
                  value={specificationsText}
                  onChange={(event) => setSpecificationsText(event.target.value)}
                  placeholder="Acceso 24/7, Regaderas, App"
                  rows={3}
                />
                <p className="mt-2 text-xs text-slate-500">
                  Separadas por comas (ej. Acceso 24/7, Regaderas, App)
                </p>
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
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Guardando...' : editingPlan ? 'Actualizar' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  )
}

export default Subscriptions