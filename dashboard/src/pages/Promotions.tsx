import { useEffect, useState } from 'react'
import { Pencil, Plus, Tag, Trash2 } from 'lucide-react'
import { createPromotion, deletePromotion, getPlans, getProducts, getPromotions, updatePromotion } from '../services/api'
import type { Plan, Product, Promotion, PromotionTarget } from '../types'
import { useStaffRoles } from '../utils/access'
import { isValidImageValue } from '../utils/imageValidation'

type PromotionsResponse = Promotion[] | { data?: unknown; promotions?: unknown }
type ProductsResponse = Product[] | { data?: unknown; products?: unknown }
type PlansResponse = Plan[] | { data?: unknown; plans?: unknown }

interface PromotionFormState {
  title: string
  description: string
  discountPercentage: string
  validUntil: string
  isActive: boolean
  imageUrl: string
  appliesTo: PromotionTarget
  applicableProducts: string[]
  applicablePlans: string[]
}

const emptyPromotionForm: PromotionFormState = {
  title: '',
  description: '',
  discountPercentage: '',
  validUntil: '',
  isActive: true,
  imageUrl: '',
  appliesTo: 'store',
  applicableProducts: [],
  applicablePlans: [],
}

const TARGET_LABELS: Record<PromotionTarget, string> = {
  store: 'Productos de tienda',
  membership: 'Planes de membresía',
}

async function fetchPromotions() {
  const response = await getPromotions<PromotionsResponse>()
  const promotionsCandidate = Array.isArray(response)
    ? response
    : response?.data || response?.promotions || []

  return Array.isArray(promotionsCandidate) ? promotionsCandidate as Promotion[] : []
}

async function fetchPlans() {
  const response = await getPlans<PlansResponse>()
  const plansCandidate = Array.isArray(response) ? response : response?.data || response?.plans || []
  return Array.isArray(plansCandidate) ? plansCandidate as Plan[] : []
}

// The API returns ids, or documents when populated.
function toIds(values: unknown[] = []) {
  return values.map((value) => {
    if (typeof value === 'object' && value !== null) {
      const populated = value as { _id?: string; id?: string }
      return String(populated._id || populated.id || '')
    }
    return String(value)
  }).filter(Boolean)
}

async function fetchProducts() {
  const response = await getProducts<ProductsResponse>()
  const productsCandidate = Array.isArray(response)
    ? response
    : response?.data || response?.products || []

  return Array.isArray(productsCandidate) ? productsCandidate as Product[] : []
}

