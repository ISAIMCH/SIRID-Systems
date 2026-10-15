import { useEffect, useState } from 'react'
import { AlertTriangle, Pencil, Plus, Trash2 } from 'lucide-react'
import { createEquipment, deleteEquipment, getEquipment, updateEquipment } from '../services/api'
import type { EquipmentPayload } from '../services/api'
import type { Equipment, EquipmentStatus } from '../types'

type EquipmentResponse = Equipment[] | { data?: unknown; equipment?: unknown }

interface EquipmentFormState {
  nombre: string
  zona: string
  marca: string
  tipo: string
  cantidadTotal: string
  cantidadMantenimiento: string
  estado: EquipmentStatus
}

const zoneOptions = ['Zona de piernas', 'Peso libre', 'Cardio']
const customZoneOption = 'other'
const equipmentStatusMap: Record<string, EquipmentPayload['status']> = {
  operativo: 'available',
  operational: 'available',
  available: 'available',
  mantenimiento: 'maintenance',
  maintenance: 'maintenance',
  'en mantenimiento': 'maintenance',
  averiado: 'unavailable',
  broken: 'unavailable',
  unavailable: 'unavailable',
  'fuera de servicio': 'unavailable',
}
const equipmentTypeMap: Record<string, string> = {
  cardio: 'cardio',
  fuerza: 'strength',
  strength: 'strength',
}

const emptyEquipmentForm: EquipmentFormState = {
  nombre: '',
  zona: '',
  marca: '',
  tipo: 'Cardio',
  cantidadTotal: '1',
  cantidadMantenimiento: '0',
  estado: 'operational',
}

async function fetchEquipment() {
  const response = await getEquipment<EquipmentResponse>()
  const equipmentCandidate = Array.isArray(response)
    ? response
    : response?.data || response?.equipment || []

  return Array.isArray(equipmentCandidate) ? equipmentCandidate as Equipment[] : []
}

function EquipmentSkeleton() {
  return (
    <div className="space-y-4 p-6" aria-label="Cargando equipo" aria-busy="true">
      {Array.from({ length: 5 }).map((_, index) => (
        <div className="grid grid-cols-9 gap-6" key={index}>
          {Array.from({ length: 9 }).map((__, columnIndex) => (
            <div className="h-4 animate-pulse rounded bg-slate-200" key={columnIndex} />
          ))}
        </div>
      ))}
    </div>
  )
}

