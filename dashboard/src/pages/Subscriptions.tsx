import { useEffect, useState } from 'react'
import { MoreVertical, Pencil, Trash2 } from 'lucide-react'
import { createPlan, deletePlan, getPlans, updatePlan } from '../services/api'
import type { Plan } from '../types'

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

interface PlanFormState {
  nombre: string
  precio: string
  duracion: string
}

const emptyPlanForm: PlanFormState = {
  nombre: '',
  precio: '',
  duracion: '',
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
    })
    setSpecificationsText(plan.caracteristicas?.join(', ') || '')
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
        nombre: form.nombre.trim(),
        precio: Number(form.precio),
        duracion: Number(form.duracion),
        descripcion: `${form.nombre.trim()} - ${form.duracion} días`,
        caracteristicas: specifications,
      }

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
        <button
          className="rounded-lg bg-[#9BFF63] px-4 py-2 font-medium text-[#0F172A] transition hover:bg-[#abff7c]"
          type="button"
          onClick={openModal}
        >
          + Nuevo Plan
        </button>
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

              return (
                <article
                  className="relative rounded-2xl border border-slate-100 bg-white p-6 shadow-sm transition-shadow hover:shadow-md"
                  key={planId}
                >
                  <div className="flex items-start justify-between gap-4">
                    <h2 className="text-xl font-semibold text-slate-900">{planName}</h2>
                    <div className="relative flex items-center gap-2">
                      <span
                        className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${
                          isActive ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {isActive ? 'Activo' : 'Inactivo'}
                      </span>
                      <button
                        className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                        type="button"
                        aria-label={`Acciones de ${planName}`}
                        onClick={() => setOpenMenuId(openMenuId === planId ? null : planId)}
                      >
                        <MoreVertical size={18} />
                      </button>
                      {openMenuId === planId && (
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

                  {plan.caracteristicas && plan.caracteristicas.length > 0 && (
                    <ul className="mt-6 space-y-2 border-t border-slate-100 pt-5 text-sm text-slate-600">
                      {plan.caracteristicas.map((feature) => (
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
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
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