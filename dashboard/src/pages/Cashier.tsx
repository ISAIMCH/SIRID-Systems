import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, Clock, Inbox, KeyRound, Minus, Plus, Search, ShoppingBag, Trash2, UserRound } from 'lucide-react'
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
const methodLabel = (method?: string) => METHODS.find(([value]) => value === method)?.[1] ?? method ?? '—'

const MEMBERSHIP_LABELS: Record<string, { label: string; className: string }> = {
  active: { label: 'Activa', className: 'bg-green-100 text-green-800' },
  pending: { label: 'Sin activar', className: 'bg-slate-100 text-slate-600' },
  expired: { label: 'Vencida', className: 'bg-red-100 text-red-800' },
  suspended: { label: 'Suspendida', className: 'bg-amber-100 text-amber-800' },
}
const STATUS_LABELS: Record<string, string> = { paid: 'Pagado', pending: 'Pendiente', cancelled: 'Cancelado', reverted: 'Revertido', failed: 'Fallido' }

function MembershipBadge({ status }: { status?: string | null }) {
  const view = MEMBERSHIP_LABELS[status ?? ''] ?? { label: 'Sin membresía', className: 'bg-slate-100 text-slate-600' }
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${view.className}`}>{view.label}</span>
}

function listFrom<T>(value: unknown, key: string): T[] {
  if (Array.isArray(value)) return value as T[]
  const candidate = value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : null
  return Array.isArray(candidate) ? candidate as T[] : []
}
const recordId = (record: { id?: string; _id?: string }) => record.id || record._id || ''
const fullName = (user: { name?: string; lastName?: string } | null | undefined) => [user?.name, user?.lastName].filter(Boolean).join(' ') || 'Socio'

interface CartItem { productId: string; quantity: number }

function Cashier() {
  const { isAllGyms } = useAuth()
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

  // Charge
  const [planId, setPlanId] = useState('')
  const [membershipPromotionId, setMembershipPromotionId] = useState('')
  const [replacesPending, setReplacesPending] = useState(false)
  const [cart, setCart] = useState<CartItem[]>([])
  const [productToAdd, setProductToAdd] = useState('')
  const [storePromotionId, setStorePromotionId] = useState('')
  const [method, setMethod] = useState<CashierPaymentMethod>('Cash')
  const [reference, setReference] = useState('')
  const [quoteState, setQuoteState] = useState<{ key: string; quote: CheckoutQuote | null; error: string | null } | null>(null)
  const [isConfirming, setIsConfirming] = useState(false)
  const [isCharging, setIsCharging] = useState(false)
  const [chargeError, setChargeError] = useState<string | null>(null)
  const [checkoutKey, setCheckoutKey] = useState(newIdempotencyKey)
  const [result, setResult] = useState<CheckoutResult | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true
    Promise.all([getPlans(), getProducts(), getPromotions('store')])
      .then(([planResponse, productResponse, promotionResponse]) => {
        if (!isMounted) return
        setPlans(listFrom<Plan>(planResponse, 'plans').filter((plan) => plan.isActive !== false))
        setProducts(listFrom<Product>(productResponse, 'products'))
        setStorePromotions(listFrom<Promotion>(promotionResponse, 'promotions').filter((promotion) => (promotion.state ?? (promotion.isActive ? 'active' : 'inactive')) === 'active'))
      })
      .catch((error: unknown) => { if (isMounted) setCatalogError(errorText(error, 'No se pudo cargar el catálogo.')) })
    return () => { isMounted = false }
  }, [])

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

  // Another desk, the app or a PIN changes the queue and the open profile.
  useEffect(() => {
    const refresh = () => {
      void loadQueue()
      if (clientId) void loadProfile(clientId)
    }
    const events = ['payment-updated', 'sale-updated']
    events.forEach((name) => socket.on(name, refresh))
    return () => { events.forEach((name) => socket.off(name, refresh)) }
  }, [loadQueue, loadProfile, clientId])

  function openClient(id: string) {
    setClientId(id)
    setProfile(null)
    setClientResults(null)
    setPlanId('')
    setMembershipPromotionId('')
    setReplacesPending(false)
    setCart([])
    setStorePromotionId('')
    setReference('')
    setResult(null)
    setChargeError(null)
    setIsConfirming(false)
    setCheckoutKey(newIdempotencyKey())
    void loadProfile(id)
  }

  async function handleClientSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (clientQuery.trim().length < 2) return
    try {
      setClientResults((await searchCashierClients(clientQuery)).clients)
      setProfileError(null)
    } catch (error) {
      setProfileError(errorText(error, 'No se pudo buscar.'))
    }
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
  const canCharge = Boolean(quote) && !isQuoting && !blockedByPending && !storeUnavailable && !isCharging

  async function charge() {
    if (!payload || !quote) return
    setIsCharging(true); setChargeError(null)
    try {
      const response = await checkoutCashier({ ...payload, ...targetGymField(isAllGyms, gymId), paymentMethod: method, expectedTotal: quote.total, ...(reference.trim() ? { reference: reference.trim() } : {}) }, checkoutKey)
      setResult(response)
      setCheckoutKey(newIdempotencyKey())
      setPlanId(''); setMembershipPromotionId(''); setReplacesPending(false); setCart([]); setStorePromotionId(''); setReference('')
      setIsConfirming(false)
      void loadQueue()
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

  function addProduct() {
    if (!productToAdd) return
    setCart((current) => current.some((item) => item.productId === productToAdd)
      ? current.map((item) => item.productId === productToAdd ? { ...item, quantity: item.quantity + 1 } : item)
      : [...current, { productId: productToAdd, quantity: 1 }])
    setProductToAdd('')
  }

  function changeQuantity(productId: string, delta: number) {
    setCart((current) => current.map((item) => item.productId === productId ? { ...item, quantity: Math.max(1, item.quantity + delta) } : item))
  }

  const productName = (id: string) => products.find((product) => recordId(product) === id)?.name ?? 'Producto'
  const queuePages = queue ? Math.max(1, Math.ceil(queue.total / queue.limit)) : 1
  const inputClass = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-green-500 focus:ring-2 focus:ring-green-100'

  return (
    <section className="min-h-screen bg-canvas px-4 py-8 sm:px-8 sm:py-10">
      <p className="text-sm font-medium uppercase tracking-[0.25em] text-slate-500">Comercial</p>
      <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight text-slate-900">Caja</h1>
          <p className="mt-3 text-slate-500">Cobra membresías y productos a socios. Los precios y promociones los calcula el sistema.</p>
        </div>
        <form className="flex gap-2" onSubmit={handlePinLookup}>
          <input className={`${inputClass} sm:w-56`} placeholder="PIN (5 dígitos o 4 caracteres)" aria-label="PIN del socio" value={pin} maxLength={5} onChange={(event) => setPin(event.target.value)} />
          <button className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:border-green-400 hover:text-green-700 disabled:opacity-50" type="submit" disabled={isPinBusy || !pin.trim()}>
            <KeyRound size={16} aria-hidden="true" />Buscar PIN
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

      <div className="mt-8 grid gap-6 xl:grid-cols-5">
        <Panel
          className="xl:col-span-2"
          title="Pendientes por cobrar"
          icon={Clock}
          description="Solicitudes con PIN y pedidos de la app, el más antiguo primero."
          actions={<Segmented label="Tipo" value={queueType} options={[['all', 'Todo'], ['membership', 'Membresías'], ['order', 'Pedidos']] as const} onChange={(value) => { setQueueType(value); setQueuePage(1) }} />}
        >
          <input className={inputClass} placeholder="Filtrar por nombre o correo" aria-label="Filtrar cola" value={queueSearch} onChange={(event) => { setQueueSearch(event.target.value); setQueuePage(1) }} />
          {queueError && <p className="mt-3 text-sm text-red-700" role="alert">{queueError}</p>}
          {!queue && !queueError && <p className="mt-4 text-sm text-slate-500">Cargando...</p>}
          {queue && queue.items.length === 0 && <div className="mt-4"><EmptyState icon={Inbox} title="Nada pendiente">Las solicitudes y pedidos de la app aparecen aquí.</EmptyState></div>}
          {queue && queue.items.length > 0 && (
            <ul className="mt-4 divide-y divide-slate-100">
              {queue.items.map((item) => (
                <li key={`${item.kind}-${item.id}`}>
                  <button className="flex w-full items-start justify-between gap-3 py-3 text-left transition hover:bg-slate-50" type="button" disabled={!item.client} onClick={() => item.client && openClient(item.client.id)}>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-ink">{item.client?.name || 'Socio'}</span>
                      <span className="block truncate text-xs text-slate-500">
                        {item.kind === 'membership' ? `Membresía · ${item.planName ?? ''}` : `Pedido · ${item.itemCount ?? 0} producto(s)`}
                        {isAllGyms ? ` · ${item.gym.name}` : ''}
                      </span>
                      <span className="block text-xs text-slate-400">hace {item.ageMinutes < 60 ? `${item.ageMinutes} min` : `${Math.floor(item.ageMinutes / 60)} h`} · pide el PIN al socio</span>
                    </span>
                    <span className="shrink-0 text-sm font-semibold text-ink">{money(item.amount)}</span>
                  </button>
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

        <div className="space-y-6 xl:col-span-3">
          <Panel title="Socio" icon={UserRound} description="Solo se cobra a socios registrados del gimnasio.">
            <form className="flex gap-2" onSubmit={handleClientSearch}>
              <input className={inputClass} placeholder="Nombre, correo o teléfono" aria-label="Buscar socio" value={clientQuery} onChange={(event) => setClientQuery(event.target.value)} />
              <button className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:text-ink" type="submit"><Search size={16} aria-hidden="true" />Buscar</button>
            </form>
            {clientResults && (
              <ul className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-100">
                {clientResults.length === 0 && <li className="px-4 py-3 text-sm text-slate-500">Sin coincidencias.</li>}
                {clientResults.map((client) => (
                  <li key={client.id}>
                    <button className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50" type="button" onClick={() => openClient(client.id)}>
                      <span className="min-w-0"><span className="block truncate text-sm font-medium text-ink">{client.name}</span><span className="block truncate text-xs text-slate-500">{client.email}{client.phone ? ` · ${client.phone}` : ''}</span></span>
                      <MembershipBadge status={client.membership?.status} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {profileError && <p className="mt-3 text-sm text-red-700" role="alert">{profileError}</p>}
            {clientId && !profile && !profileError && <p className="mt-4 text-sm text-slate-500">Cargando socio...</p>}
            {profile && (
              <div className="mt-5 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-semibold text-ink">{profile.client.name}</p>
                    <p className="text-sm text-slate-500">{profile.client.email}{profile.client.phone ? ` · ${profile.client.phone}` : ''}</p>
                  </div>
                  <MembershipBadge status={profile.membership?.status} />
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
                  <p className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">{profile.pendingOrders.length} pedido(s) de la app pendiente(s) de recoger: se cobran con su PIN.</p>
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

          {profile && (
            <Panel title="Cobro" icon={ShoppingBag} description="Membresía y productos en un solo cobro: se guarda todo o nada.">
              <div className="grid gap-4 sm:grid-cols-2">
                <GymSelect id="cashier-gym" value={gymId} onChange={setGymId} />
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="cashier-plan">Membresía</label>
                  <select className={inputClass} id="cashier-plan" value={planId} onChange={(event) => { setPlanId(event.target.value); setMembershipPromotionId('') }}>
                    <option value="">Sin membresía</option>
                    {plans.map((plan) => <option key={recordId(plan)} value={recordId(plan)}>{plan.name ?? plan.nombre} · {money(Number(plan.price ?? plan.precio))} · {plan.durationInDays} días</option>)}
                  </select>
                </div>
                {planId && quote?.membership && quote.membership.promotions.length > 0 && (
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="cashier-plan-promo">Promoción de membresía</label>
                    <select className={inputClass} id="cashier-plan-promo" value={membershipPromotionId} onChange={(event) => setMembershipPromotionId(event.target.value)}>
                      <option value="">Sin promoción</option>
                      {quote.membership.promotions.map((option) => (
                        <option key={option.promotionId} value={option.promotionId} disabled={option.eligible === false}>
                          {option.title} (−{option.discountPercentage}%) · {money(option.amount)}{option.eligible === false ? ' · falta documento' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
              {planId && pendingPayment && (
                <label className="mt-4 flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                  <input className="mt-0.5" type="checkbox" checked={replacesPending} onChange={(event) => setReplacesPending(event.target.checked)} />
                  Este cobro reemplaza la solicitud pendiente ({pendingPayment.planName}); su PIN dejará de funcionar.
                </label>
              )}

              <div className="mt-5">
                <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="cashier-product">Productos</label>
                <div className="flex gap-2">
                  <select className={inputClass} id="cashier-product" value={productToAdd} onChange={(event) => setProductToAdd(event.target.value)}>
                    <option value="">Selecciona un producto</option>
                    {products.map((product) => <option key={recordId(product)} value={recordId(product)}>{product.name} · {money(Number(product.price))}</option>)}
                  </select>
                  <button className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-700 hover:text-ink disabled:opacity-40" type="button" disabled={!productToAdd} onClick={addProduct}><Plus size={16} aria-hidden="true" />Agregar</button>
                </div>
                {cart.length > 0 && (
                  <ul className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-100">
                    {cart.map((item) => {
                      const line = quote?.store?.items.find((candidate) => candidate.productId === item.productId)
                      return (
                        <li className="flex items-center justify-between gap-3 px-4 py-2 text-sm" key={item.productId}>
                          <span className="min-w-0">
                            <span className="block truncate text-slate-700">{line?.name ?? productName(item.productId)}</span>
                            {line && !line.available && <span className="text-xs font-medium text-red-700">{line.missing ? 'Ya no está en el catálogo' : `Solo hay ${line.stock} en esta sucursal`}</span>}
                            {line?.discountable && quote?.store?.promotion && <span className="text-xs text-green-700">Con promoción</span>}
                          </span>
                          <span className="flex shrink-0 items-center gap-2">
                            <button className="rounded p-1 text-slate-400 hover:text-ink" type="button" aria-label="Quitar uno" onClick={() => changeQuantity(item.productId, -1)}><Minus size={14} aria-hidden="true" /></button>
                            <span className="w-6 text-center">{item.quantity}</span>
                            <button className="rounded p-1 text-slate-400 hover:text-ink" type="button" aria-label="Agregar uno" onClick={() => changeQuantity(item.productId, 1)}><Plus size={14} aria-hidden="true" /></button>
                            <span className="w-20 text-right font-medium text-slate-700">{line ? money(line.subtotal) : '—'}</span>
                            <button className="rounded p-1 text-slate-400 hover:text-red-600" type="button" aria-label="Quitar producto" onClick={() => setCart((current) => current.filter((candidate) => candidate.productId !== item.productId))}><Trash2 size={14} aria-hidden="true" /></button>
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
              </div>

              {(quote || isQuoting || quoteError) && (
                <div className="mt-6 rounded-lg border border-slate-200 p-4">
                  {quoteError && <p className="text-sm text-red-700" role="alert">{quoteError}</p>}
                  {isQuoting && <p className="text-sm text-slate-500">Calculando...</p>}
                  {quote && !isQuoting && (
                    <div className="space-y-3 text-sm">
                      {quote.membership && (
                        <div>
                          <div className="flex justify-between"><span className="text-slate-700">{quote.membership.plan.name} ({quote.membership.kind === 'renewal' ? 'renovación' : 'primera vez'})</span><span>{money(quote.membership.listPrice)}</span></div>
                          {quote.membership.discount > 0 && <div className="flex justify-between text-green-700"><span>{quote.membership.promotion?.title ?? 'Promoción'}</span><span>−{money(quote.membership.discount)}</span></div>}
                          <p className="text-xs text-slate-500">Vigencia: {shortDate(quote.membership.startsAt)} → {shortDate(quote.membership.expiresAt)}</p>
                          {quote.membership.notices.filter((item) => item.code !== 'pending_payment_exists').map((item) => <p className="mt-1 text-xs font-medium text-amber-700" key={item.code}>{item.message}</p>)}
                        </div>
                      )}
                      {quote.store && (
                        <div>
                          <div className="flex justify-between"><span className="text-slate-700">Productos</span><span>{money(quote.store.subtotal)}</span></div>
                          {quote.store.discount > 0 && <div className="flex justify-between text-green-700"><span>{quote.store.promotion?.title}</span><span>−{money(quote.store.discount)}</span></div>}
                          {quote.store.warnings.map((warning, index) => <p className="mt-1 text-xs font-medium text-amber-700" key={`${warning.code}-${index}`}>{warning.message}</p>)}
                        </div>
                      )}
                      <div className="flex items-end justify-between border-t border-slate-200 pt-3"><span className="font-medium text-slate-700">Total</span><span className="text-2xl font-semibold text-ink">{money(quote.total)}</span></div>
                    </div>
                  )}
                </div>
              )}

              {payload && (
                <div className="mt-5 space-y-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <Segmented label="Forma de pago" value={method} options={METHODS} onChange={setMethod} />
                    {method !== 'Cash' && <input className={inputClass} placeholder="Referencia (opcional)" aria-label="Referencia del pago" maxLength={120} value={reference} onChange={(event) => setReference(event.target.value)} />}
                  </div>
                  {needsGym && <p className="text-sm text-amber-700">Elige la sucursal del cobro.</p>}
                  {blockedByPending && <p className="text-sm text-amber-700">Indica si este cobro reemplaza la solicitud pendiente.</p>}
                  {chargeError && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{chargeError}</p>}
                  {!isConfirming ? (
                    <button className="w-full rounded-lg bg-brand px-4 py-3 font-medium text-ink transition hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50" type="button" disabled={!canCharge} onClick={() => { setChargeError(null); setIsConfirming(true) }}>
                      {quote ? `Cobrar ${money(quote.total)}` : 'Cobrar'}
                    </button>
                  ) : (
                    <div className="rounded-lg border border-green-300 bg-green-50 p-4">
                      <p className="text-sm text-green-900">¿Confirmas el cobro de <strong>{money(quote?.total)}</strong> en {methodLabel(method).toLowerCase()} a {profile.client.name}?</p>
                      <div className="mt-3 flex gap-2">
                        <button className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-ink hover:bg-brand-hover disabled:opacity-50" type="button" disabled={!canCharge} onClick={() => void charge()}>{isCharging ? 'Cobrando...' : 'Confirmar cobro'}</button>
                        <button className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600" type="button" disabled={isCharging} onClick={() => setIsConfirming(false)}>Volver</button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {result && (
                <div className="mt-5 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-900" role="status">
                  <p className="flex items-center gap-2 font-medium"><CheckCircle2 size={16} aria-hidden="true" />Cobro registrado: {money(result.total)}{result.replayed ? ' (ya se había registrado; no se cobró de nuevo)' : ''}</p>
                  {result.payment && <p className="mt-1">Membresía {result.payment.planName}{result.payment.membershipPeriod ? ` hasta ${shortDate(result.payment.membershipPeriod.endsAt)}` : ''}.</p>}
                  {result.order && <p className="mt-1">Productos entregados: {money(result.order.totalAmount)}.</p>}
                  <p className="mt-1 text-xs text-green-800">Folio {result.checkoutId.slice(-8).toUpperCase()}</p>
                </div>
              )}
            </Panel>
          )}
        </div>
      </div>
    </section>
  )
}

export default Cashier
