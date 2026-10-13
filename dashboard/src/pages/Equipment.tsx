import { useEffect, useState } from 'react'
import { AlertTriangle, Pencil, Plus, Trash2 } from 'lucide-react'
import { createEquipment, deleteEquipment, getEquipment, updateEquipment } from '../services/api'
import type { Equipment, EquipmentStatus } from '../types'

type EquipmentResponse = Equipment[] | { data?: unknown; equipment?: unknown }

interface EquipmentFormState {
  nombre: string
  tipo: string
  estado: EquipmentStatus
  ultimaMantenimiento: string
  proximaMantenimiento: string
}

const emptyEquipmentForm: EquipmentFormState = {
  nombre: '',
  tipo: '',
  estado: 'operational',
  ultimaMantenimiento: '',
  proximaMantenimiento: '',
}

async function fetchEquipment() {
  const response = await getEquipment<EquipmentResponse>()
  const equipmentCandidate = Array.isArray(response)
    ? response
    : response?.data || response?.equipment || []

  return Array.isArray(equipmentCandidate) ? equipmentCandidate as Equipment[] : []
}

function toDateInputValue(value?: string) {
  return value ? value.slice(0, 10) : ''
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

function daysUntilMaintenance(value?: string) {
  if (!value) return null
  const target = new Date(value)
  if (Number.isNaN(target.getTime())) return null

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  target.setHours(0, 0, 0, 0)
  return Math.ceil((target.getTime() - today.getTime()) / 86400000)
}

function EquipmentSkeleton() {
  return (
    <div className="space-y-4 p-6" aria-label="Cargando equipo" aria-busy="true">
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

function Equipment() {
  const [equipment, setEquipment] = useState<Equipment[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingEquipment, setEditingEquipment] = useState<Equipment | null>(null)
  const [form, setForm] = useState<EquipmentFormState>(emptyEquipmentForm)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [modalError, setModalError] = useState<string | null>(null)

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
    setModalError(null)
    setIsModalOpen(true)
  }

  function openEditModal(item: Equipment) {
    setEditingEquipment(item)
    setForm({
      nombre: item.name || '',
      tipo: item.type || '',
      estado: item.status || 'operational',
      ultimaMantenimiento: toDateInputValue(item.lastMaintenance),
      proximaMantenimiento: toDateInputValue(item.nextMaintenance),
    })
    setModalError(null)
    setIsModalOpen(true)
  }

  function closeModal() {
    if (isSubmitting) return
    setEditingEquipment(null)
    setForm(emptyEquipmentForm)
    setModalError(null)
    setIsModalOpen(false)
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setModalError(null)
    setIsSubmitting(true)

    try {
      const payload = {
        name: form.nombre.trim(),
        type: form.tipo.trim(),
        status: form.estado,
        lastMaintenance: form.ultimaMantenimiento,
        nextMaintenance: form.proximaMantenimiento,
      }
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

        {isLoading ? (
          <EquipmentSkeleton />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-100 bg-slate-50/80 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-6 py-4 font-medium">Nombre</th>
                  <th className="px-6 py-4 font-medium">Tipo</th>
                  <th className="px-6 py-4 font-medium">Estado</th>
                  <th className="px-6 py-4 font-medium">Último mantenimiento</th>
                  <th className="px-6 py-4 font-medium">Próximo mantenimiento</th>
                  <th className="px-6 py-4 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {equipment.length > 0 ? (
                  equipment.map((item, index) => {
                    const equipmentId = item._id || item.id || `equipment-${index}`
                    const days = daysUntilMaintenance(item.nextMaintenance)
                    const needsMaintenance = days !== null && days <= 7

                    return (
                      <tr className="transition-colors hover:bg-slate-50" key={equipmentId}>
                        <td className="whitespace-nowrap px-6 py-4 font-medium text-slate-900">
                          {item.name || 'Sin nombre'}
                        </td>
                        <td className="px-6 py-4 text-slate-500">{item.type || 'Sin tipo'}</td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${statusClass(item.status)}`}>
                            {statusLabel(item.status)}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-slate-500">{formatDate(item.lastMaintenance)}</td>
                        <td className="px-6 py-4">
                          <div className={`flex items-center gap-2 ${needsMaintenance ? (days !== null && days < 0 ? 'text-red-600' : 'text-amber-700') : 'text-slate-500'}`}>
                            {needsMaintenance && <AlertTriangle size={16} aria-hidden="true" />}
                            <span>{formatDate(item.nextMaintenance)}</span>
                            {needsMaintenance && (
                              <span className="text-xs font-medium">
                                {days !== null && days < 0 ? 'Vencido' : `En ${days} días`}
                              </span>
                            )}
                          </div>
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
                    <td className="px-6 py-10 text-center text-sm text-slate-500" colSpan={6}>
                      No hay equipo registrado.
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
                <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="equipment-type">
                  Tipo
                </label>
                <input
                  className="w-full rounded-lg border border-slate-200 px-4 py-3 text-slate-900 outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-100"
                  id="equipment-type"
                  type="text"
                  value={form.tipo}
                  onChange={(event) => setForm({ ...form, tipo: event.target.value })}
                  required
                />
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

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="equipment-last-maintenance">
                  Último mantenimiento
                </label>
                <input
                  className="w-full rounded-lg border border-slate-200 px-4 py-3 text-slate-900 outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-100"
                  id="equipment-last-maintenance"
                  type="date"
                  value={form.ultimaMantenimiento}
                  onChange={(event) => setForm({ ...form, ultimaMantenimiento: event.target.value })}
                  required
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="equipment-next-maintenance">
                  Próximo mantenimiento
                </label>
                <input
                  className="w-full rounded-lg border border-slate-200 px-4 py-3 text-slate-900 outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-100"
                  id="equipment-next-maintenance"
                  type="date"
                  value={form.proximaMantenimiento}
                  onChange={(event) => setForm({ ...form, proximaMantenimiento: event.target.value })}
                  required
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