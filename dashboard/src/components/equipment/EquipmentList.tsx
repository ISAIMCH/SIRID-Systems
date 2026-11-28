import { useState } from 'react'
import { AlertTriangle, Image as ImageIcon, Pencil, Plus, Search, Trash2, Wrench } from 'lucide-react'
import { createEquipment, deleteEquipment, getEquipmentCatalog, updateEquipment } from '../../services/api'
import type { EquipmentCatalogItem, EquipmentPayload } from '../../services/api'
import type { Equipment, EquipmentStatus } from '../../types'
import GymSelect from '../GymSelect'
import Panel from '../ui/Panel'
import Modal from '../ui/Modal'
import Badge from '../ui/Badge'
import EmptyState from '../ui/EmptyState'
import { errorAlert, fieldClass, hintClass, iconButton, labelClass, primaryButton, secondaryButton, tableHeadClass, tdClass, thClass } from '../ui/styles'
import { useAuth } from '../../store/useAuth'
import { targetGymField } from '../../utils/targetGym'
import { EQUIPMENT_CATEGORIES, isEquipmentCategory } from '../../utils/exerciseCatalog'

interface EquipmentFormState {
  // Id of the master-catalog item, or '' for custom equipment.
  catalogo: string
  nombre: string
  zona: string
  marca: string
  tipo: string
  categoria: string
  imageUrl: string
  cantidadTotal: string
  cantidadMantenimiento: string
  estado: EquipmentStatus
}

const zoneOptions = ['Zona de piernas', 'Peso libre', 'Cardio']
const customZoneOption = 'other'
const equipmentTypeMap: Record<string, string> = {
  cardio: 'cardio',
  fuerza: 'strength',
  strength: 'strength',
}
// The API stores the type in English; the form and the table show it in Spanish.
const TYPE_LABELS: Record<string, string> = { cardio: 'Cardio', strength: 'Fuerza', fuerza: 'Fuerza' }
const typeLabel = (type?: string) => (type ? TYPE_LABELS[type.toLowerCase()] ?? type : 'Sin tipo')

const emptyEquipmentForm: EquipmentFormState = {
  catalogo: '',
  nombre: '',
  zona: '',
  marca: '',
  tipo: 'Cardio',
  categoria: '',
  imageUrl: '',
  cantidadTotal: '1',
  cantidadMantenimiento: '0',
  estado: 'available',
}

const equipmentKey = (item: Equipment, index: number) => item._id || item.id || `equipment-${index}`
const availableUnits = (item: Equipment) => Math.max(0, (item.totalQuantity ?? 0) - (item.maintenanceQuantity || 0))

function Thumbnail({ item }: { item: Equipment }) {
  const src = item.imageUrl || item.catalogImageUrl
  return src ? (
    <img className="h-11 w-11 shrink-0 rounded-xl object-cover ring-1 ring-slate-200" src={src} alt="" />
  ) : (
    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-400">
      <ImageIcon size={18} aria-hidden />
    </span>
  )
}

