import { useEffect, useState } from 'react'
import { Minus, Plus, Trash2 } from 'lucide-react'
import { createSale, getProducts, getSales, getUsers, redeemSalePin } from '../services/api'
import type { Sale, SaleItem, SalePayload } from '../services/api'
import { connectSocket, disconnectSocket } from '../services/socket'
import type { Product, User } from '../types'

type SaleResponse = Sale[] | { data?: unknown; sales?: unknown; ventas?: unknown }
type UserResponse = User[] | { data?: unknown; users?: unknown }
type ProductResponse = Product[] | { data?: unknown; products?: unknown }

interface SaleFormItem {
  productId: string
  quantity: number
}

interface SaleFormState {
  userId: string
  status: string
  items: SaleFormItem[]
}

const emptyForm: SaleFormState = { userId: '', status: 'paid', items: [] }

function extractArray<T>(value: unknown, keys: string[]): T[] {
  if (Array.isArray(value)) return value as T[]
  if (!value || typeof value !== 'object') return []
  const record = value as Record<string, unknown>
  const candidate = keys.map((key) => record[key]).find((item) => Array.isArray(item))
    ?? Object.values(record).find((item) => Array.isArray(item))
  return Array.isArray(candidate) ? candidate as T[] : []
}

function recordId(record: { id?: string; _id?: string }) {
  return record.id || record._id || ''
}

function relationId(value: SaleItem['productId'] | Sale['userId'] | undefined) {
  return typeof value === 'string' ? value : value ? recordId(value) : ''
}

function relationName(value: SaleItem['productId'] | Sale['userId'] | undefined) {
  return typeof value === 'object' && value ? value.name || value.nombre : undefined
}

function statusClasses(status: string) {
  switch (status.toLowerCase()) {
    case 'paid':
    case 'pagado':
      return 'bg-green-100 text-green-800'
    case 'pending':
    case 'pendiente':
      return 'bg-yellow-100 text-yellow-800'
    case 'cancelled':
    case 'canceled':
    case 'cancelado':
      return 'bg-red-100 text-red-800'
    default:
      return 'bg-slate-100 text-slate-600'
  }
}

function statusLabel(status: string) {
  const labels: Record<string, string> = { paid: 'Pagado', pending: 'Pendiente', cancelled: 'Cancelado', canceled: 'Cancelado' }
  return labels[status.toLowerCase()] || status || 'Sin estado'
}

function productName(item: SaleItem, products: Product[]) {
  return relationName(item.productId)
    || item.name
    || products.find((product) => recordId(product) === relationId(item.productId))?.name
    || 'Producto sin nombre'
}

