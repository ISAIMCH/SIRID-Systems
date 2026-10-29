import { useEffect, useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { createProduct, deleteProduct, getProducts, updateProduct } from '../services/api'
import type { Product } from '../types'
import { isValidImageValue } from '../utils/imageValidation'

type ProductsResponse = Product[] | { data?: unknown; products?: unknown }

interface ProductFormState {
  nombre: string
  categoria: string
  precio: string
  stock: string
  imageUrl: string
}

const categoryOptions = ['Suplementos', 'Ropa', 'Accesorios']
const customCategoryOption = 'other'

const emptyProductForm: ProductFormState = {
  nombre: '',
  categoria: '',
  precio: '',
  stock: '',
  imageUrl: '',
}

async function fetchProducts() {
  const response = await getProducts<ProductsResponse>()
  const productsCandidate = Array.isArray(response)
    ? response
    : response?.data || response?.products || []

  return Array.isArray(productsCandidate) ? productsCandidate as Product[] : []
}

function ProductSkeleton() {
  return (
    <div className="space-y-4 p-6" aria-label="Cargando productos" aria-busy="true">
      {Array.from({ length: 5 }).map((_, index) => (
        <div className="grid grid-cols-5 gap-6" key={index}>
          {Array.from({ length: 5 }).map((__, columnIndex) => (
            <div className="h-4 animate-pulse rounded bg-slate-200" key={columnIndex} />
          ))}
        </div>
      ))}
    </div>
  )
}

function Inventory() {
  const [products, setProducts] = useState<Product[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [form, setForm] = useState<ProductFormState>(emptyProductForm)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [modalError, setModalError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [customCategory, setCustomCategory] = useState('')

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
    })
    setCustomCategory(isPresetCategory ? '' : category)
    setModalError(null)
    setIsModalOpen(true)
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
        stock: Number(form.stock),
        ...(imageUrl ? { imageUrl } : {}),
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
    if (!window.confirm(`¿Eliminar ${product.name || 'este producto'}?`)) return

    try {
      await deleteProduct(productId)
      setProducts(await fetchProducts())
      setError(null)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No se pudo eliminar el producto.')
    }
  }

  const filteredProducts = products.filter((product) =>
    `${product.name} ${product.category}`.toLocaleLowerCase().includes(searchTerm.trim().toLocaleLowerCase()),
  )

  return (
    <section className="flex min-h-screen flex-col gap-6 bg-[#F8FAFC] px-8 py-10">
      <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.25em] text-slate-500">Operación</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-900">Inventario</h1>
          <p className="mt-3 text-slate-500">Administra los productos disponibles en la tienda.</p>
        </div>
        <div className="flex w-full flex-col gap-4 sm:flex-row sm:items-center md:w-auto">
          <input
            className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-green-500 focus:ring-2 focus:ring-green-100 sm:w-64"
            type="search"
            placeholder="Buscar..."
            aria-label="Buscar productos"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
          <button
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-[#9BFF63] px-4 py-2 font-medium text-[#0F172A] transition hover:bg-[#abff7c]"
            type="button"
            onClick={openCreateModal}
          >
            <Plus size={18} aria-hidden="true" />
            Nuevo Producto
          </button>
        </div>
      </div>

      <div className="w-full overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
        {error && (
          <div className="border-b border-red-100 bg-red-50 px-6 py-4 text-sm text-red-700" role="alert">
            {error}
          </div>
        )}

        {isLoading ? (
          <ProductSkeleton />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-100 bg-slate-50/80 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-6 py-4 font-medium">Nombre</th>
                  <th className="px-6 py-4 font-medium">Categoría</th>
                  <th className="px-6 py-4 font-medium">Precio</th>
                  <th className="px-6 py-4 font-medium">Stock</th>
                  <th className="px-6 py-4 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredProducts.length > 0 ? (
                  filteredProducts.map((product, index) => {
                    const productId = product._id || product.id || `product-${index}`
                    return (
                      <tr className="transition-colors hover:bg-slate-50" key={productId}>
                        <td className="whitespace-nowrap px-6 py-4 font-medium text-slate-900">
                          {product.name || 'Sin nombre'}
                        </td>
                        <td className="px-6 py-4 text-slate-500">{product.category || 'Sin categoría'}</td>
                        <td className="px-6 py-4 text-slate-700">${Number(product.price).toFixed(2)}</td>
                        <td className="px-6 py-4 text-slate-500">{product.stock}</td>
                        <td className="px-6 py-4 text-right">
                          <div className="inline-flex items-center gap-3">
                            <button
                              className="cursor-pointer text-slate-400 transition hover:text-green-600"
                              type="button"
                              aria-label={`Editar ${product.name || 'producto'}`}
                              title="Editar"
                              onClick={() => openEditModal(product)}
                            >
                              <Pencil size={17} aria-hidden="true" />
                            </button>
                            <button
                              className="cursor-pointer text-slate-400 transition hover:text-red-600"
                              type="button"
                              aria-label={`Eliminar ${product.name || 'producto'}`}
                              title="Eliminar"
                              onClick={() => handleDelete(product)}
                            >
                              <Trash2 size={17} aria-hidden="true" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })
                ) : (
                  <tr>
                    <td className="px-6 py-10 text-center text-sm text-slate-500" colSpan={5}>
                      {searchTerm ? 'No hay productos que coincidan con la búsqueda.' : 'No hay productos en el inventario.'}
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
                <p className="text-sm font-medium uppercase tracking-[0.2em] text-emerald-700">Inventario</p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-900">
                  {editingProduct ? 'Editar Producto' : 'Nuevo Producto'}
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
                <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="product-name">
                  Nombre
                </label>
                <input
                  className="w-full rounded-lg border border-slate-200 px-4 py-3 text-slate-900 outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-100"
                  id="product-name"
                  type="text"
                  value={form.nombre}
                  onChange={(event) => setForm({ ...form, nombre: event.target.value })}
                  required
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="product-category">
                  Categoría
                </label>
                <select
                  className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-100"
                  id="product-category"
                  value={form.categoria}
                  onChange={(event) => setForm({ ...form, categoria: event.target.value })}
                  required
                >
                  <option value="">Selecciona una categoría</option>
                  {categoryOptions.map((category) => <option key={category} value={category}>{category}</option>)}
                  <option value={customCategoryOption}>Agregar otra...</option>
                </select>
              </div>

              {form.categoria === customCategoryOption && (
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="product-custom-category">
                    Nueva categoría
                  </label>
                  <input
                    className="w-full rounded-lg border border-slate-200 px-4 py-3 text-slate-900 outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-100"
                    id="product-custom-category"
                    type="text"
                    value={customCategory}
                    onChange={(event) => setCustomCategory(event.target.value)}
                    required
                  />
                </div>
              )}

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="product-price">
                  Precio
                </label>
                <input
                  className="w-full rounded-lg border border-slate-200 px-4 py-3 text-slate-900 outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-100"
                  id="product-price"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.precio}
                  onChange={(event) => setForm({ ...form, precio: event.target.value })}
                  required
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="product-stock">
                  Stock
                </label>
                <input
                  className="w-full rounded-lg border border-slate-200 px-4 py-3 text-slate-900 outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-100"
                  id="product-stock"
                  type="number"
                  min="0"
                  step="1"
                  value={form.stock}
                  onChange={(event) => setForm({ ...form, stock: event.target.value })}
                  required
                />
              </div>

              <div>
                {form.imageUrl && (
                  <img
                    className="mb-3 h-24 w-24 rounded-lg object-cover"
                    src={form.imageUrl}
                    alt="Vista previa del producto"
                  />
                )}
                <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="product-image-file">
                  Imagen del producto
                </label>
                <input
                  className="w-full rounded-lg border border-slate-200 px-4 py-3 text-slate-900 outline-none transition file:mr-4 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
                  id="product-image-file"
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  onChange={handleImageChange}
                />
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
                  {isSubmitting ? 'Guardando...' : editingProduct ? 'Actualizar' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  )
}

export default Inventory