function Equipment() {
  const [equipment, setEquipment] = useState<Equipment[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingEquipment, setEditingEquipment] = useState<Equipment | null>(null)
  const [form, setForm] = useState<EquipmentFormState>(emptyEquipmentForm)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [modalError, setModalError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [customZone, setCustomZone] = useState('')

  useEffect(() => {
    let isMounted = true

    async function loadEquipment() {
      try {
        const equipmentArray = await fetchEquipment()
        if (isMounted) {
          setEquipment(equipmentArray)
          setError(null)
        }
      } catch (requestError) {
        if (isMounted) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : 'No se pudo cargar el equipo.',
          )
        }
      } finally {
        if (isMounted) setIsLoading(false)
      }
    }

    loadEquipment()
    return () => {
      isMounted = false
    }
  }, [])

  function openCreateModal() {
    setEditingEquipment(null)
    setForm(emptyEquipmentForm)
    setCustomZone('')
    setModalError(null)
    setIsModalOpen(true)
  }

  function openEditModal(item: Equipment) {
    const zone = item.zone || ''
    const isPresetZone = zoneOptions.includes(zone)
    setEditingEquipment(item)
    setForm({
      nombre: item.name || '',
      zona: isPresetZone ? zone : customZoneOption,
      marca: item.brand || '',
      tipo: item.type || 'Cardio',
      cantidadTotal: String(item.totalQuantity ?? 1),
      cantidadMantenimiento: String(item.maintenanceQuantity ?? 0),
      estado: item.status || 'operational',
    })
    setCustomZone(isPresetZone ? '' : zone)
    setModalError(null)
    setIsModalOpen(true)
  }

  function closeModal() {
    if (isSubmitting) return
    setEditingEquipment(null)
    setForm(emptyEquipmentForm)
    setCustomZone('')
    setModalError(null)
    setIsModalOpen(false)
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setModalError(null)
    setIsSubmitting(true)

    try {
      const payload: EquipmentPayload = {
        name: form.nombre.trim(),
        zone: (form.zona === customZoneOption ? customZone : form.zona).trim(),
        brand: form.marca.trim(),
        type: equipmentTypeMap[form.tipo.trim().toLowerCase()] || form.tipo.trim().toLowerCase(),
        totalQuantity: Number(form.cantidadTotal),
        maintenanceQuantity: Number(form.cantidadMantenimiento),
        status: equipmentStatusMap[form.estado.trim().toLowerCase()],
      }
      if (!payload.status) throw new Error('Selecciona un estado válido para el equipo.')
      if (!payload.zone) throw new Error('Selecciona o escribe una zona.')
      const equipmentId = editingEquipment?._id || editingEquipment?.id

      if (editingEquipment) {
        if (!equipmentId) throw new Error('El equipo no tiene un identificador válido.')
        await updateEquipment(equipmentId, payload)
      } else {
        await createEquipment(payload)
      }

      setEquipment(await fetchEquipment())
      setError(null)
      setEditingEquipment(null)
      setForm(emptyEquipmentForm)
      setCustomZone('')
      setIsModalOpen(false)
    } catch (requestError) {
      setModalError(
        requestError instanceof Error ? requestError.message : 'No se pudo guardar el equipo.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleDelete(item: Equipment) {
    const equipmentId = item._id || item.id
    if (!equipmentId) {
      setError('No se puede eliminar un equipo sin identificador.')
      return
    }
    if (!window.confirm(`¿Eliminar ${item.name || 'este equipo'}?`)) return

    try {
      await deleteEquipment(equipmentId)
      setEquipment(await fetchEquipment())
      setError(null)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No se pudo eliminar el equipo.')
    }
  }

  function statusLabel(status: EquipmentStatus) {
    if (status === 'maintenance') return 'Mantenimiento'
    if (status === 'broken') return 'Averiado'
    return 'Operativo'
  }

  function statusClass(status: EquipmentStatus) {
    if (status === 'maintenance') return 'bg-amber-100 text-amber-800'
    if (status === 'broken') return 'bg-red-100 text-red-800'
    return 'bg-green-100 text-green-800'
  }

  const filteredEquipment = equipment.filter((item) =>
    `${item.name} ${item.zone} ${item.brand} ${item.type || ''}`
      .toLocaleLowerCase()
      .includes(searchTerm.trim().toLocaleLowerCase()),
  )

  return (
    <section className="min-h-screen bg-[#F8FAFC] px-8 py-10">
      <p className="text-sm font-medium uppercase tracking-[0.25em] text-slate-500">Operación</p>
      <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight text-slate-900">Equipo</h1>
          <p className="mt-3 text-slate-500">Controla el estado y mantenimiento del equipo del gimnasio.</p>
        </div>
        <button
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#9BFF63] px-4 py-2 font-medium text-[#0F172A] transition hover:bg-[#abff7c]"
          type="button"
          onClick={openCreateModal}
        >
          <Plus size={18} aria-hidden="true" />
          Nuevo Equipo
        </button>
      </div>

      <div className="mt-8 overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
        {error && (
          <div className="border-b border-red-100 bg-red-50 px-6 py-4 text-sm text-red-700" role="alert">
            {error}
          </div>
        )}

        <div className="border-b border-slate-100 p-4">
          <input
            className="w-full max-w-sm rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-green-500 focus:ring-2 focus:ring-green-100"
            type="search"
            placeholder="Buscar..."
            aria-label="Buscar equipo"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
        </div>

        {isLoading ? (
          <EquipmentSkeleton />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-100 bg-slate-50/80 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-6 py-4 font-medium">Nombre</th>
                  <th className="px-6 py-4 font-medium">Zona</th>
                  <th className="px-6 py-4 font-medium">Marca</th>
                  <th className="px-6 py-4 font-medium">Tipo</th>
                  <th className="px-6 py-4 font-medium">Cantidades</th>
                  <th className="px-6 py-4 font-medium">Estado</th>
                  <th className="px-6 py-4 font-medium">Reportes</th>
                  <th className="px-6 py-4 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredEquipment.length > 0 ? (
                  filteredEquipment.map((item, index) => {
                    const equipmentId = item._id || item.id || `equipment-${index}`
                    const hasActiveReports = (item.activeReportsCount || 0) > 0

                    return (
                      <tr className="transition-colors hover:bg-slate-50" key={equipmentId}>
                        <td className="whitespace-nowrap px-6 py-4 font-medium text-slate-900">
                          {item.name || 'Sin nombre'}
                        </td>
                        <td className="px-6 py-4 text-slate-500">{item.zone || 'Sin zona'}</td>
                        <td className="px-6 py-4 text-slate-500">{item.brand || 'Sin marca'}</td>
                        <td className="px-6 py-4 text-slate-500">{item.type || 'Sin tipo'}</td>
                        <td className="whitespace-nowrap px-6 py-4 text-slate-500">
                          <span className="font-medium text-slate-700">{item.totalQuantity ?? 0}</span>
                          <span className="mx-1.5 text-slate-300">/</span>
                          {item.maintenanceQuantity ?? 0} mantenimiento
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${statusClass(item.status)}`}>
                            {statusLabel(item.status)}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          {hasActiveReports ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-800">
                              <AlertTriangle size={14} aria-hidden="true" />
                              Reporte de Usuario
                            </span>
                          ) : (
                            <span className="text-slate-400">Sin reportes</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="inline-flex items-center gap-3">
                            <button
                              className="cursor-pointer text-slate-400 transition hover:text-green-600"
                              type="button"
                              aria-label={`Editar ${item.name || 'equipo'}`}
                              title="Editar"
                              onClick={() => openEditModal(item)}
                            >
                              <Pencil size={17} aria-hidden="true" />
                            </button>
                            <button
                              className="cursor-pointer text-slate-400 transition hover:text-red-600"
                              type="button"
                              aria-label={`Eliminar ${item.name || 'equipo'}`}
                              title="Eliminar"
                              onClick={() => handleDelete(item)}
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
                    <td className="px-6 py-10 text-center text-sm text-slate-500" colSpan={8}>
                      {searchTerm ? 'No hay equipo que coincida con la búsqueda.' : 'No hay equipo registrado.'}
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
                <p className="text-sm font-medium uppercase tracking-[0.2em] text-emerald-700">Equipo</p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-900">
                  {editingEquipment ? 'Editar Equipo' : 'Nuevo Equipo'}
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
                <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="equipment-name">
                  Nombre
                </label>
                <input
                  className="w-full rounded-lg border border-slate-200 px-4 py-3 text-slate-900 outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-100"
                  id="equipment-name"
                  type="text"
                  value={form.nombre}
                  onChange={(event) => setForm({ ...form, nombre: event.target.value })}
                  required
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="equipment-zone">
                  Zona
                </label>
                <select
                  className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-100"
                  id="equipment-zone"
                  value={form.zona}
                  onChange={(event) => setForm({ ...form, zona: event.target.value })}
                  required
                >
                  <option value="">Selecciona una zona</option>
                  {zoneOptions.map((zone) => <option key={zone} value={zone}>{zone}</option>)}
                  <option value={customZoneOption}>Agregar otra...</option>
                </select>
              </div>

              {form.zona === customZoneOption && (
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="equipment-custom-zone">
                    Nueva zona
                  </label>
                  <input
                    className="w-full rounded-lg border border-slate-200 px-4 py-3 text-slate-900 outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-100"
                    id="equipment-custom-zone"
                    type="text"
                    value={customZone}
                    onChange={(event) => setCustomZone(event.target.value)}
                    required
                  />
                </div>
              )}

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="equipment-brand">
                  Marca
                </label>
                <input
                  className="w-full rounded-lg border border-slate-200 px-4 py-3 text-slate-900 outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-100"
                  id="equipment-brand"
                  type="text"
                  value={form.marca}
                  onChange={(event) => setForm({ ...form, marca: event.target.value })}
                  required
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="equipment-type">
                  Tipo de máquina
                </label>
                <select
                  className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-100"
                  id="equipment-type"
                  value={form.tipo}
                  onChange={(event) => setForm({ ...form, tipo: event.target.value })}
                  required
                >
                  <option value="Cardio">Cardio</option>
                  <option value="Fuerza">Fuerza</option>
                </select>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="equipment-total-quantity">
                    Cantidad total
                  </label>
                  <input
                    className="w-full rounded-lg border border-slate-200 px-4 py-3 text-slate-900 outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-100"
                    id="equipment-total-quantity"
                    type="number"
                    min="0"
                    step="1"
                    value={form.cantidadTotal}
                    onChange={(event) => setForm({ ...form, cantidadTotal: event.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="equipment-maintenance-quantity">
                    En mantenimiento
                  </label>
                  <input
                    className="w-full rounded-lg border border-slate-200 px-4 py-3 text-slate-900 outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-100"
                    id="equipment-maintenance-quantity"
                    type="number"
                    min="0"
                    max={form.cantidadTotal}
                    step="1"
                    value={form.cantidadMantenimiento}
                    onChange={(event) => setForm({ ...form, cantidadMantenimiento: event.target.value })}
                    required
                  />
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="equipment-status">
                  Estado
                </label>
                <select
                  className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-100"
                  id="equipment-status"
                  value={form.estado}
                  onChange={(event) => setForm({ ...form, estado: event.target.value as EquipmentStatus })}
                >
                  <option value="operational">Operativo</option>
                  <option value="maintenance">Mantenimiento</option>
                  <option value="broken">Averiado</option>
                </select>
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
                  {isSubmitting ? 'Guardando...' : editingEquipment ? 'Actualizar' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  )
}

export default Equipment