function formatDate(value?: string) {
  if (!value) return 'Sin fecha'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Fecha no válida'
  return date.toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function toDateInputValue(value?: string) {
  return value ? value.slice(0, 10) : ''
}

function PromotionSkeleton() {
  return (
    <div className="space-y-4 p-6" aria-label="Cargando promociones" aria-busy="true">
      {Array.from({ length: 5 }).map((_, index) => (
        <div className="grid grid-cols-6 gap-6" key={index}>
          {Array.from({ length: 6 }).map((__, columnIndex) => (
            <div className="h-4 animate-pulse rounded bg-slate-200" key={columnIndex} />
          ))}
        </div>
      ))}
    </div>
  )
}

function Promotions() {
  // Recepcion reads promotions to apply them in sales; only Admins manage them.
  const canManage = useStaffRoles().has('Admin')
  const [promotions, setPromotions] = useState<Promotion[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [plans, setPlans] = useState<Plan[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingPromotion, setEditingPromotion] = useState<Promotion | null>(null)
  const [form, setForm] = useState<PromotionFormState>(emptyPromotionForm)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [modalError, setModalError] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true

    async function loadPromotions() {
      try {
        const promotionsArray = await fetchPromotions()
        if (isMounted) {
          setPromotions(promotionsArray)
          setError(null)
        }
      } catch (requestError) {
        if (isMounted) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : 'No se pudieron cargar las promociones.',
          )
        }
      } finally {
        if (isMounted) setIsLoading(false)
      }
    }

    loadPromotions()
    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    let isMounted = true

    async function loadCatalog() {
      try {
        const [productsArray, plansArray] = await Promise.all([fetchProducts(), fetchPlans()])
        if (isMounted) {
          setProducts(productsArray)
          setPlans(plansArray)
        }
      } catch (requestError) {
        if (isMounted) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : 'No se pudieron cargar los productos y planes.',
          )
        }
      }
    }

    loadCatalog()
    return () => {
      isMounted = false
    }
  }, [])

  function openCreateModal() {
    setEditingPromotion(null)
    setForm(emptyPromotionForm)
    setModalError(null)
    setIsModalOpen(true)
  }

  function openEditModal(promotion: Promotion) {
    setEditingPromotion(promotion)
    setForm({
      title: promotion.title || '',
      description: promotion.description || '',
      discountPercentage: String(promotion.discountPercentage ?? ''),
      validUntil: toDateInputValue(promotion.validUntil),
      isActive: promotion.isActive,
      imageUrl: promotion.imageUrl || '',
      appliesTo: promotion.appliesTo ?? 'store',
      applicableProducts: toIds(promotion.applicableProducts),
      applicablePlans: toIds(promotion.applicablePlans),
    })
    setModalError(null)
    setIsModalOpen(true)
  }

  function closeModal() {
    if (isSubmitting) return
    setEditingPromotion(null)
    setForm(emptyPromotionForm)
    setModalError(null)
    setIsModalOpen(false)
  }

  function handleImageChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setForm((currentForm) => ({ ...currentForm, imageUrl: reader.result as string }))
      } else {
        setModalError('No se pudo leer la imagen seleccionada.')
      }
    }
    reader.onerror = () => setModalError('No se pudo leer la imagen seleccionada.')
    reader.readAsDataURL(file)
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setModalError(null)
    setIsSubmitting(true)

    try {
      const imageUrl = form.imageUrl.trim()
      const payload = {
        title: form.title.trim(),
        description: form.description.trim(),
        discountPercentage: Number(form.discountPercentage),
        isActive: form.isActive,
        appliesTo: form.appliesTo,
        applicableProducts: form.appliesTo === 'store' ? form.applicableProducts : [],
        applicablePlans: form.appliesTo === 'membership' ? form.applicablePlans : [],
        ...(imageUrl ? { imageUrl } : {}),
        ...(form.validUntil.trim()
          ? { validUntil: form.validUntil.trim() }
          : {}),
      }
      if (imageUrl && !isValidImageValue(imageUrl)) {
        throw new Error('La imagen debe ser una URL http(s) válida o una imagen base64 PNG, JPG, WEBP o GIF.')
      }
      const promotionId = editingPromotion?._id || editingPromotion?.id

      if (editingPromotion) {
        if (!promotionId) throw new Error('La promoción no tiene un identificador válido.')
        await updatePromotion(promotionId, payload)
      } else {
        await createPromotion(payload)
      }

      setPromotions(await fetchPromotions())
      setError(null)
      setEditingPromotion(null)
      setForm(emptyPromotionForm)
      setIsModalOpen(false)
    } catch (requestError) {
      setModalError(
        requestError instanceof Error ? requestError.message : 'No se pudo guardar la promoción.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleDelete(promotion: Promotion) {
    const promotionId = promotion._id || promotion.id
    if (!promotionId) {
      setError('No se puede eliminar una promoción sin identificador.')
      return
    }
    if (!window.confirm(`¿Eliminar ${promotion.title || 'esta promoción'}?`)) return

    try {
      await deletePromotion(promotionId)
      setPromotions(await fetchPromotions())
      setError(null)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No se pudo eliminar la promoción.')
    }
  }

  return (
    <section className="min-h-screen bg-[#F8FAFC] px-8 py-10">
      <p className="text-sm font-medium uppercase tracking-[0.25em] text-slate-500">Marketing</p>
      <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight text-slate-900">Promociones</h1>
          <p className="mt-3 text-slate-500">Crea y administra las ofertas comerciales del gimnasio.</p>
        </div>
        {canManage && (
          <button
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#9BFF63] px-4 py-2 font-medium text-[#0F172A] transition hover:bg-[#abff7c]"
            type="button"
            onClick={openCreateModal}
          >
            <Plus size={18} aria-hidden="true" />
            Nueva Promoción
          </button>
        )}
      </div>

      <div className="mt-8 overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
        {error && (
          <div className="border-b border-red-100 bg-red-50 px-6 py-4 text-sm text-red-700" role="alert">
            {error}
          </div>
        )}

        {isLoading ? (
          <PromotionSkeleton />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-100 bg-slate-50/80 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-6 py-4 font-medium">Título</th>
                  <th className="px-6 py-4 font-medium">Aplica a</th>
                  <th className="px-6 py-4 font-medium">Descuento</th>
                  <th className="px-6 py-4 font-medium">Vigencia</th>
                  <th className="px-6 py-4 font-medium">Estado</th>
                  <th className="px-6 py-4 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {promotions.length > 0 ? (
                  promotions.map((promotion, index) => {
                    const promotionId = promotion._id || promotion.id || `promotion-${index}`
                    return (
                      <tr className="transition-colors hover:bg-slate-50" key={promotionId}>
                        <td className="whitespace-nowrap px-6 py-4">
                          <div className="flex items-center gap-3">
                            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                              <Tag size={17} aria-hidden="true" />
                            </span>
                            <div>
                              <p className="font-medium text-slate-900">{promotion.title || 'Sin título'}</p>
                              {promotion.description && (
                                <p className="mt-1 max-w-xs truncate text-xs text-slate-500">{promotion.description}</p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-slate-500">
                          {TARGET_LABELS[promotion.appliesTo ?? 'store']}
                        </td>
                        <td className="px-6 py-4 font-medium text-slate-700">
                          {Number(promotion.discountPercentage)}%
                        </td>
                        <td className="px-6 py-4 text-slate-500">{formatDate(promotion.validUntil)}</td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${promotion.isActive ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-600'}`}>
                            {promotion.isActive ? 'Activa' : 'Inactiva'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          {canManage && (
                            <div className="inline-flex items-center gap-3">
                              <button
                                className="cursor-pointer text-slate-400 transition hover:text-green-600"
                                type="button"
                                aria-label={`Editar ${promotion.title || 'promoción'}`}
                                title="Editar"
                                onClick={() => openEditModal(promotion)}
                              >
                                <Pencil size={17} aria-hidden="true" />
                              </button>
                              <button
                                className="cursor-pointer text-slate-400 transition hover:text-red-600"
                                type="button"
                                aria-label={`Eliminar ${promotion.title || 'promoción'}`}
                                title="Eliminar"
                                onClick={() => handleDelete(promotion)}
                              >
                                <Trash2 size={17} aria-hidden="true" />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })
                ) : (
                  <tr>
                    <td className="px-6 py-10 text-center text-sm text-slate-500" colSpan={6}>
                      No hay promociones registradas.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.2em] text-emerald-700">Marketing</p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-900">
                  {editingPromotion ? 'Editar Promoción' : 'Nueva Promoción'}
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

            <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="promotion-title">
                  Título
                </label>
                <input
                  className="w-full rounded-lg border border-slate-200 px-4 py-3 text-slate-900 outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-100"
                  id="promotion-title"
                  type="text"
                  value={form.title}
                  onChange={(event) => setForm({ ...form, title: event.target.value })}
                  required
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="promotion-description">
                  Descripción
                </label>
                <textarea
                  className="min-h-24 w-full resize-y rounded-lg border border-slate-200 px-4 py-3 text-slate-900 outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-100"
                  id="promotion-description"
                  value={form.description}
                  onChange={(event) => setForm({ ...form, description: event.target.value })}
                  rows={3}
                  required
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="promotion-discount">
                  Descuento (%)
                </label>
                <input
                  className="w-full rounded-lg border border-slate-200 px-4 py-3 text-slate-900 outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-100"
                  id="promotion-discount"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={form.discountPercentage}
                  onChange={(event) => setForm({ ...form, discountPercentage: event.target.value })}
                  required
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="promotion-target-type">
                  Aplica para
                </label>
                <select
                  className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-100"
                  id="promotion-target-type"
                  value={form.appliesTo}
                  onChange={(event) => setForm({ ...form, appliesTo: event.target.value as PromotionTarget })}
                >
                  {Object.entries(TARGET_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                {form.appliesTo === 'membership' && (
                  <p className="mt-2 text-xs text-slate-500">
                    Solo cambia el precio al cobrar en Pagos; las reglas de acceso viven en el plan.
                  </p>
                )}
              </div>

              <div>
                <p className="mb-1 block text-sm font-medium text-slate-700">
                  {form.appliesTo === 'store' ? 'Productos aplicables' : 'Planes aplicables'} (Opcional)
                </p>
                <p className="mb-3 text-xs text-slate-500">
                  Si lo dejas en blanco, la promoción aplicará a {form.appliesTo === 'store' ? 'todos los productos en la Venta Directa' : 'todos los planes'}.
                </p>
                <div className="max-h-48 space-y-2 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-3">
                  {form.appliesTo === 'store' ? (
                    products.length > 0 ? products.map((product) => {
                      const productId = product._id || product.id || ''
                      return (
                        <label className="flex items-center gap-3 rounded-md bg-white px-3 py-2 text-sm text-slate-700" key={productId}>
                          <input
                            className="h-4 w-4 accent-green-500"
                            type="checkbox"
                            checked={form.applicableProducts.includes(productId)}
                            onChange={(event) => {
                              const selected = form.applicableProducts
                              const applicableProducts = event.target.checked ? [...selected, productId] : selected.filter((id) => id !== productId)
                              setForm({ ...form, applicableProducts })
                            }}
                            disabled={!productId}
                          />
                          <span>{product.name}</span>
                        </label>
                      )
                    }) : (
                      <p className="text-sm text-slate-500">No hay productos disponibles.</p>
                    )
                  ) : plans.length > 0 ? plans.map((plan) => {
                    const planId = plan._id || plan.id || ''
                    return (
                      <label className="flex items-center gap-3 rounded-md bg-white px-3 py-2 text-sm text-slate-700" key={planId}>
                        <input
                          className="h-4 w-4 accent-green-500"
                          type="checkbox"
                          checked={form.applicablePlans.includes(planId)}
                          onChange={(event) => {
                            const selected = form.applicablePlans
                            const applicablePlans = event.target.checked ? [...selected, planId] : selected.filter((id) => id !== planId)
                            setForm({ ...form, applicablePlans })
                          }}
                          disabled={!planId}
                        />
                        <span>{plan.name || plan.nombre || 'Plan sin nombre'}</span>
                      </label>
                    )
                  }) : (
                    <p className="text-sm text-slate-500">No hay planes disponibles.</p>
                  )}
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="promotion-valid-until">
                  Válida hasta
                </label>
                <input
                  className="w-full rounded-lg border border-slate-200 px-4 py-3 text-slate-900 outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-100"
                  id="promotion-valid-until"
                  type="date"
                  value={form.validUntil}
                  onChange={(event) => setForm({ ...form, validUntil: event.target.value })}
                />
              </div>

              <div>
                {form.imageUrl && (
                  <img
                    className="mb-3 h-24 w-24 rounded-lg object-cover"
                    src={form.imageUrl}
                    alt="Vista previa de la promoción"
                  />
                )}
                <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="promotion-image-file">
                  Imagen de la promoción
                </label>
                <input
                  className="w-full rounded-lg border border-slate-200 px-4 py-3 text-slate-900 outline-none transition file:mr-4 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
                  id="promotion-image-file"
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  onChange={handleImageChange}
                />
              </div>

              <label className="flex items-center gap-3 text-sm font-medium text-slate-700">
                <input
                  className="h-4 w-4 accent-green-500"
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(event) => setForm({ ...form, isActive: event.target.checked })}
                />
                Promoción activa
              </label>

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
                  {isSubmitting ? 'Guardando...' : editingPromotion ? 'Actualizar' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  )
}

export default Promotions