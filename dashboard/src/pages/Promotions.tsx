import { useEffect, useState } from 'react'
import { CalendarClock, FileCheck, ImagePlus, Megaphone, Pencil, Plus, ShoppingBag, Tag, Ticket, Trash2 } from 'lucide-react'
import { createPromotion, deletePromotion, getPlans, getProducts, getPromotions, updatePromotion } from '../services/api'
import type { Plan, Product, Promotion, PromotionTarget } from '../types'
import { useIsOwner } from '../utils/access'
import { isValidImageValue } from '../utils/imageValidation'
import PageHeader from '../components/ui/PageHeader'
import Panel from '../components/ui/Panel'
import Modal from '../components/ui/Modal'
import Badge, { type BadgeTone } from '../components/ui/Badge'
import EmptyState from '../components/ui/EmptyState'
import Segmented from '../components/ui/Segmented'
import { errorAlert, fieldClass, hintClass, iconButton, labelClass, primaryButton, secondaryButton } from '../components/ui/styles'

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
  requiredDocument: '' | 'student_id'
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
  requiredDocument: '',
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

// The API says whether each promotion applies now; older responses without `state` fall back to the flags.
const STATE_STYLES: Record<'active' | 'inactive' | 'expired', { label: string; tone: BadgeTone }> = {
  active: { label: 'Vigente', tone: 'success' },
  inactive: { label: 'Inactiva', tone: 'neutral' },
  expired: { label: 'Vencida', tone: 'warning' },
}

function promotionStateOf(promotion: Promotion): keyof typeof STATE_STYLES {
  if (promotion.state) return promotion.state
  if (!promotion.isActive) return 'inactive'
  return promotion.validUntil && new Date(promotion.validUntil) <= new Date() ? 'expired' : 'active'
}

function toDateInputValue(value?: string) {
  return value ? value.slice(0, 10) : ''
}

function validityText(promotion: Promotion) {
  if (promotion.validUntilDate) return `Hasta el ${formatDate(`${promotion.validUntilDate}T12:00:00`)}`
  return promotion.validUntil ? `Hasta el ${formatDate(promotion.validUntil)}` : 'Sin fecha de fin'
}

type StateFilter = 'all' | keyof typeof STATE_STYLES

