import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Archive, Boxes, History, ImageIcon, Package, PackageSearch, Pencil, Plus, Search, TriangleAlert, Wallet } from 'lucide-react'
import { createProduct, deleteProduct, getInventoryMovements, getProducts, updateProduct } from '../services/api'
import type { InventoryMovement, Product } from '../types'
import { isValidImageValue } from '../utils/imageValidation'
import GymSelect from '../components/GymSelect'
import { useAuth } from '../store/useAuth'
import { targetGymField } from '../utils/targetGym'
import { useIsOwner } from '../utils/access'
import PageHeader from '../components/ui/PageHeader'
import Panel from '../components/ui/Panel'
import Modal from '../components/ui/Modal'
import KpiCard from '../components/ui/KpiCard'
import Badge, { type BadgeTone } from '../components/ui/Badge'
import EmptyState from '../components/ui/EmptyState'
import Segmented from '../components/ui/Segmented'
import { errorAlert, fieldClass, hintClass, iconButton, labelClass, primaryButton, secondaryButton, tableHeadClass, tdClass, thClass } from '../components/ui/styles'

type ProductsResponse = Product[] | { data?: unknown; products?: unknown }

interface ProductFormState {
  nombre: string
  categoria: string
  precio: string
  stock: string
  imageUrl: string
  gymId: string
}

const categoryOptions = ['Suplementos', 'Ropa', 'Accesorios']
const customCategoryOption = 'other'

const emptyProductForm: ProductFormState = {
  nombre: '',
  categoria: '',
  precio: '',
  stock: '',
  imageUrl: '',
  gymId: '',
}

async function fetchProducts() {
  const response = await getProducts<ProductsResponse>()
  const productsCandidate = Array.isArray(response)
    ? response
    : response?.data || response?.products || []

  return Array.isArray(productsCandidate) ? productsCandidate as Product[] : []
}

// Same threshold Inicio uses for its "stock bajo" count.
const LOW_STOCK = 5

type StockFilter = 'all' | 'low' | 'out'

const MOVEMENT_TYPES: Record<InventoryMovement['type'], { label: string; tone: BadgeTone }> = {
  initial: { label: 'Alta', tone: 'brand' },
  sale: { label: 'Venta', tone: 'info' },
  adjustment: { label: 'Ajuste', tone: 'neutral' },
}

const currency = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' })

function Thumbnail({ product }: { product: Product }) {
  return product.imageUrl ? (
    <img className="h-11 w-11 shrink-0 rounded-xl object-cover ring-1 ring-slate-200" src={product.imageUrl} alt="" />
  ) : (
    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-400">
      <Package size={18} aria-hidden />
    </span>
  )
}