// Available units against the total, as a number and a thin bar.
function UnitsMeter({ item }: { item: Equipment }) {
  const total = item.totalQuantity ?? 0
  const available = availableUnits(item)
  const percent = total > 0 ? (available / total) * 100 : 0
  return (
    <div className="min-w-[120px]">
      <p className="text-sm text-slate-500">
        <span className="font-semibold text-ink tabular">{available}</span> de <span className="tabular">{total}</span> disponibles
      </p>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
        <div className={`h-full rounded-full ${available === 0 ? 'bg-red-500' : available < total ? 'bg-amber-400' : 'bg-brand-press'}`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  )
}

function StatusBadges({ item }: { item: Equipment }) {
  const reports = item.activeReportsCount || 0
  return (
    <div className="flex flex-wrap gap-1.5">
      {item.status === 'out_of_service' || availableUnits(item) === 0
        ? <Badge tone="danger">Fuera de servicio</Badge>
        : <Badge tone="success">Operativo</Badge>}
      {reports > 0 && <Badge tone="warning" icon={AlertTriangle}>{reports} reporte{reports === 1 ? '' : 's'}</Badge>}
    </div>
  )
}

interface EquipmentListProps {
  equipment: Equipment[]
  isLoading: boolean
  error: string | null
  // Reload the list after a change (the page also uses it for its indicators).
  onChanged: () => Promise<void>
}

// The gym's machines: search, units available and the form to add, edit or remove them.
function EquipmentList({ equipment, isLoading, error, onChanged }: EquipmentListProps) {
  const { isAllGyms } = useAuth()
  const [gymId, setGymId] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingEquipment, setEditingEquipment] = useState<Equipment | null>(null)
  const [form, setForm] = useState<EquipmentFormState>(emptyEquipmentForm)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [modalError, setModalError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [customZone, setCustomZone] = useState('')
  const [catalog, setCatalog] = useState<EquipmentCatalogItem[] | null>(null)
  const [catalogError, setCatalogError] = useState<string | null>(null)

  // The master catalog loads the first time the form opens; without it the gym can still register custom equipment.
  function loadCatalog() {
    if (catalog) return
    getEquipmentCatalog()
      .then((response) => { setCatalog(response.items); setCatalogError(null) })
      .catch((requestError) => setCatalogError(requestError instanceof Error ? requestError.message : 'No se pudo cargar el catálogo de equipos.'))
  }

  const catalogById = new Map((catalog ?? []).map((item) => [item._id, item]))
  const catalogFamilies = [...new Set((catalog ?? []).map((item) => item.family))]

  // Picking a catalog item fills name (unless the gym already wrote its own), type and family.
  function pickCatalogItem(id: string) {
    const item = catalogById.get(id)
    setForm((current) => {
      if (!item) return { ...current, catalogo: '' }
      const previous = catalogById.get(current.catalogo)
      const keepName = current.nombre.trim() && current.nombre !== previous?.name
      return {
        ...current,
        catalogo: id,
        nombre: keepName ? current.nombre : item.name,
        tipo: item.type === 'cardio' ? 'Cardio' : 'Fuerza',
        categoria: item.family,
      }
    })
  }

  function openCreateModal() {
    loadCatalog()
    setEditingEquipment(null)
    setForm(emptyEquipmentForm)
    setCustomZone('')
    setModalError(null)
    setIsModalOpen(true)
  }

  function openEditModal(item: Equipment) {
    const zone = item.zone || ''
    const isPresetZone = zoneOptions.includes(zone)
    loadCatalog()
    setEditingEquipment(item)
    setForm({
      catalogo: item.catalogItemId || '',
      nombre: item.name || '',
      zona: isPresetZone ? zone : customZoneOption,
      marca: item.brand || '',
      tipo: typeLabel(item.type) === 'Sin tipo' ? 'Cardio' : typeLabel(item.type),
      categoria: isEquipmentCategory(item.equipmentCategory) ? item.equipmentCategory : '',
      imageUrl: item.imageUrl || '',
      cantidadTotal: String(item.totalQuantity ?? 1),
      cantidadMantenimiento: String(item.maintenanceQuantity ?? 0),
      estado: item.status === 'out_of_service' ? 'out_of_service' : 'available',
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
        equipmentCategory: form.categoria,
        catalogItemId: form.catalogo || null,
        imageUrl: form.imageUrl.trim(),
        totalQuantity: Number(form.cantidadTotal),
        maintenanceQuantity: Number(form.cantidadMantenimiento),
        status: form.estado,
      }
      if (!Number.isInteger(payload.totalQuantity) || payload.totalQuantity < 0) {
        throw new Error('La cantidad total debe ser un número entero no negativo.')
      }
      if (!Number.isInteger(payload.maintenanceQuantity) || payload.maintenanceQuantity < 0 || payload.maintenanceQuantity > payload.totalQuantity) {
        throw new Error('Las unidades en mantenimiento deben estar entre 0 y la cantidad total.')
      }
      // The API sets the status from the quantities, so both must say the same.
      const allInMaintenance = payload.maintenanceQuantity >= payload.totalQuantity
      if (payload.status === 'out_of_service' && !allInMaintenance) {
        throw new Error('Para marcarlo fuera de servicio, todas las unidades deben estar en mantenimiento.')
      }
      if (payload.status === 'available' && allInMaintenance) {
        throw new Error('Si todas las unidades están en mantenimiento, el estado debe ser Fuera de servicio.')
      }
      if (!payload.zone) throw new Error('Selecciona o escribe una zona.')
      if (!isEquipmentCategory(payload.equipmentCategory)) throw new Error('Selecciona la categoría del equipo.')
      const equipmentId = editingEquipment?._id || editingEquipment?.id

      if (editingEquipment) {
        if (!equipmentId) throw new Error('El equipo no tiene un identificador válido.')
        await updateEquipment(equipmentId, payload)
      } else {
        await createEquipment({ ...payload, ...targetGymField(isAllGyms, gymId) })
      }

      await onChanged()
      setActionError(null)
      setEditingEquipment(null)
      setForm(emptyEquipmentForm)
      setCustomZone('')
      setIsModalOpen(false)
    } catch (requestError) {
      setModalError(requestError instanceof Error ? requestError.message : 'No se pudo guardar el equipo.')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleDelete(item: Equipment) {
    const equipmentId = item._id || item.id
    if (!equipmentId) {
      setActionError('No se puede eliminar un equipo sin identificador.')
      return
    }
    if (!window.confirm(`¿Eliminar ${item.name || 'este equipo'}?`)) return

    try {
      await deleteEquipment(equipmentId)
      await onChanged()
      setActionError(null)
    } catch (requestError) {
      setActionError(requestError instanceof Error ? requestError.message : 'No se pudo eliminar el equipo.')
    }
  }

  const filteredEquipment = equipment.filter((item) =>
    `${item.name} ${item.zone} ${item.brand} ${item.type || ''} ${typeLabel(item.type)} ${item.equipmentCategory || ''}`
      .toLocaleLowerCase()
      .includes(searchTerm.trim().toLocaleLowerCase()),
  )
  const shownError = actionError ?? error

  const rowActions = (item: Equipment) => (
    <div className="flex items-center justify-end gap-1">
      <button className={`${iconButton} hover:text-brand-text`} type="button" aria-label={`Editar ${item.name || 'equipo'}`} title="Editar" onClick={() => openEditModal(item)}>
        <Pencil size={17} aria-hidden />
      </button>
      <button className={`${iconButton} hover:bg-red-50 hover:text-red-600`} type="button" aria-label={`Eliminar ${item.name || 'equipo'}`} title="Eliminar" onClick={() => void handleDelete(item)}>
        <Trash2 size={17} aria-hidden />
      </button>
    </div>
  )

  return (
    <Panel
      title="Equipos"
      icon={Wrench}
      description={isLoading ? undefined : `${equipment.length} equipo${equipment.length === 1 ? '' : 's'} registrado${equipment.length === 1 ? '' : 's'}`}
      actions={(
        <button className={primaryButton} type="button" onClick={openCreateModal}>
          <Plus size={18} aria-hidden /> Nuevo equipo
        </button>
      )}
    >
      {shownError && <p className={`${errorAlert} mb-4`} role="alert">{shownError}</p>}

      <label className="relative block max-w-sm">
        <span className="sr-only">Buscar equipo</span>
        <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} aria-hidden />
        <input className={`${fieldClass} pl-10`} type="search" placeholder="Buscar por nombre, zona o marca" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} />
      </label>

      <div className="mt-4">
        {isLoading ? (
          <div className="space-y-3" aria-busy="true" aria-label="Cargando equipo">
            {Array.from({ length: 4 }).map((_, index) => <div className="skeleton h-14 w-full" key={index} />)}
          </div>
        ) : filteredEquipment.length === 0 ? (
          <EmptyState icon={Wrench} title={searchTerm ? 'Sin coincidencias' : 'Aún no hay equipo'}>
            {searchTerm ? 'Prueba con otro nombre, zona o marca.' : 'Registra las máquinas del gimnasio para controlar sus unidades y reportes.'}
          </EmptyState>
        ) : (
          <>
            {/* Phones: one card per machine. */}
            <ul className="space-y-3 md:hidden">
              {filteredEquipment.map((item, index) => (
                <li className="rounded-xl border border-slate-200 p-4" key={equipmentKey(item, index)}>
                  <div className="flex items-start gap-3">
                    <Thumbnail item={item} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-ink">{item.name || 'Sin nombre'}</p>
                      <p className="truncate text-xs text-slate-500">{[item.zone || 'Sin zona', typeLabel(item.type), item.brand].filter(Boolean).join(' · ')}</p>
                    </div>
                    {rowActions(item)}
                  </div>
                  <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
                    <UnitsMeter item={item} />
                    <StatusBadges item={item} />
                  </div>
                </li>
              ))}
            </ul>

            {/* Tablets and up: a table. */}
            <div className="-mx-5 hidden overflow-x-auto sm:-mx-6 md:block">
              <table className="min-w-full text-left text-sm">
                <thead className={tableHeadClass}>
                  <tr>
                    <th className={thClass}>Equipo</th>
                    <th className={thClass}>Zona</th>
                    <th className={thClass}>Tipo · marca</th>
                    <th className={thClass}>Unidades</th>
                    <th className={thClass}>Estado</th>
                    <th className={thClass}><span className="sr-only">Acciones</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {filteredEquipment.map((item, index) => (
                    <tr className="transition-colors hover:bg-slate-50/70" key={equipmentKey(item, index)}>
                      <td className={tdClass}>
                        <div className="flex items-center gap-3">
                          <Thumbnail item={item} />
                          <div className="min-w-0">
                            <p className="font-semibold text-ink">{item.name || 'Sin nombre'}</p>
                            {item.equipmentCategory && <p className="text-xs text-slate-500">{item.equipmentCategory}</p>}
                          </div>
                        </div>
                      </td>
                      <td className={`${tdClass} text-slate-500`}>{item.zone || 'Sin zona'}</td>
                      <td className={`${tdClass} text-slate-500`}>
                        {typeLabel(item.type)}
                        <span className="block text-xs">{item.brand || 'Sin marca'}</span>
                      </td>
                      <td className={tdClass}><UnitsMeter item={item} /></td>
                      <td className={tdClass}><StatusBadges item={item} /></td>
                      <td className={tdClass}>{rowActions(item)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {isModalOpen && (
        <Modal eyebrow="Equipo" title={editingEquipment ? 'Editar equipo' : 'Nuevo equipo'} onClose={closeModal}>
          <form className="space-y-4" onSubmit={handleSubmit}>
            {!editingEquipment && <GymSelect id="equipment-gym" value={gymId} onChange={setGymId} />}
            <div>
              <label className={labelClass} htmlFor="equipment-catalog">Catálogo de SIRID</label>
              <select className={fieldClass} id="equipment-catalog" value={form.catalogo} onChange={(event) => pickCatalogItem(event.target.value)} disabled={!catalog && !catalogError}>
                <option value="">{catalog || catalogError ? 'Equipo personalizado (no está en el catálogo)' : 'Cargando catálogo...'}</option>
                {catalogFamilies.map((family) => (
                  <optgroup key={family} label={family}>
                    {(catalog ?? []).filter((item) => item.family === family).map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}
                  </optgroup>
                ))}
                {form.catalogo && catalog && !catalogById.has(form.catalogo) && <option value={form.catalogo}>Equipo que SIRID ya no ofrece</option>}
              </select>
              <p className={`${hintClass} mt-1`}>
                {catalogError ?? (form.catalogo
                  ? 'Llenamos nombre, tipo y categoría; puedes cambiar el nombre, la marca y la foto.'
                  : 'Elige tu máquina para que desbloquee los ejercicios correctos, o regístrala como personalizada.')}
              </p>
            </div>
            <div>
              <label className={labelClass} htmlFor="equipment-name">Nombre</label>
              <input className={fieldClass} id="equipment-name" type="text" value={form.nombre} onChange={(event) => setForm({ ...form, nombre: event.target.value })} required />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass} htmlFor="equipment-zone">Zona</label>
                <select className={fieldClass} id="equipment-zone" value={form.zona} onChange={(event) => setForm({ ...form, zona: event.target.value })} required>
                  <option value="">Selecciona una zona</option>
                  {zoneOptions.map((zone) => <option key={zone} value={zone}>{zone}</option>)}
                  <option value={customZoneOption}>Agregar otra...</option>
                </select>
              </div>
              <div>
                <label className={labelClass} htmlFor="equipment-brand">Marca</label>
                <input className={fieldClass} id="equipment-brand" type="text" value={form.marca} onChange={(event) => setForm({ ...form, marca: event.target.value })} required />
              </div>
            </div>

            {form.zona === customZoneOption && (
              <div>
                <label className={labelClass} htmlFor="equipment-custom-zone">Nueva zona</label>
                <input className={fieldClass} id="equipment-custom-zone" type="text" value={customZone} onChange={(event) => setCustomZone(event.target.value)} required />
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass} htmlFor="equipment-type">Tipo de máquina</label>
                <select className={fieldClass} id="equipment-type" value={form.tipo} onChange={(event) => setForm({ ...form, tipo: event.target.value })} required>
                  <option value="Cardio">Cardio</option>
                  <option value="Fuerza">Fuerza</option>
                </select>
              </div>
              <div>
                <label className={labelClass} htmlFor="equipment-category">Categoría del catálogo</label>
                <select className={fieldClass} id="equipment-category" value={form.categoria} onChange={(event) => setForm({ ...form, categoria: event.target.value })} required disabled={Boolean(form.catalogo)}>
                  <option value="">Selecciona una categoría</option>
                  {EQUIPMENT_CATEGORIES.filter((category) => category !== 'Sin equipo' || form.categoria === 'Sin equipo').map((category) => <option key={category} value={category}>{category}</option>)}
                </select>
              </div>
            </div>
            <p className={`${hintClass} -mt-2`}>
              {form.catalogo
                ? 'La categoría la define el catálogo de SIRID.'
                : 'La categoría desbloquea los ejercicios del catálogo global que usan esta familia de equipo.'}
            </p>

            <div>
              <label className={labelClass} htmlFor="equipment-image-url">Imagen (URL)</label>
              <input className={fieldClass} id="equipment-image-url" type="url" value={form.imageUrl} onChange={(event) => setForm({ ...form, imageUrl: event.target.value })} placeholder="https://..." />
              {form.catalogo && !form.imageUrl && <p className={`${hintClass} mt-1`}>Sin foto propia se muestra la del catálogo.</p>}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className={labelClass} htmlFor="equipment-total-quantity">Cantidad total</label>
                <input className={fieldClass} id="equipment-total-quantity" type="number" min="0" step="1" value={form.cantidadTotal} onChange={(event) => setForm({ ...form, cantidadTotal: event.target.value })} required />
              </div>
              <div>
                <label className={labelClass} htmlFor="equipment-maintenance-quantity">En mantenimiento</label>
                <input className={fieldClass} id="equipment-maintenance-quantity" type="number" min="0" max={form.cantidadTotal} step="1" value={form.cantidadMantenimiento} onChange={(event) => setForm({ ...form, cantidadMantenimiento: event.target.value })} required />
              </div>
              <div>
                <label className={labelClass} htmlFor="equipment-status">Estado</label>
                <select className={fieldClass} id="equipment-status" value={form.estado} onChange={(event) => setForm({ ...form, estado: event.target.value as EquipmentStatus })}>
                  <option value="available">Operativo</option>
                  <option value="out_of_service">Fuera de servicio</option>
                </select>
              </div>
            </div>

            {modalError && <p className={errorAlert} role="alert">{modalError}</p>}

            <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
              <button className={secondaryButton} type="button" onClick={closeModal} disabled={isSubmitting}>Cancelar</button>
              <button className={primaryButton} type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Guardando...' : editingEquipment ? 'Guardar cambios' : 'Registrar equipo'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </Panel>
  )
}

export default EquipmentList
