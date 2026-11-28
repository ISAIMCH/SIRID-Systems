import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Dumbbell, Eye, EyeOff, Loader2, Pencil, Plus, Search, SearchX, X } from 'lucide-react'
import { createPlatformEquipmentItem, getPlatformEquipmentCatalog, getPlatformExercises, updatePlatformEquipmentItem } from '../services/api'
import type { EquipmentCatalogFilters, EquipmentCatalogItem, EquipmentCatalogPayload, PlatformExercise } from '../services/api'
import { EQUIPMENT_CATEGORIES, MUSCLE_GROUPS } from '../utils/exerciseCatalog'
import PageHeader from '../components/ui/PageHeader'
import Panel from '../components/ui/Panel'
import Modal from '../components/ui/Modal'
import Badge from '../components/ui/Badge'
import EmptyState from '../components/ui/EmptyState'
import MediaField from '../components/ui/MediaField'
import {
  errorAlert,
  fieldClass,
  iconButton,
  labelClass,
  primaryButton,
  secondaryButton,
  tableHeadClass,
  tdClass,
  thClass,
} from '../components/ui/styles'

const emptyForm: EquipmentCatalogPayload = { name: '', family: 'Máquinas', type: 'strength', description: '', muscleGroups: [], imageUrl: '', exerciseIds: [] }

function toForm(item: EquipmentCatalogItem): EquipmentCatalogPayload {
  return { name: item.name, family: item.family, type: item.type, description: item.description, muscleGroups: item.muscleGroups, imageUrl: item.imageUrl ?? '', exerciseIds: item.exerciseIds }
}

type PickedExercise = { _id: string; name: string; equipment: string }

