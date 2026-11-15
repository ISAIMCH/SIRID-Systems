import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AlertTriangle, Banknote, CheckCircle2, Clock, CreditCard, Inbox, KeyRound, Minus, Package, Plus, Receipt, Search, ShoppingBag, Trash2, UserRound, X } from 'lucide-react'
import {
  ApiError,
  cancelPayment,
  changedQuote,
  checkoutCashier,
  getCashierClient,
  getCashierQueue,
  getPlans,
  getProducts,
  getPromotions,
  lookupCashierPin,
  newIdempotencyKey,
  quoteCheckout,
  redeemPaymentPin,
  redeemSalePin,
  searchCashierClients,
  updateSale,
} from '../services/api'
import type {
  CashierClientResult,
  CashierPaymentMethod,
  CashierPinMatch,
  CashierProfile,
  CashierQueueItem,
  CheckoutPayload,
  CheckoutQuote,
  CheckoutResult,
} from '../services/api'
import { socket } from '../services/socket'
import type { Plan, Product, Promotion } from '../types'
import Panel from '../components/ui/Panel'
import EmptyState from '../components/ui/EmptyState'
import Segmented from '../components/ui/Segmented'
import GymSelect from '../components/GymSelect'
import { useAuth } from '../store/useAuth'
import { targetGymField } from '../utils/targetGym'

const money = (value: number | null | undefined) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(Number(value) || 0)
const shortDate = (value: string | null | undefined) => (value ? new Date(value).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }) : '—')
const dateTime = (value: string | null | undefined) => (value ? new Date(value).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }) : '—')
const errorText = (error: unknown, fallback: string) => (error instanceof Error && error.message ? error.message : fallback)

const METHODS: ReadonlyArray<readonly [CashierPaymentMethod, string]> = [['Cash', 'Efectivo'], ['Card', 'Tarjeta'], ['Transfer', 'Transferencia']]
const METHOD_ICONS: Record<CashierPaymentMethod, typeof Banknote> = { Cash: Banknote, Card: CreditCard, Transfer: Receipt }
const methodLabel = (method?: string) => METHODS.find(([value]) => value === method)?.[1] ?? method ?? '—'
// The round amounts a member is likely to hand over for this total ("exacto" is added on top).
const cashShortcuts = (total: number) => [...new Set([50, 100, 200, 500, 1000].map((step) => Math.ceil(total / step) * step))]
  .filter((amount) => amount > total)
  .slice(0, 3)
const LOW_STOCK = 5

const MEMBERSHIP_LABELS: Record<string, { label: string; className: string }> = {
  active: { label: 'Activa', className: 'bg-green-100 text-green-800' },
  pending: { label: 'Sin activar', className: 'bg-slate-100 text-slate-600' },
  expired: { label: 'Vencida', className: 'bg-red-100 text-red-800' },
  suspended: { label: 'Suspendida', className: 'bg-amber-100 text-amber-800' },
}
const STATUS_LABELS: Record<string, string> = { paid: 'Pagado', pending: 'Pendiente', cancelled: 'Cancelado', reverted: 'Revertido', failed: 'Fallido' }

function MembershipBadge({ status }: { status?: string | null }) {
  const view = MEMBERSHIP_LABELS[status ?? ''] ?? { label: 'Sin membresía', className: 'bg-slate-100 text-slate-600' }
  return <span className={`inline-flex shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${view.className}`}>{view.label}</span>
}

function listFrom<T>(value: unknown, key: string): T[] {
  if (Array.isArray(value)) return value as T[]
  const candidate = value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : null
  return Array.isArray(candidate) ? candidate as T[] : []
}
const recordId = (record: { id?: string; _id?: string }) => record.id || record._id || ''
const fullName = (user: { name?: string; lastName?: string } | null | undefined) => [user?.name, user?.lastName].filter(Boolean).join(' ') || 'Socio'
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'S'
const normalize = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

interface CartItem { productId: string; quantity: number }