function Promotions() {
  // Promotions are the organization's catalog: only the owner manages them; Recepcion reads them to apply them in Caja.
  const canManage = useIsOwner()
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
  const [stateFilter, setStateFilter] = useState<StateFilter>('all')

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
          setError(requestError instanceof Error ? requestError.message : 'No se pudieron cargar las promociones.')
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
          setError(requestError instanceof Error ? requestError.message : 'No se pudieron cargar los productos y planes.')
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
      validUntil: promotion.validUntilDate ?? toDateInputValue(promotion.validUntil ?? undefined),
      isActive: promotion.isActive,
      imageUrl: promotion.imageUrl || '',
      appliesTo: promotion.appliesTo ?? 'store',
      applicableProducts: toIds(promotion.applicableProducts),
      applicablePlans: toIds(promotion.applicablePlans),
      requiredDocument: promotion.requiredDocument ?? '',
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
        requiredDocument: form.requiredDocument || null,
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
      setModalError(requestError instanceof Error ? requestError.message : 'No se pudo guardar la promoción.')
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
    if (!window.confirm(`¿Retirar ${promotion.title || 'esta promoción'}? Dejará de aplicarse; los pagos y pedidos que la usaron la conservan.`)) return

    try {
      await deletePromotion(promotionId)
      setPromotions(await fetchPromotions())
      setError(null)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No se pudo eliminar la promoción.')
    }
  }

  const countFor = (filter: StateFilter) => filter === 'all' ? promotions.length : promotions.filter((promotion) => promotionStateOf(promotion) === filter).length
  const visiblePromotions = stateFilter === 'all' ? promotions : promotions.filter((promotion) => promotionStateOf(promotion) === stateFilter)
  const filterOptions = ([['all', 'Todas'], ['active', 'Vigentes'], ['inactive', 'Inactivas'], ['expired', 'Vencidas']] as const)
    .map(([value, label]) => [value, `${label} ${countFor(value)}`] as const)

  const toggleId = (list: string[], id: string, checked: boolean) => checked ? [...list, id] : list.filter((item) => item !== id)
  const options = form.appliesTo === 'store'
    ? products.map((product) => ({ id: product._id || product.id || '', name: product.name }))
    : plans.map((plan) => ({ id: plan._id || plan.id || '', name: plan.name || plan.nombre || 'Plan sin nombre' }))
  const selectedIds = form.appliesTo === 'store' ? form.applicableProducts : form.applicablePlans

  return (
    <section className="min-h-screen bg-canvas px-4 py-8 sm:px-8 sm:py-10">
      <PageHeader
        eyebrow="Comercial"
        title="Promociones"
        description={canManage ? 'Descuentos para productos de la tienda o planes de membresía. Caja los aplica al cobrar.' : 'Descuentos vigentes que Caja aplica al cobrar.'}
        actions={canManage && (
          <button className={primaryButton} type="button" onClick={openCreateModal}>
            <Plus size={18} aria-hidden /> Nueva promoción
          </button>
        )}
      />

      <Panel className="mt-6" title="Catálogo de promociones" icon={Megaphone} description={isLoading ? undefined : `${promotions.length} ${promotions.length === 1 ? 'promoción' : 'promociones'}`}>
        {error && <p className={`${errorAlert} mb-4`} role="alert">{error}</p>}

        <div className="-mx-1 overflow-x-auto px-1 pb-1">
          <Segmented label="Estado" value={stateFilter} options={filterOptions} onChange={setStateFilter} />
        </div>

        <div className="mt-4">
          {isLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true" aria-label="Cargando promociones">
              {Array.from({ length: 3 }).map((_, index) => <div className="skeleton h-56 w-full rounded-card" key={index} />)}
            </div>
          ) : visiblePromotions.length === 0 ? (
            <EmptyState icon={Ticket} title={promotions.length === 0 ? 'Aún no hay promociones' : 'Sin promociones en esta vista'}>
              {promotions.length === 0
                ? (canManage ? 'Crea un descuento para la tienda o para un plan de membresía.' : 'Cuando el dueño cree promociones aparecerán aquí.')
                : 'Cambia el filtro para ver otras promociones.'}
            </EmptyState>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {visiblePromotions.map((promotion, index) => {
                const state = STATE_STYLES[promotionStateOf(promotion)]
                const isMembership = (promotion.appliesTo ?? 'store') === 'membership'
                const TargetIcon = isMembership ? Ticket : ShoppingBag
                return (
                  <li
                    className={`group flex flex-col overflow-hidden rounded-card border border-slate-200 bg-white transition duration-200 hover:-translate-y-0.5 hover:shadow-lift ${promotionStateOf(promotion) === 'active' ? '' : 'opacity-80'}`}
                    key={promotion._id || promotion.id || `promotion-${index}`}
                  >
                    <div className="relative h-28 bg-ink">
                      {promotion.imageUrl
                        ? <img className="h-full w-full object-cover opacity-80" src={promotion.imageUrl} alt="" />
                        : <div className="h-full w-full bg-[radial-gradient(circle_at_85%_20%,rgba(16,255,133,0.35),transparent_55%)]" aria-hidden="true" />}
                      <span className="absolute bottom-3 left-4 font-display text-4xl font-bold leading-none text-white drop-shadow tabular">
                        −{Number(promotion.discountPercentage)}%
                      </span>
                      <span className="absolute right-3 top-3"><Badge tone={state.tone}>{state.label}</Badge></span>
                    </div>
                    <div className="flex flex-1 flex-col p-4">
                      <p className="font-semibold text-ink">{promotion.title || 'Sin título'}</p>
                      {promotion.description && <p className="mt-1 line-clamp-2 text-sm text-slate-500">{promotion.description}</p>}
                      <div className="mt-3 space-y-1.5 text-xs text-slate-500">
                        <p className="flex items-center gap-1.5"><TargetIcon size={14} aria-hidden /> {TARGET_LABELS[promotion.appliesTo ?? 'store']}</p>
                        <p className="flex items-center gap-1.5"><CalendarClock size={14} aria-hidden /> {validityText(promotion)}</p>
                        {promotion.requiredDocument === 'student_id' && (
                          <p className="flex items-center gap-1.5 text-sky-700"><FileCheck size={14} aria-hidden /> Requiere credencial de estudiante</p>
                        )}
                      </div>
                      {canManage && (
                        <div className="mt-auto flex justify-end gap-1 border-t border-slate-100 pt-3">
                          <button className={`${iconButton} hover:text-brand-text`} type="button" aria-label={`Editar ${promotion.title || 'promoción'}`} title="Editar" onClick={() => openEditModal(promotion)}>
                            <Pencil size={17} aria-hidden />
                          </button>
                          <button className={`${iconButton} hover:bg-red-50 hover:text-red-600`} type="button" aria-label={`Retirar ${promotion.title || 'promoción'}`} title="Retirar" onClick={() => void handleDelete(promotion)}>
                            <Trash2 size={17} aria-hidden />
                          </button>
                        </div>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </Panel>

      {isModalOpen && (
        <Modal eyebrow="Promociones" title={editingPromotion ? 'Editar promoción' : 'Nueva promoción'} onClose={closeModal} size="xl">
          <form className="space-y-5" onSubmit={handleSubmit}>
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_9rem]">
              <div>
                <label className={labelClass} htmlFor="promotion-title">Título</label>
                <input className={fieldClass} id="promotion-title" type="text" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} required />
              </div>
              <div>
                <label className={labelClass} htmlFor="promotion-discount">Descuento (%)</label>
                <input className={fieldClass} id="promotion-discount" type="number" min="0" max="100" step="0.01" value={form.discountPercentage} onChange={(event) => setForm({ ...form, discountPercentage: event.target.value })} required />
              </div>
            </div>

            <div>
              <label className={labelClass} htmlFor="promotion-description">Descripción</label>
              <textarea className={`${fieldClass} min-h-24 resize-y`} id="promotion-description" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} rows={3} required />
            </div>

            <fieldset>
              <legend className={labelClass}>Aplica para</legend>
              <Segmented
                label="Aplica para"
                value={form.appliesTo}
                options={[['store', 'Productos de tienda'], ['membership', 'Planes de membresía']] as const}
                onChange={(appliesTo) => setForm({ ...form, appliesTo })}
              />
              {form.appliesTo === 'membership' && <p className={hintClass}>Solo cambia el precio al cobrar en Caja; las reglas de acceso viven en el plan.</p>}
            </fieldset>

            <div>
              <p className={labelClass}>
                {form.appliesTo === 'store' ? 'Productos' : 'Planes'} <span className="font-normal text-slate-400">(opcional)</span>
              </p>
              <p className="-mt-1 mb-2 text-xs text-slate-500">
                Si no eliges ninguno, aplica a {form.appliesTo === 'store' ? 'todos los productos' : 'todos los planes'}.
              </p>
              {options.length > 0 ? (
                <div className="flex max-h-44 flex-wrap gap-2 overflow-y-auto rounded-xl border border-slate-200 p-3">
                  {options.map((option) => {
                    const isChecked = selectedIds.includes(option.id)
                    return (
                      <label
                        className={`inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand/40 ${isChecked ? 'border-brand-text/30 bg-brand-soft font-medium text-brand-ink' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}
                        key={option.id || option.name}
                      >
                        <input
                          className="sr-only"
                          type="checkbox"
                          checked={isChecked}
                          disabled={!option.id}
                          onChange={(event) => setForm(form.appliesTo === 'store'
                            ? { ...form, applicableProducts: toggleId(form.applicableProducts, option.id, event.target.checked) }
                            : { ...form, applicablePlans: toggleId(form.applicablePlans, option.id, event.target.checked) })}
                        />
                        {isChecked && <Tag size={13} aria-hidden />}
                        {option.name}
                      </label>
                    )
                  })}
                </div>
              ) : (
                <p className="rounded-xl border border-dashed border-slate-200 px-4 py-3 text-sm text-slate-500">
                  {form.appliesTo === 'store' ? 'No hay productos disponibles.' : 'No hay planes disponibles.'}
                </p>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass} htmlFor="promotion-required-document">Documento requerido</label>
                <select className={fieldClass} id="promotion-required-document" value={form.requiredDocument} onChange={(event) => setForm({ ...form, requiredDocument: event.target.value as PromotionFormState['requiredDocument'] })}>
                  <option value="">Ninguno</option>
                  <option value="student_id">Credencial de estudiante</option>
                </select>
                {form.requiredDocument && <p className={hintClass}>Solo se aplica si el cliente tiene ese documento verificado y vigente en Documentos.</p>}
              </div>
              <div>
                <label className={labelClass} htmlFor="promotion-valid-until">Válida hasta</label>
                <input className={fieldClass} id="promotion-valid-until" type="date" value={form.validUntil} onChange={(event) => setForm({ ...form, validUntil: event.target.value })} />
              </div>
            </div>

            <div>
              <p className={labelClass}>Imagen</p>
              <div className="flex items-center gap-4">
                {form.imageUrl
                  ? <img className="h-16 w-16 shrink-0 rounded-xl object-cover ring-1 ring-slate-200" src={form.imageUrl} alt="Vista previa de la promoción" />
                  : <span className="grid h-16 w-16 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-400"><ImagePlus size={22} aria-hidden /></span>}
                <label className={`${secondaryButton} cursor-pointer`} htmlFor="promotion-image-file">
                  {form.imageUrl ? 'Cambiar imagen' : 'Subir imagen'}
                  <input className="sr-only" id="promotion-image-file" type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={handleImageChange} />
                </label>
              </div>
            </div>

            <label className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 px-4 py-3">
              <span>
                <span className="block text-sm font-medium text-ink">Promoción activa</span>
                <span className="block text-xs text-slate-500">Desactívala para pausarla sin borrarla.</span>
              </span>
              <input className="h-5 w-5 accent-brand-text" type="checkbox" checked={form.isActive} onChange={(event) => setForm({ ...form, isActive: event.target.checked })} />
            </label>

            {modalError && <p className={errorAlert} role="alert">{modalError}</p>}

            <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
              <button className={secondaryButton} type="button" onClick={closeModal} disabled={isSubmitting}>Cancelar</button>
              <button className={primaryButton} type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Guardando...' : editingPromotion ? 'Guardar cambios' : 'Crear promoción'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  )
}

export default Promotions