function Inventory() {
  const { isAllGyms, organizationGyms } = useAuth()
  // The catalog (name, price, category, image, new products) is the owner's; a Gerente counts its gym's stock.
  const isOwner = useIsOwner()
  const [stockReason, setStockReason] = useState('')
  const [movementsFor, setMovementsFor] = useState<Product | null>(null)
  const [movements, setMovements] = useState<InventoryMovement[] | null>(null)
  const [movementsError, setMovementsError] = useState<string | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [form, setForm] = useState<ProductFormState>(emptyProductForm)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [modalError, setModalError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  // Inicio links its low-stock count here as ?stock=bajo.
  const [searchParams] = useSearchParams()
  const [stockFilter, setStockFilter] = useState<StockFilter>(searchParams.get('stock') === 'bajo' ? 'low' : 'all')
  const [customCategory, setCustomCategory] = useState('')
  // In the all-gyms view each gym has its own stock, so it is shown per gym and edited from that gym.
  const isStockReadOnly = isAllGyms && editingProduct !== null

  useEffect(() => {
    let isMounted = true

    async function loadProducts() {
      try {
        const productsArray = await fetchProducts()
        if (isMounted) {
          setProducts(productsArray)
          setError(null)
        }
      } catch (requestError) {
        if (isMounted) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : 'No se pudo cargar el inventario.',
          )
        }
      } finally {
        if (isMounted) setIsLoading(false)
      }
    }

    loadProducts()
    return () => {
      isMounted = false
    }
  }, [])

  function openCreateModal() {
    setEditingProduct(null)
    setForm(emptyProductForm)
    setCustomCategory('')
    setModalError(null)
    setIsModalOpen(true)
  }

  function openEditModal(product: Product) {
    const category = product.category || ''
    const isPresetCategory = categoryOptions.includes(category)
    setEditingProduct(product)
    setForm({
      nombre: product.name || '',
      categoria: isPresetCategory ? category : customCategoryOption,
      precio: String(product.price ?? ''),
      stock: String(product.stock ?? ''),
      imageUrl: product.imageUrl || '',
      gymId: '',
    })
    setCustomCategory(isPresetCategory ? '' : category)
    setStockReason('')
    setModalError(null)
    setIsModalOpen(true)
  }

  async function openMovements(product: Product) {
    const productId = product._id || product.id
    if (!productId) return
    setMovementsFor(product)
    setMovements(null)
    setMovementsError(null)
    try {
      const response = await getInventoryMovements({ productId, limit: 50 })
      setMovements(response.movements)
    } catch (requestError) {
      setMovementsError(requestError instanceof Error ? requestError.message : 'No se pudo cargar el historial.')
    }
  }

  function closeModal() {
    if (isSubmitting) return
    setEditingProduct(null)
    setForm(emptyProductForm)
    setCustomCategory('')
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
        name: form.nombre.trim(),
        category: (form.categoria === customCategoryOption ? customCategory : form.categoria).trim(),
        price: Number(form.precio),
        ...(isStockReadOnly ? {} : { stock: Number(form.stock) }),
        // What was on screen when editing started: a sale made meanwhile is reported instead of overwritten.
        ...(editingProduct && !isStockReadOnly ? { stockBefore: Number(editingProduct.stock ?? 0), ...(stockReason.trim() ? { stockReason: stockReason.trim() } : {}) } : {}),
        ...(imageUrl ? { imageUrl } : {}),
        ...(editingProduct ? {} : targetGymField(isAllGyms, form.gymId)),
      }
      if (!payload.category) throw new Error('Selecciona o escribe una categoría.')
      if (imageUrl && !isValidImageValue(imageUrl)) {
        throw new Error('La imagen debe ser una URL http(s) válida o una imagen base64 PNG, JPG, WEBP o GIF.')
      }
      const productId = editingProduct?._id || editingProduct?.id

      if (editingProduct) {
        if (!productId) throw new Error('El producto no tiene un identificador válido.')
        await updateProduct(productId, payload)
      } else {
        await createProduct(payload)
      }

      setProducts(await fetchProducts())
      setError(null)
      setEditingProduct(null)
      setForm(emptyProductForm)
      setCustomCategory('')
      setIsModalOpen(false)
    } catch (requestError) {
      setModalError(
        requestError instanceof Error ? requestError.message : 'No se pudo guardar el producto.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleDelete(product: Product) {
    const productId = product._id || product.id
    if (!productId) {
      setError('No se puede eliminar un producto sin identificador.')
      return
    }
    if (!window.confirm(`¿Descontinuar ${product.name || 'este producto'}? Deja de venderse; su stock, sus pedidos y su historial se conservan.`)) return

    try {
      await deleteProduct(productId)
      setProducts(await fetchProducts())
      setError(null)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No se pudo descontinuar el producto.')
    }
  }

  // In the all-gyms view each gym keeps its own count: a product is low or out when any gym is.
  const quantitiesOf = (product: Product) =>
    isAllGyms && product.stockByGym?.length ? product.stockByGym.map((item) => item.quantity) : [Number(product.stock ?? 0)]
  const totalOf = (product: Product) => quantitiesOf(product).reduce((sum, quantity) => sum + quantity, 0)
  const levelOf = (product: Product): Exclude<StockFilter, 'all'> | 'ok' => {
    const lowest = Math.min(...quantitiesOf(product))
    return lowest <= 0 ? 'out' : lowest <= LOW_STOCK ? 'low' : 'ok'
  }

  // "Stock bajo" counts out-of-stock products too, like Inicio does.
  function matches(product: Product, filter: StockFilter) {
    const level = levelOf(product)
    return filter === 'all' || (filter === 'low' ? level !== 'ok' : level === 'out')
  }

  const categories = [...new Set(products.map((product) => product.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'))
  const query = searchTerm.trim().toLocaleLowerCase()
  const filteredProducts = products.filter((product) =>
    `${product.name} ${product.category}`.toLocaleLowerCase().includes(query)
    && (categoryFilter === '' || product.category === categoryFilter)
    && matches(product, stockFilter),
  )

  const countFor = (filter: StockFilter) => products.filter((product) => matches(product, filter)).length
  const filterOptions = ([['all', 'Todos'], ['low', 'Stock bajo'], ['out', 'Agotados']] as const)
    .map(([value, label]) => [value, `${label} ${countFor(value)}`] as const)
  const totalUnits = products.reduce((sum, product) => sum + totalOf(product), 0)
  const stockValue = products.reduce((sum, product) => sum + totalOf(product) * Number(product.price || 0), 0)
  const lowCount = countFor('low')
  const outCount = countFor('out')
  const isFiltered = query !== '' || categoryFilter !== '' || stockFilter !== 'all'

  function gymName(gymId: string) {
    return organizationGyms.find((gym) => gym.id === String(gymId))?.name ?? 'Sucursal'
  }

  function stockCell(product: Product) {
    const level = levelOf(product)
    const perGym = isAllGyms && product.stockByGym?.length ? product.stockByGym : null
    return (
      <div className="flex flex-col items-start gap-1">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-ink tabular">{totalOf(product)}</span>
          {level === 'out' && <Badge tone="danger">{perGym ? 'Agotado en una sucursal' : 'Agotado'}</Badge>}
          {level === 'low' && <Badge tone="warning">Stock bajo</Badge>}
        </div>
        {perGym && (
          <span className="text-xs text-slate-500">
            {perGym.map((item) => `${gymName(item.gymId)}: ${item.quantity}`).join(' · ')}
          </span>
        )}
      </div>
    )
  }

  const rowActions = (product: Product) => (
    <div className="flex items-center justify-end gap-1">
      <button className={`${iconButton} hover:text-brand-text`} type="button" aria-label={`${isOwner ? 'Editar' : 'Ajustar stock de'} ${product.name || 'producto'}`} title={isOwner ? 'Editar' : 'Ajustar stock'} onClick={() => openEditModal(product)}>
        <Pencil size={17} aria-hidden />
      </button>
      <button className={`${iconButton} hover:text-sky-700`} type="button" aria-label={`Movimientos de ${product.name || 'producto'}`} title="Movimientos de inventario" onClick={() => void openMovements(product)}>
        <History size={17} aria-hidden />
      </button>
      {isOwner && (
        <button className={`${iconButton} hover:bg-red-50 hover:text-red-600`} type="button" aria-label={`Descontinuar ${product.name || 'producto'}`} title="Descontinuar" onClick={() => void handleDelete(product)}>
          <Archive size={17} aria-hidden />
        </button>
      )}
    </div>
  )

  return (
    <section className="min-h-screen bg-canvas px-4 py-8 sm:px-8 sm:py-10">
      <PageHeader
        eyebrow="Operación"
        title="Inventario"
        description={isOwner ? 'Los productos de la tienda, su precio y las unidades de cada sucursal. Caja descuenta el stock al cobrar.' : 'Las unidades de tu sucursal. Ajusta el conteo cuando llegue mercancía o haya merma.'}
        actions={isOwner && (
          <button className={primaryButton} type="button" onClick={openCreateModal}>
            <Plus size={18} aria-hidden /> Nuevo producto
          </button>
        )}
      />

      <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <KpiCard label="Productos" value={products.length} icon={Package} isLoading={isLoading} hint={`${categories.length} categoría${categories.length === 1 ? '' : 's'}`} />
        <KpiCard label="Unidades en stock" value={totalUnits.toLocaleString('es-MX')} icon={Boxes} tone="brand" isLoading={isLoading} hint={isAllGyms ? 'Suma de todas las sucursales' : 'En esta sucursal'} />
        <KpiCard label={`Stock bajo (≤ ${LOW_STOCK})`} value={lowCount} icon={TriangleAlert} tone={lowCount > 0 ? 'warning' : 'default'} isLoading={isLoading} hint={lowCount > 0 ? 'Conviene resurtir' : 'Nada por resurtir'} />
        <KpiCard label="Valor del inventario" value={currency.format(stockValue)} icon={Wallet} isLoading={isLoading} hint={outCount > 0 ? `${outCount} agotado${outCount === 1 ? '' : 's'}` : 'A precio de venta'} />
      </div>

      <Panel
        className="mt-6"
        title="Productos"
        icon={Package}
        description={isLoading ? undefined : isFiltered ? `${filteredProducts.length} de ${products.length} productos` : `${products.length} producto${products.length === 1 ? '' : 's'} a la venta`}
      >
        {error && <p className={`${errorAlert} mb-4`} role="alert">{error}</p>}

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="-mx-1 overflow-x-auto px-1 pb-1">
            <Segmented label="Nivel de stock" value={stockFilter} options={filterOptions} onChange={setStockFilter} />
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="relative block sm:w-64">
              <span className="sr-only">Buscar productos</span>
              <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} aria-hidden />
              <input className={`${fieldClass} pl-10`} type="search" placeholder="Buscar por nombre o categoría" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} />
            </label>
            {categories.length > 1 && (
              <select className={`${fieldClass} sm:w-48`} aria-label="Categoría" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
                <option value="">Todas las categorías</option>
                {categories.map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
            )}
          </div>
        </div>

        <div className="mt-4">
          {isLoading ? (
            <div className="space-y-3" aria-busy="true" aria-label="Cargando productos">
              {Array.from({ length: 5 }).map((_, index) => <div className="skeleton h-14 w-full" key={index} />)}
            </div>
          ) : filteredProducts.length === 0 ? (
            <EmptyState icon={PackageSearch} title={products.length === 0 ? 'Aún no hay productos' : 'Sin productos en esta vista'}>
              {products.length === 0
                ? (isOwner ? 'Agrega suplementos, ropa o accesorios para venderlos en Caja y en la app.' : 'Cuando el propietario agregue productos aparecerán aquí.')
                : 'Cambia la búsqueda o los filtros para ver otros productos.'}
            </EmptyState>
          ) : (
            <>
              {/* Phones: one card per product. */}
              <ul className="space-y-3 md:hidden">
                {filteredProducts.map((product, index) => (
                  <li className="rounded-xl border border-slate-200 p-4" key={product._id || product.id || `product-${index}`}>
                    <div className="flex items-start gap-3">
                      <Thumbnail product={product} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-ink">{product.name || 'Sin nombre'}</p>
                        <p className="truncate text-xs text-slate-500">{product.category || 'Sin categoría'} · {currency.format(Number(product.price || 0))}</p>
                      </div>
                      {rowActions(product)}
                    </div>
                    <div className="mt-3">{stockCell(product)}</div>
                  </li>
                ))}
              </ul>

              {/* Tablets and up: a table. */}
              <div className="-mx-5 hidden overflow-x-auto sm:-mx-6 md:block">
                <table className="min-w-full text-left text-sm">
                  <thead className={tableHeadClass}>
                    <tr>
                      <th className={thClass}>Producto</th>
                      <th className={thClass}>Categoría</th>
                      <th className={`${thClass} text-right`}>Precio</th>
                      <th className={thClass}>Stock</th>
                      <th className={thClass}><span className="sr-only">Acciones</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {filteredProducts.map((product, index) => (
                      <tr className="transition-colors hover:bg-slate-50/70" key={product._id || product.id || `product-${index}`}>
                        <td className={tdClass}>
                          <div className="flex items-center gap-3">
                            <Thumbnail product={product} />
                            <p className="font-semibold text-ink">{product.name || 'Sin nombre'}</p>
                          </div>
                        </td>
                        <td className={tdClass}><Badge>{product.category || 'Sin categoría'}</Badge></td>
                        <td className={`${tdClass} text-right font-medium text-ink tabular`}>{currency.format(Number(product.price || 0))}</td>
                        <td className={tdClass}>{stockCell(product)}</td>
                        <td className={tdClass}>{rowActions(product)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </Panel>

      {isModalOpen && (
        <Modal eyebrow="Inventario" title={editingProduct ? (isOwner ? 'Editar producto' : 'Ajustar stock') : 'Nuevo producto'} onClose={closeModal} size="md">
          {!isOwner && editingProduct && (
            <p className="mb-4 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
              Puedes ajustar el stock de tu sucursal. El nombre, precio, categoría e imagen los cambia el propietario.
            </p>
          )}
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="flex items-center gap-4">
              {form.imageUrl ? (
                <img className="h-16 w-16 shrink-0 rounded-xl object-cover ring-1 ring-slate-200" src={form.imageUrl} alt="Vista previa del producto" />
              ) : (
                <span className="grid h-16 w-16 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-400"><ImageIcon size={22} aria-hidden /></span>
              )}
              <div className="min-w-0 flex-1">
                <label className={labelClass} htmlFor="product-image-file">Imagen del producto</label>
                <input
                  className="block w-full text-sm text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-slate-700 hover:file:bg-slate-200 disabled:opacity-60"
                  id="product-image-file"
                  disabled={!isOwner}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  onChange={handleImageChange}
                />
              </div>
            </div>

            <div>
              <label className={labelClass} htmlFor="product-name">Nombre</label>
              <input className={fieldClass} id="product-name" disabled={!isOwner} type="text" value={form.nombre} onChange={(event) => setForm({ ...form, nombre: event.target.value })} required />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass} htmlFor="product-category">Categoría</label>
                <select className={fieldClass} id="product-category" disabled={!isOwner} value={form.categoria} onChange={(event) => setForm({ ...form, categoria: event.target.value })} required>
                  <option value="">Selecciona una categoría</option>
                  {categoryOptions.map((category) => <option key={category} value={category}>{category}</option>)}
                  <option value={customCategoryOption}>Agregar otra...</option>
                </select>
              </div>
              <div>
                <label className={labelClass} htmlFor="product-price">Precio</label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-slate-400">$</span>
                  <input className={`${fieldClass} pl-7`} id="product-price" disabled={!isOwner} type="number" min="0" step="0.01" value={form.precio} onChange={(event) => setForm({ ...form, precio: event.target.value })} required />
                </div>
              </div>
            </div>

            {form.categoria === customCategoryOption && (
              <div>
                <label className={labelClass} htmlFor="product-custom-category">Nueva categoría</label>
                <input className={fieldClass} id="product-custom-category" disabled={!isOwner} type="text" value={customCategory} onChange={(event) => setCustomCategory(event.target.value)} required />
              </div>
            )}

            {!editingProduct && (
              <GymSelect id="product-gym" label="Sucursal del stock inicial" value={form.gymId} onChange={(gymId) => setForm({ ...form, gymId })} />
            )}

            {isStockReadOnly ? (
              <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">
                El stock se edita por sucursal. Elige una sucursal en el menú lateral para cambiarlo.
              </p>
            ) : (
              <div>
                <label className={labelClass} htmlFor="product-stock">{editingProduct ? 'Unidades en stock' : 'Stock inicial'}</label>
                <input className={fieldClass} id="product-stock" type="number" min="0" step="1" value={form.stock} onChange={(event) => setForm({ ...form, stock: event.target.value })} required />
                {editingProduct && String(editingProduct.stock ?? '') !== form.stock && (
                  <>
                    <input
                      className={`${fieldClass} mt-2`}
                      aria-label="Motivo del ajuste de stock"
                      placeholder="Motivo del ajuste (conteo, merma, llegada de mercancía...)"
                      maxLength={300}
                      value={stockReason}
                      onChange={(event) => setStockReason(event.target.value)}
                    />
                    <p className={hintClass}>El ajuste queda en el historial de movimientos del producto.</p>
                  </>
                )}
              </div>
            )}

            {modalError && <p className={errorAlert} role="alert">{modalError}</p>}

            <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
              <button className={secondaryButton} type="button" onClick={closeModal} disabled={isSubmitting}>Cancelar</button>
              <button className={primaryButton} type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Guardando...' : editingProduct ? 'Guardar cambios' : 'Crear producto'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {movementsFor && (
        <Modal eyebrow="Movimientos de inventario" title={movementsFor.name} onClose={() => setMovementsFor(null)} size="xl">
          {movementsError && <p className={errorAlert} role="alert">{movementsError}</p>}
          {!movements && !movementsError && (
            <div className="space-y-2" aria-busy="true" aria-label="Cargando movimientos">
              {Array.from({ length: 4 }).map((_, index) => <div className="skeleton h-10 w-full" key={index} />)}
            </div>
          )}
          {movements && movements.length === 0 && (
            <EmptyState icon={History} title="Sin movimientos registrados">Las ventas y los ajustes de stock aparecerán aquí.</EmptyState>
          )}
          {movements && movements.length > 0 && (
            <ul className="divide-y divide-slate-100">
              {movements.map((movement) => {
                const type = MOVEMENT_TYPES[movement.type]
                return (
                  <li className="flex items-start gap-3 py-3" key={movement._id}>
                    <span className={`mt-0.5 w-12 shrink-0 text-right font-display text-lg font-bold tabular ${movement.change < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                      {movement.change > 0 ? `+${movement.change}` : movement.change}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={type.tone}>{type.label}</Badge>
                        <span className="text-sm text-slate-500 tabular">{movement.quantityBefore} → {movement.quantityAfter} u.</span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        {new Date(movement.createdAt).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}
                        {' · '}{typeof movement.by === 'object' && movement.by ? movement.by.name : 'Sistema'}
                        {isAllGyms && typeof movement.gymId === 'object' && movement.gymId ? ` · ${movement.gymId.name}` : ''}
                      </p>
                      {movement.reason && <p className="mt-1 text-sm text-slate-600">{movement.reason}</p>}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </Modal>
      )}
    </section>
  )
}

export default Inventory