function Sales() {
  const [sales, setSales] = useState<Sale[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [form, setForm] = useState<SaleFormState>(emptyForm)
  const [productToAdd, setProductToAdd] = useState('')
  const [quantityToAdd, setQuantityToAdd] = useState('1')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [modalError, setModalError] = useState<string | null>(null)
  const [pin, setPin] = useState('')
  const [isRedeemingPin, setIsRedeemingPin] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  async function refreshSales() {
    const response = await getSales<SaleResponse>()
    setSales(extractArray<Sale>(response, ['data', 'sales', 'ventas']))
  }

  useEffect(() => {
    let isMounted = true
    async function loadData() {
      try {
        const [salesResponse, usersResponse, productsResponse] = await Promise.all([
          getSales<SaleResponse>(), getUsers<UserResponse>(), getProducts<ProductResponse>(),
        ])
        if (!isMounted) return
        setSales(extractArray<Sale>(salesResponse, ['data', 'sales', 'ventas']))
        setUsers(extractArray<User>(usersResponse, ['data', 'users']))
        setProducts(extractArray<Product>(productsResponse, ['data', 'products']))
        setError(null)
      } catch (requestError) {
        if (isMounted) setError(requestError instanceof Error ? requestError.message : 'No se pudieron cargar las ventas.')
      } finally {
        if (isMounted) setIsLoading(false)
      }
    }
    loadData()
    return () => { isMounted = false }
  }, [])

  useEffect(() => {
    const realtimeSocket = connectSocket()
    const refreshFromEvent = () => {
      void refreshSales().catch((requestError: unknown) => {
        setError(requestError instanceof Error ? requestError.message : 'No se pudieron actualizar las ventas.')
      })
    }
    const events = ['sale-created', 'sale-updated', 'sale-deleted', 'sales-updated']
    events.forEach((eventName) => realtimeSocket.on(eventName, refreshFromEvent))

    return () => {
      events.forEach((eventName) => realtimeSocket.off(eventName, refreshFromEvent))
      disconnectSocket()
    }
  }, [])

  function openCreateModal() {
    setForm(emptyForm); setProductToAdd(''); setQuantityToAdd('1'); setModalError(null); setIsModalOpen(true)
  }

  function closeModal() {
    if (isSubmitting) return
    setForm(emptyForm); setModalError(null); setIsModalOpen(false)
  }

  function addProduct() {
    const quantity = Math.max(1, Number(quantityToAdd) || 1)
    if (!productToAdd) return
    setForm((current) => ({ ...current, items: current.items.some((item) => item.productId === productToAdd)
      ? current.items.map((item) => item.productId === productToAdd ? { ...item, quantity: item.quantity + quantity } : item)
      : [...current.items, { productId: productToAdd, quantity }] }))
    setProductToAdd(''); setQuantityToAdd('1')
  }

  function changeQuantity(productId: string, amount: number) {
    setForm((current) => ({ ...current, items: current.items.map((item) => item.productId === productId ? { ...item, quantity: Math.max(1, item.quantity + amount) } : item) }))
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setModalError(null); setIsSubmitting(true)
    try {
      if (!form.userId) throw new Error('Selecciona un usuario.')
      if (form.items.length === 0) throw new Error('Agrega al menos un producto.')
      const payload: SalePayload = { userId: form.userId, items: form.items, status: form.status }
      await createSale(payload)
      await refreshSales(); setError(null); closeModal()
    } catch (requestError) {
      setModalError(requestError instanceof Error ? requestError.message : 'No se pudo guardar la venta.')
    } finally { setIsSubmitting(false) }
  }

  async function handleRedeemPin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!pin.trim()) return
    setIsRedeemingPin(true); setToast(null); setError(null)
    try {
      await redeemSalePin(pin)
      await refreshSales()
      setPin('')
      setToast('Venta cobrada y stock descontado')
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No se pudo canjear el PIN.')
    } finally {
      setIsRedeemingPin(false)
    }
  }

  const formatCurrency = (value: number | string) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(Number(value) || 0)

  return (
    <section className="min-h-screen bg-[#F8FAFC] px-8 py-10">
      <p className="text-sm font-medium uppercase tracking-[0.25em] text-slate-500">Comercial</p>
      <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><h1 className="text-4xl font-semibold tracking-tight text-slate-900">Ventas</h1><p className="mt-3 text-slate-500">Aprueba pedidos y registra ventas directas.</p></div>
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
          <form className="flex gap-2" onSubmit={handleRedeemPin}>
            <input className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-green-500 focus:ring-2 focus:ring-green-100 sm:w-52" type="text" placeholder="Código PIN (Ej. 84X2)" aria-label="Código PIN" value={pin} onChange={(event) => setPin(event.target.value)} />
            <button className="shrink-0 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:border-green-400 hover:text-green-700 disabled:cursor-not-allowed disabled:opacity-50" type="submit" disabled={isRedeemingPin || !pin.trim()}>{isRedeemingPin ? 'Canjeando...' : 'Canjear PIN'}</button>
          </form>
          <button className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#9BFF63] px-4 py-2 font-medium text-[#0F172A] transition hover:bg-[#abff7c]" type="button" onClick={openCreateModal}><Plus size={18} aria-hidden="true" />+ Venta Directa</button>
        </div>
      </div>

      {toast && <div className="mt-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-800" role="status">{toast}</div>}

      <div className="mt-8 overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
        {error && <div className="border-b border-red-100 bg-red-50 px-6 py-4 text-sm text-red-700" role="alert">{error}</div>}
        {isLoading ? <div className="space-y-4 p-6" aria-label="Cargando ventas" aria-busy="true">{Array.from({ length: 5 }).map((_, index) => <div className="grid grid-cols-6 gap-6" key={index}>{Array.from({ length: 6 }).map((__, columnIndex) => <div className="h-4 animate-pulse rounded bg-slate-200" key={columnIndex} />)}</div>)}</div> : (
          <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="border-b border-slate-100 bg-slate-50/80 text-xs uppercase tracking-wider text-slate-500"><tr><th className="px-6 py-4 font-medium">Usuario</th><th className="px-6 py-4 font-medium">Productos</th><th className="px-6 py-4 font-medium">Total</th><th className="px-6 py-4 font-medium">Estado</th><th className="px-6 py-4 font-medium">Fecha</th><th className="px-6 py-4" /></tr></thead><tbody className="divide-y divide-slate-100 text-slate-700">
            {sales.length ? sales.map((sale, index) => { const id = recordId(sale) || `sale-${index}`; const date = sale.createdAt || sale.date; const userName = relationName(sale.userId) || users.find((user) => recordId(user) === relationId(sale.userId))?.name || 'Sin asignar'; const isPending = ['pending', 'pendiente'].includes(sale.status.toLowerCase()); return <tr className="transition-colors hover:bg-slate-50" key={id}><td className="whitespace-nowrap px-6 py-4 font-medium text-slate-900">{userName}</td><td className="min-w-64 px-6 py-4 text-slate-500">{sale.items?.length ? sale.items.map((item) => `${productName(item, products)} x${item.quantity}`).join(', ') : 'Sin productos'}</td><td className="whitespace-nowrap px-6 py-4">{formatCurrency(sale.totalAmount)}</td><td className="px-6 py-4"><span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${statusClasses(sale.status)}`}>{statusLabel(sale.status)}</span></td><td className="whitespace-nowrap px-6 py-4 text-slate-500">{date && !Number.isNaN(new Date(date).getTime()) ? new Intl.DateTimeFormat('es-MX').format(new Date(date)) : 'Sin fecha'}</td><td className="whitespace-nowrap px-6 py-4 text-right text-xs font-medium text-slate-400">{isPending ? 'Requiere PIN' : ''}</td></tr> }) : <tr><td className="px-6 py-10 text-center text-sm text-slate-500" colSpan={6}>No hay ventas registradas.</td></tr>}
          </tbody></table></div>
        )}
      </div>

      {isModalOpen && <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/50 px-4 py-8 backdrop-blur-sm"><div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl"><div className="flex items-start justify-between gap-4"><div><p className="text-sm font-medium uppercase tracking-[0.2em] text-emerald-700">Comercial</p><h2 className="mt-2 text-2xl font-semibold text-slate-900">Venta directa</h2></div><button className="text-2xl leading-none text-slate-400 transition hover:text-slate-700" type="button" aria-label="Cerrar modal" onClick={closeModal}>×</button></div>
        <form className="mt-6 space-y-4" onSubmit={handleSubmit}><div><label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="sale-user">Usuario</label><select className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100" id="sale-user" value={form.userId} onChange={(event) => setForm({ ...form, userId: event.target.value })} required><option value="">Selecciona un usuario</option>{users.map((user, index) => <option key={recordId(user) || `user-${index}`} value={recordId(user)}>{user.name || user.firstName || user.email}</option>)}</select></div>
          <div><label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="sale-product">Productos</label><div className="flex gap-2"><select className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-3 text-slate-900" id="sale-product" value={productToAdd} onChange={(event) => setProductToAdd(event.target.value)}><option value="">Selecciona un producto</option>{products.map((product, index) => <option key={recordId(product) || `product-${index}`} value={recordId(product)}>{product.name} ({product.stock} disponibles)</option>)}</select><input className="w-20 rounded-lg border border-slate-200 px-3 py-3" type="number" min="1" aria-label="Cantidad" value={quantityToAdd} onChange={(event) => setQuantityToAdd(event.target.value)} /><button className="rounded-lg border border-slate-200 px-3 text-slate-600 hover:bg-slate-50" type="button" aria-label="Agregar producto" onClick={addProduct}><Plus size={18} /></button></div><div className="mt-3 space-y-2">{form.items.map((item) => <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm" key={item.productId}><span>{products.find((product) => recordId(product) === item.productId)?.name || item.productId}</span><span className="inline-flex items-center gap-2"><button className="rounded border border-slate-200 p-1" type="button" aria-label="Reducir cantidad" onClick={() => changeQuantity(item.productId, -1)}><Minus size={14} /></button>{item.quantity}<button className="rounded border border-slate-200 p-1" type="button" aria-label="Aumentar cantidad" onClick={() => changeQuantity(item.productId, 1)}><Plus size={14} /></button><button className="ml-1 text-slate-400 hover:text-red-600" type="button" aria-label="Quitar producto" onClick={() => setForm({ ...form, items: form.items.filter((selected) => selected.productId !== item.productId) })}><Trash2 size={15} /></button></span></div>)}</div></div>
          <div><label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="sale-status">Estado</label><select className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-slate-900" id="sale-status" value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}><option value="paid">Pagado</option><option value="pending">Pendiente</option><option value="cancelled">Cancelado</option></select></div>
          {modalError && <p className="text-sm text-red-600" role="alert">{modalError}</p>}<div className="flex justify-end gap-3 pt-2"><button className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100" type="button" onClick={closeModal}>Cancelar</button><button className="rounded-lg bg-[#0F172A] px-4 py-2 text-sm font-medium text-white disabled:opacity-50" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Guardando...' : 'Guardar venta'}</button></div>
        </form></div></div>}
    </section>
  )
}

export default Sales