function Cashier() {
  const { isAllGyms } = useAuth()
  const [view, setView] = useState<'charge' | 'queue'>('charge')
  const [gymId, setGymId] = useState('')
  const [plans, setPlans] = useState<Plan[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [storePromotions, setStorePromotions] = useState<Promotion[]>([])
  const [catalogError, setCatalogError] = useState<string | null>(null)

  // Queue
  const [queueType, setQueueType] = useState<'all' | 'membership' | 'order'>('all')
  const [queueSearch, setQueueSearch] = useState('')
  const [queuePage, setQueuePage] = useState(1)
  const [queue, setQueue] = useState<{ items: CashierQueueItem[]; total: number; limit: number } | null>(null)
  const [queueError, setQueueError] = useState<string | null>(null)
  const [cancellingOrderId, setCancellingOrderId] = useState<string | null>(null)

  // PIN
  const [pin, setPin] = useState('')
  const [pinMatch, setPinMatch] = useState<(CashierPinMatch & { pin: string }) | null>(null)
  const [pinError, setPinError] = useState<string | null>(null)
  const [pinMethod, setPinMethod] = useState<CashierPaymentMethod>('Cash')
  const [isPinBusy, setIsPinBusy] = useState(false)

  // Client
  const [clientQuery, setClientQuery] = useState('')
  const [clientResults, setClientResults] = useState<CashierClientResult[] | null>(null)
  const [clientId, setClientId] = useState<string | null>(null)
  const [profile, setProfile] = useState<CashierProfile | null>(null)
  const [profileError, setProfileError] = useState<string | null>(null)

  // Catalog browsing
  const [productQuery, setProductQuery] = useState('')
  const [category, setCategory] = useState('')
  const productSearchRef = useRef<HTMLInputElement>(null)
  const ticketRef = useRef<HTMLElement>(null)

  // Charge
  const [planId, setPlanId] = useState('')
  const [membershipPromotionId, setMembershipPromotionId] = useState('')
  const [replacesPending, setReplacesPending] = useState(false)
  const [cart, setCart] = useState<CartItem[]>([])
  const [storePromotionId, setStorePromotionId] = useState('')
  const [method, setMethod] = useState<CashierPaymentMethod>('Cash')
  const [reference, setReference] = useState('')
  const [received, setReceived] = useState('')
  const [quoteState, setQuoteState] = useState<{ key: string; quote: CheckoutQuote | null; error: string | null } | null>(null)
  const [isConfirming, setIsConfirming] = useState(false)
  const [isCharging, setIsCharging] = useState(false)
  const [chargeError, setChargeError] = useState<string | null>(null)
  const [checkoutKey, setCheckoutKey] = useState(newIdempotencyKey)
  const [result, setResult] = useState<CheckoutResult | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const loadCatalog = useCallback(async () => {
    try {
      const [planResponse, productResponse, promotionResponse] = await Promise.all([getPlans(), getProducts(), getPromotions('store')])
      setPlans(listFrom<Plan>(planResponse, 'plans').filter((plan) => plan.isActive !== false))
      setProducts(listFrom<Product>(productResponse, 'products'))
      setStorePromotions(listFrom<Promotion>(promotionResponse, 'promotions').filter((promotion) => (promotion.state ?? (promotion.isActive ? 'active' : 'inactive')) === 'active'))
      setCatalogError(null)
    } catch (error) {
      setCatalogError(errorText(error, 'No se pudo cargar el catálogo.'))
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => { void loadCatalog() }, 0)
    return () => clearTimeout(timer)
  }, [loadCatalog])

  const loadQueue = useCallback(async () => {
    try {
      const response = await getCashierQueue({ type: queueType, q: queueSearch.trim() || undefined, page: queuePage, limit: 15 })
      setQueue({ items: response.items, total: response.total, limit: response.limit })
      setQueueError(null)
    } catch (error) {
      setQueueError(errorText(error, 'No se pudo cargar la cola.'))
    }
  }, [queueType, queueSearch, queuePage])

  const loadProfile = useCallback(async (id: string) => {
    try {
      setProfile(await getCashierClient(id))
      setProfileError(null)
    } catch (error) {
      setProfileError(errorText(error, 'No se pudo cargar el socio.'))
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => { void loadQueue() }, 250)
    return () => clearTimeout(timer)
  }, [loadQueue])

  // Another desk, the app or a PIN changes the queue, the stock and the open profile.
  useEffect(() => {
    const refresh = () => {
      void loadQueue()
      void loadCatalog()
      if (clientId) void loadProfile(clientId)
    }
    const events = ['payment-updated', 'sale-updated']
    events.forEach((name) => socket.on(name, refresh))
    return () => { events.forEach((name) => socket.off(name, refresh)) }
  }, [loadQueue, loadCatalog, loadProfile, clientId])

  // Search members while typing.
  useEffect(() => {
    const query = clientQuery.trim()
    if (query.length < 2) return
    let isCurrent = true
    const timer = setTimeout(() => {
      searchCashierClients(query)
        .then((response) => { if (isCurrent) { setClientResults(response.clients); setProfileError(null) } })
        .catch((error: unknown) => { if (isCurrent) setProfileError(errorText(error, 'No se pudo buscar.')) })
    }, 250)
    return () => { isCurrent = false; clearTimeout(timer) }
  }, [clientQuery])

  function resetCharge() {
    setPlanId('')
    setMembershipPromotionId('')
    setReplacesPending(false)
    setStorePromotionId('')
    setReference('')
    setReceived('')
    setChargeError(null)
    setIsConfirming(false)
    setCheckoutKey(newIdempotencyKey())
  }

  // The cart survives a change of member, so products can be scanned before asking who pays.
  function openClient(id: string) {
    setClientId(id)
    setProfile(null)
    setClientResults(null)
    setClientQuery('')
    setResult(null)
    resetCharge()
    setView('charge')
    void loadProfile(id)
  }

  // ?cliente=<id> (from "Registrar cliente") opens that member once; the parameter is dropped so a reload starts clean.
  const [searchParams, setSearchParams] = useSearchParams()
  const linkedClientId = searchParams.get('cliente')
  useEffect(() => {
    if (!linkedClientId) return
    const timer = setTimeout(() => {
      openClient(linkedClientId)
      setSearchParams({}, { replace: true })
    }, 0)
    return () => clearTimeout(timer)
    // openClient only sets state and loads the profile; it does not need to be a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkedClientId, setSearchParams])

  function clearClient() {
    setClientId(null)
    setProfile(null)
    setProfileError(null)
    resetCharge()
  }

  function startOver() {
    clearClient()
    setCart([])
    setResult(null)
  }

  // ---------- PIN ----------

  async function handlePinLookup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const value = pin.trim().toUpperCase()
    if (!value) return
    setIsPinBusy(true); setPinError(null); setPinMatch(null)
    try {
      setPinMatch({ ...(await lookupCashierPin(value)), pin: value })
    } catch (error) {
      setPinError(errorText(error, 'No se encontró el PIN.'))
    } finally { setIsPinBusy(false) }
  }

  async function confirmPin() {
    if (!pinMatch) return
    setIsPinBusy(true); setPinError(null)
    try {
      if (pinMatch.kind === 'membership') await redeemPaymentPin(pinMatch.pin, pinMethod)
      else await redeemSalePin(pinMatch.pin, pinMethod)
      setNotice(pinMatch.kind === 'membership' ? 'Membresía cobrada y activada.' : 'Pedido cobrado y entregado.')
      const userId = pinMatch.payment?.user?._id ?? pinMatch.order?.userId?._id
      setPinMatch(null); setPin('')
      void loadQueue()
      void loadCatalog()
      if (userId && userId === clientId) void loadProfile(userId)
    } catch (error) {
      setPinError(errorText(error, 'No se pudo cobrar.'))
    } finally { setIsPinBusy(false) }
  }

  // ---------- Quote ----------

  const pendingPayment = profile?.pendingPayment ?? null
  const payload: CheckoutPayload | null = clientId && (planId || cart.length > 0) ? {
    userId: clientId,
    membership: planId ? {
      planId,
      ...(membershipPromotionId ? { promotionId: membershipPromotionId } : {}),
      ...(pendingPayment && replacesPending ? { replacesPaymentId: pendingPayment.id } : {}),
    } : null,
    items: cart,
    ...(storePromotionId && cart.length > 0 ? { promotionId: storePromotionId } : {}),
    ...(isAllGyms && gymId ? { gymId } : {}),
  } : null
  const payloadKey = payload ? JSON.stringify(payload) : ''
  const needsGym = isAllGyms && !gymId

  useEffect(() => {
    if (!payloadKey || needsGym) return
    let isCurrent = true
    const timer = setTimeout(() => {
      quoteCheckout(JSON.parse(payloadKey) as CheckoutPayload)
        .then((response) => { if (isCurrent) setQuoteState({ key: payloadKey, quote: response.quote, error: null }) })
        .catch((error: unknown) => { if (isCurrent) setQuoteState({ key: payloadKey, quote: null, error: errorText(error, 'No se pudo calcular el total.') }) })
    }, 250)
    return () => { isCurrent = false; clearTimeout(timer) }
  }, [payloadKey, needsGym])

  const quoteIsCurrent = quoteState?.key === payloadKey
  const quote = quoteIsCurrent ? quoteState.quote : null
  const quoteError = quoteIsCurrent ? quoteState.error : null
  const isQuoting = Boolean(payloadKey) && !needsGym && !quoteIsCurrent
  const blockedByPending = Boolean(planId && pendingPayment && !replacesPending)
  const storeUnavailable = Boolean(quote?.store && !quote.store.available)
  const receivedAmount = Number(received)
  const cashShort = method === 'Cash' && received !== '' && quote ? receivedAmount < quote.total : false
  const canCharge = Boolean(quote) && !isQuoting && !blockedByPending && !storeUnavailable && !cashShort && !isCharging

  async function charge() {
    if (!payload || !quote) return
    setIsCharging(true); setChargeError(null)
    try {
      const response = await checkoutCashier({ ...payload, ...targetGymField(isAllGyms, gymId), paymentMethod: method, expectedTotal: quote.total, ...(reference.trim() ? { reference: reference.trim() } : {}) }, checkoutKey)
      setResult(response)
      setCart([])
      resetCharge()
      void loadQueue()
      void loadCatalog()
      if (clientId) void loadProfile(clientId)
    } catch (error) {
      const newQuote = changedQuote(error)
      if (newQuote) {
        setQuoteState({ key: payloadKey, quote: newQuote, error: null })
        setChargeError('El total cambió desde que se mostró. Revisa el nuevo importe y confirma otra vez.')
      } else if (error instanceof ApiError) {
        setChargeError(error.message)
      } else {
        // Without an answer the charge may or may not have been saved: the same key makes a retry safe.
        setChargeError(`${errorText(error, 'Sin respuesta del servidor.')} Puedes reintentar: no se cobrará dos veces.`)
      }
      setIsConfirming(false)
    } finally { setIsCharging(false) }
  }

  async function handleCancelPending() {
    if (!pendingPayment) return
    const reason = window.prompt('Motivo para cancelar la solicitud pendiente del socio:')
    if (!reason || reason.trim().length < 3) return
    try {
      await cancelPayment(pendingPayment.id, reason.trim())
      setNotice('Solicitud pendiente cancelada; su PIN ya no funciona.')
      setReplacesPending(false)
      if (clientId) void loadProfile(clientId)
      void loadQueue()
    } catch (error) {
      setProfileError(errorText(error, 'No se pudo cancelar la solicitud.'))
    }
  }

  async function handleCancelOrder(orderId: string, clientName: string) {
    const reason = window.prompt(`Motivo para cancelar el pedido de ${clientName}:`)
    if (reason === null) return
    setCancellingOrderId(orderId)
    try {
      await updateSale(orderId, { status: 'cancelled', ...(reason.trim() ? { reason: reason.trim() } : {}) })
      setNotice('Pedido cancelado; su PIN ya no funciona.')
      void loadQueue()
      if (clientId) void loadProfile(clientId)
    } catch (error) {
      setQueueError(errorText(error, 'No se pudo cancelar el pedido.'))
    } finally { setCancellingOrderId(null) }
  }

  // ---------- Catalog ----------

  const stockOf = useCallback((product: Product) => {
    if (isAllGyms && gymId) return product.stockByGym?.find((entry) => entry.gymId === gymId)?.quantity ?? 0
    return Number(product.stock) || 0
  }, [isAllGyms, gymId])

  const categories = useMemo(() => [...new Set(products.map((product) => product.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')), [products])
  const visibleProducts = useMemo(() => {
    const query = normalize(productQuery.trim())
    return products.filter((product) => (!category || product.category === category) && (!query || normalize(`${product.name} ${product.category ?? ''}`).includes(query)))
  }, [products, productQuery, category])

  const quantityInCart = (productId: string) => cart.find((item) => item.productId === productId)?.quantity ?? 0

  function addProduct(product: Product) {
    const id = recordId(product)
    if (!id || quantityInCart(id) >= stockOf(product)) return
    setCart((current) => current.some((item) => item.productId === id)
      ? current.map((item) => item.productId === id ? { ...item, quantity: item.quantity + 1 } : item)
      : [...current, { productId: id, quantity: 1 }])
  }

  function changeQuantity(productId: string, delta: number) {
    setCart((current) => current.flatMap((item) => {
      if (item.productId !== productId) return [item]
      const quantity = item.quantity + delta
      return quantity <= 0 ? [] : [{ ...item, quantity }]
    }))
  }

  // Enter adds the product when the search leaves only one (a barcode scanner types the name and presses Enter).
  function handleProductSearchKey(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return
    event.preventDefault()
    if (visibleProducts.length === 1) {
      addProduct(visibleProducts[0])
      setProductQuery('')
    }
  }

  const productById = (id: string) => products.find((product) => recordId(product) === id)
  const selectedPlan = plans.find((plan) => recordId(plan) === planId)
  const estimatedTotal = (selectedPlan ? Number(selectedPlan.price ?? selectedPlan.precio) || 0 : 0)
    + cart.reduce((sum, item) => sum + (Number(productById(item.productId)?.price) || 0) * item.quantity, 0)
  const ticketCount = cart.reduce((sum, item) => sum + item.quantity, 0) + (planId ? 1 : 0)
  const queuePages = queue ? Math.max(1, Math.ceil(queue.total / queue.limit)) : 1
  const inputClass = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-green-500 focus:ring-2 focus:ring-green-100'
  const chipClass = (isActive: boolean) => `shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium transition ${isActive ? 'border-ink bg-ink text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-ink'}`

  return (
    <section className="min-h-screen bg-canvas px-4 py-8 sm:px-8 sm:py-10">
      <p className="text-sm font-medium uppercase tracking-[0.25em] text-slate-500">Comercial</p>
      <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight text-slate-900">Caja</h1>
          <p className="mt-3 text-slate-500">Cobra membresías, productos y pedidos de la app. Los precios y promociones los calcula el sistema.</p>
        </div>
        <form className="flex gap-2" onSubmit={handlePinLookup}>
          <input className={`${inputClass} font-mono tracking-[0.3em] uppercase sm:w-56`} placeholder="PIN" aria-label="PIN del socio (5 dígitos o 4 caracteres)" value={pin} maxLength={5} autoFocus onChange={(event) => setPin(event.target.value)} />
          <button className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50" type="submit" disabled={isPinBusy || !pin.trim()}>
            <KeyRound size={16} aria-hidden="true" />Cobrar PIN
          </button>
        </form>
      </div>

      {catalogError && <p className="mt-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{catalogError}</p>}
      {notice && (
        <p className="mt-6 flex items-center justify-between gap-3 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800" role="status">
          <span className="flex items-center gap-2"><CheckCircle2 size={16} aria-hidden="true" />{notice}</span>
          <button className="text-green-700 hover:text-green-900" type="button" onClick={() => setNotice(null)} aria-label="Cerrar aviso">×</button>
        </p>
      )}
      {pinError && <p className="mt-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{pinError}</p>}

      {pinMatch && (
        <div className="mt-6 rounded-card border border-green-200 bg-white p-5 shadow-card">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-emerald-700">{pinMatch.kind === 'membership' ? 'Solicitud de membresía' : 'Pedido de tienda'} · PIN {pinMatch.pin}</p>
          {pinMatch.payment && (
            <div className="mt-2">
              <p className="text-lg font-semibold text-ink">{fullName(pinMatch.payment.user)}</p>
              <p className="text-sm text-slate-500">{pinMatch.payment.planName} · {pinMatch.payment.durationDays} días · solicitado {dateTime(pinMatch.payment.createdAt)}</p>
              <p className="mt-2 text-2xl font-semibold text-ink">{money(pinMatch.payment.amount)}</p>
              {(pinMatch.payment.discountApplied ?? 0) > 0 && <p className="text-xs text-green-700">Incluye descuento de {money(pinMatch.payment.discountApplied)}</p>}
            </div>
          )}
          {pinMatch.order && (
            <div className="mt-2">
              <p className="text-lg font-semibold text-ink">{fullName(pinMatch.order.userId)}</p>
              <ul className="mt-1 text-sm text-slate-600">
                {pinMatch.order.items.map((item, index) => <li key={index}>{item.productId?.name ?? 'Producto'} × {item.quantity} · {money(item.price * item.quantity)}</li>)}
              </ul>
              <p className="mt-2 text-2xl font-semibold text-ink">{money(pinMatch.order.totalAmount)}</p>
              {(pinMatch.order.discountApplied ?? 0) > 0 && <p className="text-xs text-green-700">Incluye descuento de {money(pinMatch.order.discountApplied)}</p>}
            </div>
          )}
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Segmented label="Forma de pago" value={pinMethod} options={METHODS} onChange={setPinMethod} />
            <div className="flex gap-2">
              <button className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-ink transition hover:bg-brand-hover disabled:opacity-50" type="button" disabled={isPinBusy} onClick={() => void confirmPin()}>
                {isPinBusy ? 'Cobrando...' : `Cobrar ${money(pinMatch.payment?.amount ?? pinMatch.order?.totalAmount)}`}
              </button>
              <button className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:text-ink" type="button" onClick={() => setPinMatch(null)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}

      <div className="mt-8">
        <Segmented
          label="Vista de caja"
          value={view}
          options={[['charge', 'Nuevo cobro'], ['queue', `Pendientes${queue ? ` (${queue.total})` : ''}`]] as const}
          onChange={setView}
        />
      </div>

      {view === 'queue' && (
        <Panel
          className="mt-6"
          title="Pendientes por cobrar"
          icon={Clock}
          description="Solicitudes con PIN y pedidos de la app, el más antiguo primero. Se cobran con el PIN del socio."
          actions={<Segmented label="Tipo" value={queueType} options={[['all', 'Todo'], ['membership', 'Membresías'], ['order', 'Pedidos']] as const} onChange={(value) => { setQueueType(value); setQueuePage(1) }} />}
        >
          <input className={inputClass} placeholder="Filtrar por nombre o correo" aria-label="Filtrar pendientes" value={queueSearch} onChange={(event) => { setQueueSearch(event.target.value); setQueuePage(1) }} />
          {queueError && <p className="mt-3 text-sm text-red-700" role="alert">{queueError}</p>}
          {!queue && !queueError && <p className="mt-4 text-sm text-slate-500">Cargando...</p>}
          {queue && queue.items.length === 0 && <div className="mt-4"><EmptyState icon={Inbox} title="Nada pendiente">Las solicitudes y pedidos de la app aparecen aquí.</EmptyState></div>}
          {queue && queue.items.length > 0 && (
            <ul className="mt-4 divide-y divide-slate-100">
              {queue.items.map((item) => (
                <li className="flex items-center gap-3 py-3" key={`${item.kind}-${item.id}`}>
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${item.kind === 'membership' ? 'bg-brand-soft text-brand-text' : 'bg-slate-100 text-slate-600'}`}>
                    {item.kind === 'membership' ? <UserRound size={16} aria-hidden="true" /> : <ShoppingBag size={16} aria-hidden="true" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">{item.client?.name || 'Socio'}</span>
                    <span className="block truncate text-xs text-slate-500">
                      {item.kind === 'membership' ? `Membresía · ${item.planName ?? ''}` : `Pedido · ${item.itemCount ?? 0} producto(s)`}
                      {isAllGyms ? ` · ${item.gym.name}` : ''} · hace {item.ageMinutes < 60 ? `${item.ageMinutes} min` : `${Math.floor(item.ageMinutes / 60)} h`}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-semibold text-ink">{money(item.amount)}</span>
                  <span className="flex shrink-0 gap-1">
                    {item.client && <button className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:text-ink" type="button" onClick={() => item.client && openClient(item.client.id)}>Ver socio</button>}
                    {item.kind === 'order' && (
                      <button className="rounded-lg px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50" type="button" disabled={cancellingOrderId === item.id} onClick={() => void handleCancelOrder(item.id, item.client?.name || 'el socio')}>
                        {cancellingOrderId === item.id ? 'Cancelando...' : 'Cancelar'}
                      </button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {queue && queuePages > 1 && (
            <div className="mt-3 flex items-center justify-between text-sm text-slate-500">
              <button className="rounded-lg px-3 py-1 hover:text-ink disabled:opacity-40" type="button" disabled={queuePage <= 1} onClick={() => setQueuePage((page) => page - 1)}>Anterior</button>
              <span>{queuePage} / {queuePages}</span>
              <button className="rounded-lg px-3 py-1 hover:text-ink disabled:opacity-40" type="button" disabled={queuePage >= queuePages} onClick={() => setQueuePage((page) => page + 1)}>Siguiente</button>
            </div>
          )}
        </Panel>
      )}

      {view === 'charge' && (
        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="min-w-0 space-y-6">
            {/* ---------- Member ---------- */}
            <Panel title="Socio" icon={UserRound} description="Solo se cobra a socios registrados del gimnasio.">
              {!clientId && (
                <div className="relative">
                  <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                  <input className={`${inputClass} pl-9`} placeholder="Escribe nombre, correo o teléfono" aria-label="Buscar socio" value={clientQuery} onChange={(event) => { setClientQuery(event.target.value); if (event.target.value.trim().length < 2) setClientResults(null) }} />
                  {clientResults && clientQuery.trim().length >= 2 && (
                    <ul className="mt-2 max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-100">
                      {clientResults.length === 0 && <li className="px-4 py-3 text-sm text-slate-500">Sin coincidencias.</li>}
                      {clientResults.map((client) => (
                        <li key={client.id}>
                          <button className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50" type="button" onClick={() => openClient(client.id)}>
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">{initials(client.name)}</span>
                            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-ink">{client.name}</span><span className="block truncate text-xs text-slate-500">{client.email}{client.phone ? ` · ${client.phone}` : ''}</span></span>
                            <MembershipBadge status={client.membership?.status} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
              {profileError && <p className="mt-3 text-sm text-red-700" role="alert">{profileError}</p>}
              {clientId && !profile && !profileError && <p className="text-sm text-slate-500">Cargando socio...</p>}
              {profile && (
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-ink text-sm font-semibold text-brand">{initials(profile.client.name)}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2"><p className="truncate text-lg font-semibold text-ink">{profile.client.name}</p><MembershipBadge status={profile.membership?.status} /></div>
                      <p className="truncate text-sm text-slate-500">{profile.client.email}{profile.client.phone ? ` · ${profile.client.phone}` : ''}</p>
                    </div>
                    <button className="shrink-0 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-ink" type="button" onClick={clearClient}>Cambiar</button>
                  </div>
                  {profile.membership && (
                    <dl className="grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-4 text-sm sm:grid-cols-4">
                      <div><dt className="text-xs text-slate-500">Plan</dt><dd className="font-medium text-ink">{profile.membership.planName ?? '—'}</dd></div>
                      <div><dt className="text-xs text-slate-500">Vence</dt><dd className="font-medium text-ink">{shortDate(profile.membership.expiresAt)}</dd></div>
                      <div><dt className="text-xs text-slate-500">Días restantes</dt><dd className="font-medium text-ink">{profile.membership.daysLeft}</dd></div>
                      <div><dt className="text-xs text-slate-500">Documentos</dt><dd className="font-medium text-ink">{profile.documents.filter((document) => document.status === 'verified').length} verificados</dd></div>
                    </dl>
                  )}
                  {pendingPayment && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                      <p className="flex items-center gap-2 font-medium"><AlertTriangle size={16} aria-hidden="true" />Solicitud con PIN pendiente: {pendingPayment.planName} · {money(pendingPayment.amount)}</p>
                      <p className="mt-1 text-amber-800">Cóbrala con el PIN del socio, márcala como reemplazada al cobrar aquí, o cancélala.</p>
                      <button className="mt-2 text-xs font-medium text-amber-900 underline" type="button" onClick={() => void handleCancelPending()}>Cancelar solicitud</button>
                    </div>
                  )}
                  {profile.pendingOrders.length > 0 && (
                    <div className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">
                      <p>{profile.pendingOrders.length} pedido(s) de la app por recoger: se cobran con su PIN.</p>
                      <ul className="mt-2 space-y-1">
                        {profile.pendingOrders.map((order) => (
                          <li className="flex items-center justify-between gap-3" key={order._id}>
                            <span className="min-w-0 truncate">{order.items.map((item) => `${item.productId?.name ?? 'Producto'} ×${item.quantity}`).join(', ')} · {money(order.totalAmount)}</span>
                            <button className="shrink-0 text-xs font-medium text-red-600 hover:underline disabled:opacity-50" type="button" disabled={cancellingOrderId === order._id} onClick={() => void handleCancelOrder(order._id, profile.client.name)}>Cancelar</button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <details className="text-sm">
                    <summary className="cursor-pointer font-medium text-slate-700">Historial comercial</summary>
                    <ul className="mt-2 divide-y divide-slate-100">
                      {[...profile.recentPayments.map((payment) => ({ id: payment._id, date: payment.processedAt ?? payment.createdAt, label: `Membresía · ${payment.planName}`, amount: payment.amount, status: payment.status, method: payment.paymentMethod })),
                        ...profile.recentOrders.map((order) => ({ id: order._id, date: order.createdAt, label: `Tienda · ${order.items.map((item) => `${item.productId?.name ?? 'Producto'} ×${item.quantity}`).join(', ')}`, amount: order.totalAmount, status: order.status, method: order.paymentMethod }))]
                        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                        .map((row) => (
                          <li className="flex items-start justify-between gap-3 py-2" key={row.id}>
                            <span className="min-w-0"><span className="block truncate text-slate-700">{row.label}</span><span className="text-xs text-slate-400">{dateTime(row.date)} · {STATUS_LABELS[row.status] ?? row.status}{row.method ? ` · ${methodLabel(row.method)}` : ''}</span></span>
                            <span className="shrink-0 font-medium text-slate-700">{money(row.amount)}</span>
                          </li>
                        ))}
                      {profile.recentPayments.length + profile.recentOrders.length === 0 && <li className="py-2 text-slate-500">Sin movimientos.</li>}
                    </ul>
                  </details>
                </div>
              )}
            </Panel>

            {/* ---------- Membership ---------- */}
            <Panel title="Membresía" icon={CreditCard} description={profile?.membership?.status === 'active' ? 'Si eliges un plan se cobra como renovación.' : 'Toca un plan para agregarlo al ticket; tócalo otra vez para quitarlo.'}>
              {plans.length === 0 && <p className="text-sm text-slate-500">No hay planes activos.</p>}
              <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
                {plans.map((plan) => {
                  const id = recordId(plan)
                  const isSelected = id === planId
                  return (
                    <button
                      className={`rounded-xl border p-4 text-left transition ${isSelected ? 'border-brand-press bg-brand-soft ring-2 ring-brand' : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-card'}`}
                      type="button"
                      aria-pressed={isSelected}
                      key={id}
                      onClick={() => { setPlanId(isSelected ? '' : id); setMembershipPromotionId(''); setReplacesPending(false) }}
                    >
                      <span className="flex items-start justify-between gap-2">
                        <span className="font-semibold text-ink">{plan.name ?? plan.nombre}</span>
                        {isSelected && <CheckCircle2 size={18} className="shrink-0 text-brand-text" aria-hidden="true" />}
                      </span>
                      <span className="mt-2 block text-2xl font-semibold text-ink">{money(Number(plan.price ?? plan.precio))}</span>
                      <span className="text-xs text-slate-500">{plan.durationInDays} días</span>
                    </button>
                  )
                })}
              </div>
              {planId && quote?.membership && quote.membership.promotions.length > 0 && (
                <div className="mt-4">
                  <p className="mb-2 text-sm font-medium text-slate-700">Promoción de membresía</p>
                  <div className="flex flex-wrap gap-2">
                    <button className={chipClass(!membershipPromotionId)} type="button" onClick={() => setMembershipPromotionId('')}>Sin promoción</button>
                    {quote.membership.promotions.map((option) => (
                      <button className={`${chipClass(membershipPromotionId === option.promotionId)} disabled:cursor-not-allowed disabled:opacity-40`} type="button" key={option.promotionId} disabled={option.eligible === false} title={option.eligible === false ? 'Falta documento verificado' : undefined} onClick={() => setMembershipPromotionId(option.promotionId)}>
                        {option.title} −{option.discountPercentage}% · {money(option.amount)}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {planId && pendingPayment && (
                <label className="mt-4 flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                  <input className="mt-0.5" type="checkbox" checked={replacesPending} onChange={(event) => setReplacesPending(event.target.checked)} />
                  Este cobro reemplaza la solicitud pendiente ({pendingPayment.planName}); su PIN dejará de funcionar.
                </label>
              )}
            </Panel>

            {/* ---------- Products ---------- */}
            <Panel title="Productos" icon={Package} description="Toca un producto para agregarlo. Con el buscador, Enter agrega el único resultado.">
              <div className="relative">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                <input ref={productSearchRef} className={`${inputClass} pl-9`} placeholder="Buscar producto" aria-label="Buscar producto" value={productQuery} onChange={(event) => setProductQuery(event.target.value)} onKeyDown={handleProductSearchKey} />
              </div>
              {categories.length > 1 && (
                <div className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1">
                  <button className={chipClass(!category)} type="button" onClick={() => setCategory('')}>Todos</button>
                  {categories.map((name) => <button className={chipClass(category === name)} type="button" key={name} onClick={() => setCategory(category === name ? '' : name)}>{name}</button>)}
                </div>
              )}
              {needsGym && products.length > 0 && <p className="mt-3 text-sm text-amber-700">Elige la sucursal del cobro en el ticket para ver sus existencias.</p>}
              {visibleProducts.length === 0 && <p className="mt-4 text-sm text-slate-500">{products.length === 0 ? 'No hay productos en el catálogo.' : 'Sin coincidencias.'}</p>}
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                {visibleProducts.map((product) => {
                  const id = recordId(product)
                  const stock = stockOf(product)
                  const inCart = quantityInCart(id)
                  const isOut = stock <= 0
                  const isMaxed = !isOut && inCart >= stock
                  return (
                    <button
                      className={`group relative flex flex-col overflow-hidden rounded-xl border text-left transition ${inCart ? 'border-brand-press ring-2 ring-brand' : 'border-slate-200 hover:border-slate-300 hover:shadow-card'} bg-white disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:shadow-none`}
                      type="button"
                      key={id}
                      disabled={isOut || isMaxed}
                      aria-label={`Agregar ${product.name}`}
                      onClick={() => addProduct(product)}
                    >
                      <span className="flex aspect-[4/3] items-center justify-center bg-slate-50">
                        {product.imageUrl
                          ? <img className="h-full w-full object-cover" src={product.imageUrl} alt="" loading="lazy" />
                          : <Package size={28} className="text-slate-300" aria-hidden="true" />}
                      </span>
                      {inCart > 0 && <span className="absolute right-2 top-2 flex h-7 min-w-7 items-center justify-center rounded-full bg-ink px-2 text-xs font-semibold text-brand">{inCart}</span>}
                      <span className="flex flex-1 flex-col p-3">
                        <span className="line-clamp-2 text-sm font-medium text-ink">{product.name}</span>
                        <span className="mt-auto flex items-end justify-between gap-2 pt-2">
                          <span className="font-semibold text-ink">{money(Number(product.price))}</span>
                          <span className={`text-xs ${isOut ? 'font-medium text-red-600' : stock <= LOW_STOCK ? 'font-medium text-amber-700' : 'text-slate-400'}`}>{isOut ? 'Agotado' : isMaxed ? 'Sin más' : `${stock} disp.`}</span>
                        </span>
                      </span>
                    </button>
                  )
                })}
              </div>
            </Panel>
          </div>

          {/* ---------- Ticket ---------- */}
          <aside ref={ticketRef} className="scroll-mt-4 rounded-card border border-slate-200/80 bg-white p-5 shadow-card lg:sticky lg:top-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-base font-semibold text-ink"><Receipt size={18} className="text-slate-500" aria-hidden="true" />Ticket{ticketCount > 0 ? ` · ${ticketCount}` : ''}</h2>
              {(ticketCount > 0 || clientId) && !result && <button className="text-xs font-medium text-slate-500 hover:text-red-600" type="button" onClick={startOver}>Vaciar</button>}
            </div>

            {result ? (
              <div className="mt-5 text-center" role="status">
                <CheckCircle2 size={44} className="mx-auto text-brand-text" aria-hidden="true" />
                <p className="mt-3 text-lg font-semibold text-ink">Cobro registrado</p>
                <p className="text-3xl font-semibold text-ink">{money(result.total)}</p>
                {result.replayed && <p className="mt-1 text-xs text-amber-700">Ya se había registrado; no se cobró de nuevo.</p>}
                {result.payment && <p className="mt-2 text-sm text-slate-600">Membresía {result.payment.planName}{result.payment.membershipPeriod ? ` hasta ${shortDate(result.payment.membershipPeriod.endsAt)}` : ''}</p>}
                {result.order && <p className="mt-1 text-sm text-slate-600">Productos entregados: {money(result.order.totalAmount)}</p>}
                <p className="mt-2 text-xs text-slate-400">Folio {result.checkoutId.slice(-8).toUpperCase()}</p>
                <div className="mt-5 grid gap-2">
                  <button className="rounded-lg bg-brand px-4 py-3 font-medium text-ink hover:bg-brand-hover" type="button" onClick={() => { startOver(); productSearchRef.current?.focus() }}>Nuevo cobro</button>
                  {profile && <button className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-600 hover:text-ink" type="button" onClick={() => setResult(null)}>Otro cobro a {profile.client.name.split(' ')[0]}</button>}
                </div>
              </div>
            ) : (
              <>
                <div className="mt-4 flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm">
                  <UserRound size={16} className="shrink-0 text-slate-400" aria-hidden="true" />
                  {profile ? <span className="truncate font-medium text-ink">{profile.client.name}</span> : <span className="text-slate-500">Elige un socio para cobrar</span>}
                </div>
                {isAllGyms && <div className="mt-3"><GymSelect id="cashier-gym" label="Sucursal del cobro" value={gymId} onChange={setGymId} /></div>}

                {ticketCount === 0 ? (
                  <div className="mt-6 rounded-lg border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
                    <ShoppingBag size={24} className="mx-auto mb-2 text-slate-300" aria-hidden="true" />
                    Agrega una membresía o productos.
                  </div>
                ) : (
                  <ul className="mt-4 divide-y divide-slate-100">
                    {selectedPlan && (
                      <li className="flex items-center justify-between gap-3 py-2.5 text-sm">
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-ink">{selectedPlan.name ?? selectedPlan.nombre}</span>
                          <span className="text-xs text-slate-500">{quote?.membership ? `${quote.membership.kind === 'renewal' ? 'Renovación' : 'Primera vez'} · ${shortDate(quote.membership.startsAt)} → ${shortDate(quote.membership.expiresAt)}` : `${selectedPlan.durationInDays} días`}</span>
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          <span className="font-medium text-slate-700">{money(quote?.membership?.listPrice ?? Number(selectedPlan.price ?? selectedPlan.precio))}</span>
                          <button className="rounded p-1 text-slate-400 hover:text-red-600" type="button" aria-label="Quitar membresía" onClick={() => { setPlanId(''); setMembershipPromotionId(''); setReplacesPending(false) }}><X size={14} aria-hidden="true" /></button>
                        </span>
                      </li>
                    )}
                    {cart.map((item) => {
                      const line = quote?.store?.items.find((candidate) => candidate.productId === item.productId)
                      const product = productById(item.productId)
                      const atMax = product ? item.quantity >= stockOf(product) : false
                      return (
                        <li className="flex items-center justify-between gap-2 py-2.5 text-sm" key={item.productId}>
                          <span className="min-w-0">
                            <span className="block truncate text-ink">{line?.name ?? product?.name ?? 'Producto'}</span>
                            {line && !line.available && <span className="text-xs font-medium text-red-700">{line.missing ? 'Ya no está en el catálogo' : `Solo hay ${line.stock} en esta sucursal`}</span>}
                            {line?.discountable && quote?.store?.promotion && <span className="text-xs text-green-700">Con promoción</span>}
                          </span>
                          <span className="flex shrink-0 items-center gap-1">
                            <button className="rounded-md border border-slate-200 p-1 text-slate-500 hover:text-ink" type="button" aria-label="Quitar uno" onClick={() => changeQuantity(item.productId, -1)}>{item.quantity === 1 ? <Trash2 size={13} aria-hidden="true" /> : <Minus size={13} aria-hidden="true" />}</button>
                            <span className="w-6 text-center font-medium">{item.quantity}</span>
                            <button className="rounded-md border border-slate-200 p-1 text-slate-500 hover:text-ink disabled:opacity-40" type="button" aria-label="Agregar uno" disabled={atMax} onClick={() => changeQuantity(item.productId, 1)}><Plus size={13} aria-hidden="true" /></button>
                            <span className="w-20 text-right font-medium text-slate-700">{money(line?.subtotal ?? (Number(product?.price) || 0) * item.quantity)}</span>
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                )}

                {cart.length > 0 && storePromotions.length > 0 && (
                  <select className={`${inputClass} mt-3`} aria-label="Promoción de tienda" value={storePromotionId} onChange={(event) => setStorePromotionId(event.target.value)}>
                    <option value="">Sin promoción de tienda</option>
                    {storePromotions.map((promotion) => <option key={recordId(promotion)} value={recordId(promotion)}>{promotion.title} (−{promotion.discountPercentage}%)</option>)}
                  </select>
                )}

                {ticketCount > 0 && (
                  <div className="mt-4 space-y-1.5 border-t border-slate-200 pt-4 text-sm">
                    {quoteError && <p className="text-red-700" role="alert">{quoteError}</p>}
                    {quote && !isQuoting && (
                      <>
                        {quote.membership && quote.membership.discount > 0 && <div className="flex justify-between text-green-700"><span>{quote.membership.promotion?.title ?? 'Promoción'}</span><span>−{money(quote.membership.discount)}</span></div>}
                        {quote.membership?.notices.filter((item) => item.code !== 'pending_payment_exists').map((item) => <p className="text-xs font-medium text-amber-700" key={item.code}>{item.message}</p>)}
                        {quote.store && quote.store.discount > 0 && <div className="flex justify-between text-green-700"><span>{quote.store.promotion?.title}</span><span>−{money(quote.store.discount)}</span></div>}
                        {quote.store?.warnings.map((warning, index) => <p className="text-xs font-medium text-amber-700" key={`${warning.code}-${index}`}>{warning.message}</p>)}
                      </>
                    )}
                    <div className="flex items-end justify-between pt-1">
                      <span className="font-medium text-slate-700">Total{!quote || isQuoting ? ' estimado' : ''}</span>
                      <span className={`text-3xl font-semibold tracking-tight ${quote && !isQuoting ? 'text-ink' : 'text-slate-400'}`}>{money(quote && !isQuoting ? quote.total : estimatedTotal)}</span>
                    </div>
                    {isQuoting && <p className="text-right text-xs text-slate-400">Calculando...</p>}
                  </div>
                )}

                {payload && (
                  <div className="mt-5 space-y-4">
                    <div className="grid grid-cols-3 gap-2" role="group" aria-label="Forma de pago">
                      {METHODS.map(([value, label]) => {
                        const Icon = METHOD_ICONS[value]
                        const isActive = method === value
                        return (
                          <button className={`flex flex-col items-center gap-1 rounded-lg border px-2 py-2.5 text-xs font-medium transition ${isActive ? 'border-ink bg-ink text-white' : 'border-slate-200 text-slate-600 hover:text-ink'}`} type="button" aria-pressed={isActive} key={value} onClick={() => { setMethod(value); setReceived('') }}>
                            <Icon size={18} aria-hidden="true" />{label}
                          </button>
                        )
                      })}
                    </div>

                    {method === 'Cash' && quote && (
                      <div className="rounded-lg bg-slate-50 p-3">
                        <label className="text-xs font-medium text-slate-600" htmlFor="cashier-received">Recibido</label>
                        <input className={`${inputClass} mt-1`} id="cashier-received" type="number" min="0" step="0.01" inputMode="decimal" placeholder={String(quote.total)} value={received} onChange={(event) => setReceived(event.target.value)} />
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <button className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 hover:text-ink" type="button" onClick={() => setReceived(String(quote.total))}>Exacto</button>
                          {cashShortcuts(quote.total).map((bill) => <button className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 hover:text-ink" type="button" key={bill} onClick={() => setReceived(String(bill))}>{money(bill)}</button>)}
                        </div>
                        {received !== '' && (
                          <p className={`mt-2 flex justify-between text-sm font-medium ${cashShort ? 'text-red-700' : 'text-ink'}`}>
                            <span>{cashShort ? 'Faltan' : 'Cambio'}</span><span>{money(Math.abs(receivedAmount - quote.total))}</span>
                          </p>
                        )}
                      </div>
                    )}
                    {method !== 'Cash' && <input className={inputClass} placeholder="Referencia (opcional)" aria-label="Referencia del pago" maxLength={120} value={reference} onChange={(event) => setReference(event.target.value)} />}

                    {needsGym && <p className="text-sm text-amber-700">Elige la sucursal del cobro.</p>}
                    {blockedByPending && <p className="text-sm text-amber-700">Indica si este cobro reemplaza la solicitud pendiente.</p>}
                    {chargeError && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{chargeError}</p>}
                    {!isConfirming ? (
                      <button className="w-full rounded-lg bg-brand px-4 py-3.5 text-base font-semibold text-ink shadow-glow transition hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none" type="button" disabled={!canCharge} onClick={() => { setChargeError(null); setIsConfirming(true) }}>
                        {quote ? `Cobrar ${money(quote.total)}` : 'Cobrar'}
                      </button>
                    ) : (
                      <div className="rounded-lg border border-green-300 bg-green-50 p-4" onKeyDown={(event) => { if (event.key === 'Escape') setIsConfirming(false) }}>
                        <p className="text-sm text-green-900">¿Confirmas el cobro de <strong>{money(quote?.total)}</strong> en {methodLabel(method).toLowerCase()} a {profile?.client.name}?</p>
                        <div className="mt-3 flex gap-2">
                          <button className="flex-1 rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-ink hover:bg-brand-hover disabled:opacity-50" type="button" autoFocus disabled={!canCharge} onClick={() => void charge()}>{isCharging ? 'Cobrando...' : 'Confirmar cobro'}</button>
                          <button className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-600" type="button" disabled={isCharging} onClick={() => setIsConfirming(false)}>Volver</button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {!clientId && ticketCount > 0 && <p className="mt-4 text-sm text-amber-700">Elige al socio para calcular el total y cobrar.</p>}
              </>
            )}
          </aside>

          {/* On a phone the ticket sits below the catalog: keep the total in reach. */}
          {ticketCount > 0 && !result && (
            <div className="h-16 lg:hidden" aria-hidden="true" />
          )}
          {ticketCount > 0 && !result && (
            <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur lg:hidden">
              <button className="flex w-full items-center justify-between gap-3 rounded-lg bg-ink px-4 py-3 text-white" type="button" onClick={() => ticketRef.current?.scrollIntoView({ behavior: 'smooth' })}>
                <span className="text-sm">Ver ticket · {ticketCount}</span>
                <span className="text-lg font-semibold">{money(quote && !isQuoting ? quote.total : estimatedTotal)}</span>
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

export default Cashier