// Which global exercises the equipment unlocks: every exercise of its family, or an explicit list SIRID builds here.
function ExercisePicker({ family, picked, isList, onModeChange, onChange }: {
  family: string
  picked: PickedExercise[]
  isList: boolean
  onModeChange: (isList: boolean) => void
  onChange: (picked: PickedExercise[]) => void
}) {
  const [query, setQuery] = useState('')
  const [familyOnly, setFamilyOnly] = useState(true)
  const [results, setResults] = useState<PlatformExercise[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestId = useRef(0)

  useEffect(() => {
    if (!isList) return
    const id = ++requestId.current
    const timer = setTimeout(() => {
      setIsSearching(true)
      getPlatformExercises({ q: query.trim().length >= 2 ? query.trim() : undefined, category: familyOnly ? family : undefined, status: 'active', page: 1 })
        .then((response) => { if (id === requestId.current) { setResults(response.exercises); setError(null) } })
        .catch((requestError) => { if (id === requestId.current) setError(requestError instanceof Error ? requestError.message : 'No se pudo buscar.') })
        .finally(() => { if (id === requestId.current) setIsSearching(false) })
    }, 300)
    return () => clearTimeout(timer)
  }, [isList, query, familyOnly, family])

  const pickedIds = new Set(picked.map((item) => item._id))

  return (
    <fieldset className="sm:col-span-2">
      <legend className={labelClass}>Ejercicios que desbloquea</legend>
      <div className="flex flex-col gap-2 text-sm text-slate-700 sm:flex-row sm:gap-5">
        <label className="flex items-center gap-2">
          <input type="radio" name="pq-mode" checked={!isList} onChange={() => onModeChange(false)} />
          Todos los de la familia «{family}»
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" name="pq-mode" checked={isList} onChange={() => onModeChange(true)} />
          Solo una lista de ejercicios
        </label>
      </div>

      {isList && (
        <div className="mt-3 rounded-xl border border-slate-200 p-3">
          {picked.length > 0 ? (
            <ul className="flex flex-wrap gap-1.5" aria-label="Ejercicios elegidos">
              {picked.map((item) => (
                <li key={item._id}>
                  <span className="inline-flex items-center gap-1 rounded-full bg-brand-soft py-0.5 pl-3 pr-1 text-xs font-semibold text-brand-text">
                    {item.name}
                    <button className="grid h-5 w-5 place-items-center rounded-full hover:bg-white/60" type="button" aria-label={`Quitar ${item.name}`} onClick={() => onChange(picked.filter((entry) => entry._id !== item._id))}>
                      <X size={12} aria-hidden />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-slate-400">Aún no hay ejercicios en la lista.</p>
          )}

          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="relative block flex-1">
              <span className="sr-only">Buscar ejercicios</span>
              <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} aria-hidden />
              <input className={`${fieldClass} pl-10`} type="search" placeholder="Buscar ejercicio..." value={query} onChange={(event) => setQuery(event.target.value)} />
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <input type="checkbox" checked={familyOnly} onChange={(event) => setFamilyOnly(event.target.checked)} />
              Solo de «{family}»
            </label>
          </div>
          {error && <p className={`${errorAlert} mt-2`} role="alert">{error}</p>}
          <ul className="mt-2 max-h-56 divide-y divide-slate-100 overflow-y-auto" aria-busy={isSearching}>
            {results.map((exercise) => (
              <li className="flex items-center justify-between gap-3 py-2 text-sm" key={exercise._id}>
                <span className="min-w-0">
                  <span className="block truncate text-ink">{exercise.name}</span>
                  <span className="text-xs text-slate-400">{exercise.targetMuscle} · {exercise.equipment}</span>
                </span>
                <button
                  className={`${secondaryButton} shrink-0 px-3 py-1 text-xs`}
                  type="button"
                  disabled={pickedIds.has(exercise._id)}
                  onClick={() => onChange([...picked, { _id: exercise._id, name: exercise.name, equipment: exercise.equipment }])}
                >
                  {pickedIds.has(exercise._id) ? 'Agregado' : 'Agregar'}
                </button>
              </li>
            ))}
            {!isSearching && !results.length && <li className="py-3 text-xs text-slate-400">Sin resultados.</li>}
          </ul>
        </div>
      )}
    </fieldset>
  )
}

function changedFields(form: EquipmentCatalogPayload, original: EquipmentCatalogItem) {
  const before = toForm(original)
  return Object.fromEntries(Object.entries(form).filter(([key, value]) =>
    JSON.stringify(value) !== JSON.stringify(before[key as keyof EquipmentCatalogPayload]))) as Partial<EquipmentCatalogPayload>
}

function EquipmentEditor({ item, onClose, onSaved }: { item: EquipmentCatalogItem | null; onClose: () => void; onSaved: (item: EquipmentCatalogItem) => void }) {
  const [form, setForm] = useState<EquipmentCatalogPayload>(item ? toForm(item) : emptyForm)
  const [picked, setPicked] = useState<PickedExercise[]>(item?.exercises ?? [])
  const [isList, setIsList] = useState(Boolean(item?.exerciseIds.length))
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  function toggleMuscle(group: string) {
    setForm((current) => ({
      ...current,
      muscleGroups: current.muscleGroups.includes(group) ? current.muscleGroups.filter((item) => item !== group) : [...current.muscleGroups, group],
    }))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    const payload = { ...form, name: form.name.trim(), description: form.description.trim(), imageUrl: form.imageUrl.trim(), exerciseIds: isList ? picked.map((entry) => entry._id) : [] }
    if (payload.name.length < 2) return setError('Escribe el nombre del equipo.')
    if (isList && !picked.length) return setError('Agrega al menos un ejercicio o elige «Todos los de la familia».')
    setIsSubmitting(true)
    try {
      if (item) {
        const changes = changedFields(payload, item)
        if (!Object.keys(changes).length) return onClose()
        onSaved((await updatePlatformEquipmentItem(item._id, changes)).item)
      } else {
        onSaved((await createPlatformEquipmentItem(payload)).item)
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No se pudo guardar el equipo.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Modal eyebrow="Catálogo de equipos" title={item ? 'Editar equipo' : 'Nuevo equipo'} onClose={() => { if (!isSubmitting) onClose() }} size="xl">
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit}>
        <div className="sm:col-span-2">
          <label className={labelClass} htmlFor="pq-name">Nombre</label>
          <input className={fieldClass} id="pq-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required maxLength={120} />
        </div>
        <div>
          <label className={labelClass} htmlFor="pq-family">Familia</label>
          <select className={fieldClass} id="pq-family" value={form.family} onChange={(event) => setForm({ ...form, family: event.target.value })}>
            {EQUIPMENT_CATEGORIES.map((family) => <option key={family} value={family}>{family}</option>)}
          </select>
          <p className="mt-1 text-xs text-slate-400">Decide qué ejercicios del catálogo global desbloquea.</p>
        </div>
        <div>
          <label className={labelClass} htmlFor="pq-type">Tipo</label>
          <select className={fieldClass} id="pq-type" value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value === 'cardio' ? 'cardio' : 'strength' })}>
            <option value="strength">Fuerza</option>
            <option value="cardio">Cardio</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className={labelClass} htmlFor="pq-description">Descripción</label>
          <textarea className={`${fieldClass} min-h-20 resize-y`} id="pq-description" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} maxLength={600} />
        </div>
        <fieldset className="sm:col-span-2">
          <legend className={labelClass}>Grupos musculares</legend>
          <div className="flex flex-wrap gap-1.5">
            {MUSCLE_GROUPS.map((group) => {
              const selected = form.muscleGroups.includes(group)
              return (
                <button
                  className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset transition ${selected ? 'bg-brand text-brand-ink ring-brand' : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50'}`}
                  key={group}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => toggleMuscle(group)}
                >
                  {group}
                </button>
              )
            })}
          </div>
        </fieldset>
        <ExercisePicker family={form.family} picked={picked} isList={isList} onModeChange={setIsList} onChange={setPicked} />
        <div className="sm:col-span-2">
          <MediaField id="pq-image" label="Imagen (opcional)" kind="image" value={form.imageUrl} onChange={(imageUrl) => setForm((current) => ({ ...current, imageUrl }))} onError={setError} />
        </div>
        {error && <p className={`${errorAlert} sm:col-span-2`} role="alert">{error}</p>}
        <div className="flex flex-col-reverse gap-2 pt-1 sm:col-span-2 sm:flex-row sm:justify-end">
          <button className={secondaryButton} type="button" onClick={onClose} disabled={isSubmitting}>Cancelar</button>
          <button className={primaryButton} type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Guardando...' : item ? 'Guardar cambios' : 'Crear equipo'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// SIRID's master equipment catalog: the list gyms pick from when they register their equipment.
export default function PlatformEquipment() {
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState<EquipmentCatalogFilters>({ status: 'all', family: '' })
  const [items, setItems] = useState<EquipmentCatalogItem[]>([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<EquipmentCatalogItem | 'new' | null>(null)
  const requestId = useRef(0)

  async function load(nextPage: number, q: string, current: EquipmentCatalogFilters) {
    const id = ++requestId.current
    setIsLoading(true)
    setError(null)
    try {
      const response = await getPlatformEquipmentCatalog({ ...current, q: q.length >= 2 ? q : undefined, page: nextPage })
      if (id !== requestId.current) return
      setItems((list) => nextPage === 1 ? response.items : [...list, ...response.items])
      setPage(response.page)
      setTotal(response.total)
      setHasMore(response.hasMore)
    } catch (requestError) {
      if (id === requestId.current) setError(requestError instanceof Error ? requestError.message : 'No se pudo cargar el catálogo.')
    } finally {
      if (id === requestId.current) setIsLoading(false)
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => void load(1, query.trim(), filters), 300)
    return () => clearTimeout(timer)
  }, [query, filters])

  function replace(item: EquipmentCatalogItem) {
    setItems((list) => list.some((entry) => entry._id === item._id) ? list.map((entry) => entry._id === item._id ? item : entry) : [item, ...list])
  }

  async function toggleActive(item: EquipmentCatalogItem) {
    const message = item.isActive
      ? `¿Ocultar "${item.name}"? Los gimnasios ya no podrán elegirlo; el equipo que ya lo usa no cambia.`
      : `¿Volver a mostrar "${item.name}" en el catálogo?`
    if (!window.confirm(message)) return
    try {
      replace((await updatePlatformEquipmentItem(item._id, { isActive: !item.isActive })).item)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No se pudo actualizar el equipo.')
    }
  }

  const isFiltered = query.trim().length >= 2 || Boolean(filters.family) || filters.status !== 'all'
  const isFirstLoad = isLoading && items.length === 0

  return (
    <section className="min-h-screen bg-canvas px-4 py-8 sm:px-8 sm:py-10">
      <PageHeader
        eyebrow="SIRID"
        title="Catálogo de equipos"
        description="El equipo que los gimnasios eligen al registrar el suyo. Su familia define qué ejercicios del catálogo global desbloquea."
        actions={(
          <button className={primaryButton} type="button" onClick={() => setEditing('new')}>
            <Plus size={18} aria-hidden /> Nuevo equipo
          </button>
        )}
      />

      <Panel
        className="mt-6"
        title="Equipos"
        icon={Dumbbell}
        description={isFirstLoad ? undefined : `${items.length.toLocaleString('es-MX')} de ${total.toLocaleString('es-MX')} equipos${isFiltered ? ' con estos filtros' : ''}`}
      >
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_210px_140px]">
          <label className="relative block sm:col-span-2 xl:col-span-1">
            <span className="sr-only">Buscar equipos</span>
            <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} aria-hidden />
            <input className={`${fieldClass} pl-10`} type="search" placeholder="Buscar por nombre..." value={query} onChange={(event) => setQuery(event.target.value)} />
          </label>
          <select className={fieldClass} aria-label="Familia" value={filters.family ?? ''} onChange={(event) => setFilters({ ...filters, family: event.target.value })}>
            <option value="">Todas las familias</option>
            {EQUIPMENT_CATEGORIES.map((family) => <option key={family} value={family}>{family}</option>)}
          </select>
          <select className={fieldClass} aria-label="Estado" value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value as EquipmentCatalogFilters['status'] })}>
            <option value="all">Todos</option>
            <option value="active">Visibles</option>
            <option value="inactive">Ocultos</option>
          </select>
        </div>

        {error && <p className={`${errorAlert} mt-4`} role="alert">{error}</p>}

        <div className="mt-4">
          {isFirstLoad ? (
            <div className="space-y-3" aria-busy="true" aria-label="Cargando equipos">
              {Array.from({ length: 6 }).map((_, index) => <div className="skeleton h-14 w-full" key={index} />)}
            </div>
          ) : items.length === 0 ? (
            <EmptyState icon={isFiltered ? SearchX : Dumbbell} title={isFiltered ? 'No hay equipos con estos filtros' : 'El catálogo está vacío'}>
              {isFiltered ? 'Cambia la búsqueda o los filtros.' : 'Corre npm run seed:equipment en la API o crea el primer equipo.'}
            </EmptyState>
          ) : (
            <div className="-mx-5 overflow-x-auto sm:-mx-6">
              <table className="min-w-full text-left text-sm">
                <thead className={tableHeadClass}>
                  <tr>
                    <th className={thClass}>Equipo</th>
                    <th className={thClass}>Familia</th>
                    <th className={thClass}>Músculos</th>
                    <th className={thClass}>Ejercicios</th>
                    <th className={thClass}>Origen</th>
                    <th className={thClass}><span className="sr-only">Acciones</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {items.map((item) => (
                    <tr className={`transition-colors ${item.isActive ? 'hover:bg-slate-50' : 'bg-slate-50/70 text-slate-400'}`} key={item._id}>
                      <td className={tdClass}>
                        <div className="flex min-w-[14rem] items-center gap-3">
                          {item.imageUrl
                            ? <img className={`h-11 w-11 shrink-0 rounded-xl bg-slate-100 object-cover ring-1 ring-slate-200 ${item.isActive ? '' : 'opacity-50 grayscale'}`} src={item.imageUrl} alt="" loading="lazy" />
                            : <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-400"><Dumbbell size={18} aria-hidden /></span>}
                          <div className="min-w-0">
                            <p className={`truncate font-medium ${item.isActive ? 'text-ink' : 'line-through'}`}>{item.name}</p>
                            <p className="max-w-xs truncate text-xs text-slate-400">{item.type === 'cardio' ? 'Cardio' : 'Fuerza'}{item.description ? ` · ${item.description}` : ''}{item.isActive ? '' : ' · oculto'}</p>
                          </div>
                        </div>
                      </td>
                      <td className={`${tdClass} whitespace-nowrap`}>{item.family}</td>
                      <td className={tdClass}>
                        <span className="text-xs text-slate-500">{item.muscleGroups.length ? item.muscleGroups.join(', ') : '—'}</span>
                      </td>
                      <td className={`${tdClass} whitespace-nowrap text-xs text-slate-500`}>
                        {item.exerciseIds.length ? `${item.exerciseIds.length} en lista` : 'Toda la familia'}
                      </td>
                      <td className={`${tdClass} whitespace-nowrap`}>
                        {item.origin === 'sirid' ? <Badge tone="brand">SIRID</Badge> : <Badge>Base</Badge>}
                      </td>
                      <td className={`${tdClass} whitespace-nowrap`}>
                        <div className="flex justify-end gap-0.5">
                          <button className={`${iconButton} hover:text-brand-text`} type="button" aria-label={`Editar ${item.name}`} title="Editar" onClick={() => setEditing(item)}>
                            <Pencil size={17} aria-hidden />
                          </button>
                          <button className={iconButton} type="button" aria-label={item.isActive ? `Ocultar ${item.name}` : `Mostrar ${item.name}`} title={item.isActive ? 'Ocultar' : 'Mostrar'} onClick={() => void toggleActive(item)}>
                            {item.isActive ? <EyeOff size={17} aria-hidden /> : <Eye size={17} aria-hidden />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {!isFirstLoad && items.length > 0 && (hasMore || isLoading) && (
          <div className="mt-4 flex justify-center border-t border-slate-100 pt-4">
            <button className={secondaryButton} type="button" onClick={() => void load(page + 1, query.trim(), filters)} disabled={isLoading}>
              {isLoading ? <><Loader2 className="animate-spin" size={16} aria-hidden /> Cargando...</> : 'Cargar más'}
            </button>
          </div>
        )}
      </Panel>

      {editing && <EquipmentEditor item={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={(item) => { replace(item); setEditing(null) }} />}
    </section>
  )
}
