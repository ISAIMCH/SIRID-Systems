import { useEffect, useRef, useState, type FormEvent } from 'react'
import { BookOpen, Dumbbell, Eye, EyeOff, Loader2, Lock, Pencil, Plus, Search, SearchX, Unlock } from 'lucide-react'
import { createPlatformExercise, getPlatformExercises, updatePlatformExercise } from '../services/api'
import type { PlatformExercise, PlatformExerciseFilters, PlatformExercisePayload } from '../services/api'
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

const FIELD_LABELS: Record<string, string> = {
  name: 'Nombre',
  targetMuscle: 'Músculo',
  secondaryMuscles: 'Secundarios',
  equipment: 'Equipo',
  gifUrl: 'GIF',
  imageUrl: 'Miniatura',
  steps: 'Pasos',
  metricType: 'Métrica',
}

interface FormState {
  name: string
  targetMuscle: string
  secondaryMuscles: string
  equipment: string
  gifUrl: string
  imageUrl: string
  steps: string
  metricType: 'strength' | 'cardio'
}

const emptyForm: FormState = { name: '', targetMuscle: '', secondaryMuscles: '', equipment: 'Sin equipo', gifUrl: '', imageUrl: '', steps: '', metricType: 'strength' }

function toForm(exercise: PlatformExercise): FormState {
  return {
    name: exercise.name,
    targetMuscle: exercise.targetMuscle,
    secondaryMuscles: exercise.secondaryMuscles.join(', '),
    equipment: exercise.equipment,
    gifUrl: exercise.gifUrl,
    imageUrl: exercise.imageUrl ?? '',
    steps: exercise.steps.join('\n'),
    metricType: exercise.metricType,
  }
}

function toPayload(form: FormState): PlatformExercisePayload {
  return {
    name: form.name.trim(),
    targetMuscle: form.targetMuscle,
    secondaryMuscles: form.secondaryMuscles.split(',').map((item) => item.trim()).filter(Boolean),
    equipment: form.equipment,
    gifUrl: form.gifUrl.trim(),
    imageUrl: form.imageUrl.trim(),
    steps: form.steps.split('\n').map((item) => item.trim()).filter(Boolean),
    metricType: form.metricType,
  }
}

// Only the fields that changed, so editing a dataset record locks just what SIRID touched.
function changedFields(payload: PlatformExercisePayload, original: PlatformExercise) {
  const before = toPayload(toForm(original))
  return Object.fromEntries(Object.entries(payload).filter(([key, value]) =>
    JSON.stringify(value) !== JSON.stringify(before[key as keyof PlatformExercisePayload]))) as Partial<PlatformExercisePayload>
}

function ExerciseEditor({ exercise, onClose, onSaved }: { exercise: PlatformExercise | null; onClose: () => void; onSaved: (exercise: PlatformExercise) => void }) {
  const [form, setForm] = useState<FormState>(exercise ? toForm(exercise) : emptyForm)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    const payload = toPayload(form)
    if (!payload.name || !payload.targetMuscle || !payload.gifUrl) return setError('Nombre, músculo y GIF son obligatorios.')
    setIsSubmitting(true)
    try {
      if (exercise) {
        const changes = changedFields(payload, exercise)
        if (!Object.keys(changes).length) return onClose()
        onSaved((await updatePlatformExercise(exercise._id, changes)).exercise)
      } else {
        onSaved((await createPlatformExercise(payload)).exercise)
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No se pudo guardar el ejercicio.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Modal eyebrow="Catálogo global" title={exercise ? 'Editar ejercicio' : 'Nuevo ejercicio SIRID'} onClose={() => { if (!isSubmitting) onClose() }} size="xl">
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit}>
        {exercise?.origin === 'dataset' && (
          <p className="-mt-1 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 sm:col-span-2">
            <Lock className="mt-0.5 shrink-0" size={15} aria-hidden />
            Los campos que cambies quedan bloqueados: el seed del dataset ya no los sobrescribe.
          </p>
        )}
        <div className="sm:col-span-2">
          <label className={labelClass} htmlFor="pe-name">Nombre</label>
          <input className={fieldClass} id="pe-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
        </div>
        <div>
          <label className={labelClass} htmlFor="pe-muscle">Músculo principal</label>
          <select className={fieldClass} id="pe-muscle" value={form.targetMuscle} onChange={(event) => setForm({ ...form, targetMuscle: event.target.value })} required>
            <option value="">Selecciona</option>
            {MUSCLE_GROUPS.map((group) => <option key={group} value={group}>{group}</option>)}
          </select>
        </div>
        <div>
          <label className={labelClass} htmlFor="pe-equipment">Categoría de equipo</label>
          <select className={fieldClass} id="pe-equipment" value={form.equipment} onChange={(event) => setForm({ ...form, equipment: event.target.value })}>
            {EQUIPMENT_CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </div>
        <div>
          <label className={labelClass} htmlFor="pe-secondary">Músculos secundarios</label>
          <input className={fieldClass} id="pe-secondary" value={form.secondaryMuscles} onChange={(event) => setForm({ ...form, secondaryMuscles: event.target.value })} placeholder="Tríceps, Hombros" />
        </div>
        <div>
          <label className={labelClass} htmlFor="pe-metric">Métrica</label>
          <select className={fieldClass} id="pe-metric" value={form.metricType} onChange={(event) => setForm({ ...form, metricType: event.target.value === 'cardio' ? 'cardio' : 'strength' })}>
            <option value="strength">Fuerza</option>
            <option value="cardio">Cardio</option>
          </select>
        </div>
        <MediaField id="pe-gif" label="GIF de la técnica" kind="gif" value={form.gifUrl} required onChange={(gifUrl) => setForm((current) => ({ ...current, gifUrl }))} onError={setError} />
        <MediaField id="pe-image" label="Miniatura (opcional)" kind="image" value={form.imageUrl} onChange={(imageUrl) => setForm((current) => ({ ...current, imageUrl }))} onError={setError} />
        <div className="sm:col-span-2">
          <label className={labelClass} htmlFor="pe-steps">Pasos <span className="font-normal text-slate-400">(uno por línea)</span></label>
          <textarea className={`${fieldClass} min-h-32 resize-y`} id="pe-steps" value={form.steps} onChange={(event) => setForm({ ...form, steps: event.target.value })} />
        </div>
        {error && <p className={`${errorAlert} sm:col-span-2`} role="alert">{error}</p>}
        <div className="flex flex-col-reverse gap-2 pt-1 sm:col-span-2 sm:flex-row sm:justify-end">
          <button className={secondaryButton} type="button" onClick={onClose} disabled={isSubmitting}>Cancelar</button>
          <button className={primaryButton} type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Guardando...' : exercise ? 'Guardar cambios' : 'Crear ejercicio'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// SIRID's editor of the global catalog: fixes dataset records, adds its own, and hides the ones gyms should not use.
export default function PlatformExercises() {
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState<PlatformExerciseFilters>({ status: 'all', origin: '' })
  const [exercises, setExercises] = useState<PlatformExercise[]>([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<PlatformExercise | 'new' | null>(null)
  const requestId = useRef(0)

  async function load(nextPage: number, q: string, current: PlatformExerciseFilters) {
    const id = ++requestId.current
    setIsLoading(true)
    setError(null)
    try {
      const response = await getPlatformExercises({ ...current, q: q.length >= 2 ? q : undefined, page: nextPage })
      if (id !== requestId.current) return
      setExercises((items) => nextPage === 1 ? response.exercises : [...items, ...response.exercises])
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

  function replace(exercise: PlatformExercise) {
    setExercises((items) => items.some((item) => item._id === exercise._id)
      ? items.map((item) => item._id === exercise._id ? exercise : item)
      : [exercise, ...items])
  }

  async function patch(exercise: PlatformExercise, data: { isActive?: boolean; unlock?: string[] }) {
    try {
      replace((await updatePlatformExercise(exercise._id, data)).exercise)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No se pudo actualizar el ejercicio.')
    }
  }

  function toggleActive(exercise: PlatformExercise) {
    const message = exercise.isActive
      ? `¿Ocultar "${exercise.name}"? Dejará de aparecer al crear rutinas; las rutinas que ya lo tienen no cambian.`
      : `¿Volver a mostrar "${exercise.name}" en el catálogo?`
    if (window.confirm(message)) void patch(exercise, { isActive: !exercise.isActive })
  }

  const isFiltered = query.trim().length >= 2 || Boolean(filters.muscleGroup) || Boolean(filters.category) || filters.status !== 'all' || Boolean(filters.origin)
  const isFirstLoad = isLoading && exercises.length === 0

  return (
    <section className="min-h-screen bg-canvas px-4 py-8 sm:px-8 sm:py-10">
      <PageHeader
        eyebrow="SIRID"
        title="Catálogo global"
        description="Los ejercicios que ven todos los gimnasios al crear rutinas, según el equipo que tengan registrado."
        actions={(
          <button className={primaryButton} type="button" onClick={() => setEditing('new')}>
            <Plus size={18} aria-hidden /> Nuevo ejercicio
          </button>
        )}
      />

      <Panel
        className="mt-6"
        title="Ejercicios"
        icon={BookOpen}
        description={isFirstLoad ? undefined : `${exercises.length.toLocaleString('es-MX')} de ${total.toLocaleString('es-MX')} ejercicios${isFiltered ? ' con estos filtros' : ''}`}
      >
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_170px_190px_140px_140px]">
          <label className="relative block sm:col-span-2 xl:col-span-1">
            <span className="sr-only">Buscar ejercicios</span>
            <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} aria-hidden />
            <input className={`${fieldClass} pl-10`} type="search" placeholder="Buscar por nombre..." value={query} onChange={(event) => setQuery(event.target.value)} />
          </label>
          <select className={fieldClass} aria-label="Músculo" value={filters.muscleGroup ?? ''} onChange={(event) => setFilters({ ...filters, muscleGroup: event.target.value })}>
            <option value="">Todos los músculos</option>
            {MUSCLE_GROUPS.map((group) => <option key={group} value={group}>{group}</option>)}
          </select>
          <select className={fieldClass} aria-label="Equipo" value={filters.category ?? ''} onChange={(event) => setFilters({ ...filters, category: event.target.value })}>
            <option value="">Todo el equipo</option>
            {EQUIPMENT_CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <select className={fieldClass} aria-label="Estado" value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value as PlatformExerciseFilters['status'] })}>
            <option value="all">Todos</option>
            <option value="active">Visibles</option>
            <option value="inactive">Ocultos</option>
          </select>
          <select className={fieldClass} aria-label="Origen" value={filters.origin} onChange={(event) => setFilters({ ...filters, origin: event.target.value as PlatformExerciseFilters['origin'] })}>
            <option value="">Todo origen</option>
            <option value="dataset">Dataset</option>
            <option value="sirid">SIRID</option>
          </select>
        </div>

        {error && <p className={`${errorAlert} mt-4`} role="alert">{error}</p>}

        <div className="mt-4">
          {isFirstLoad ? (
            <div className="space-y-3" aria-busy="true" aria-label="Cargando ejercicios">
              {Array.from({ length: 6 }).map((_, index) => <div className="skeleton h-14 w-full" key={index} />)}
            </div>
          ) : exercises.length === 0 ? (
            <EmptyState icon={isFiltered ? SearchX : Dumbbell} title={isFiltered ? 'No hay ejercicios con estos filtros' : 'El catálogo está vacío'}>
              {isFiltered ? 'Cambia la búsqueda o los filtros.' : 'Corre el seed del dataset o crea el primer ejercicio SIRID.'}
            </EmptyState>
          ) : (
            <div className="-mx-5 overflow-x-auto sm:-mx-6">
              <table className="min-w-full text-left text-sm">
                <thead className={tableHeadClass}>
                  <tr>
                    <th className={thClass}>Ejercicio</th>
                    <th className={thClass}>Músculo</th>
                    <th className={thClass}>Equipo</th>
                    <th className={thClass}>Origen</th>
                    <th className={thClass}>Bloqueados</th>
                    <th className={thClass}><span className="sr-only">Acciones</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {exercises.map((exercise) => (
                    <tr className={`transition-colors ${exercise.isActive ? 'hover:bg-slate-50' : 'bg-slate-50/70 text-slate-400'}`} key={exercise._id}>
                      <td className={tdClass}>
                        <div className="flex min-w-[14rem] items-center gap-3">
                          {exercise.imageUrl || exercise.gifUrl
                            ? <img className={`h-11 w-11 shrink-0 rounded-xl bg-slate-100 object-cover ring-1 ring-slate-200 ${exercise.isActive ? '' : 'opacity-50 grayscale'}`} src={exercise.imageUrl || exercise.gifUrl} alt="" loading="lazy" />
                            : <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-400"><Dumbbell size={18} aria-hidden /></span>}
                          <div className="min-w-0">
                            <p className={`truncate font-medium ${exercise.isActive ? 'text-ink' : 'line-through'}`}>{exercise.name}</p>
                            <p className="text-xs text-slate-400">{exercise.steps.length} paso{exercise.steps.length === 1 ? '' : 's'}{exercise.isActive ? '' : ' · oculto'}</p>
                          </div>
                        </div>
                      </td>
                      <td className={`${tdClass} whitespace-nowrap`}>{exercise.targetMuscle}</td>
                      <td className={`${tdClass} whitespace-nowrap`}>{exercise.equipment}</td>
                      <td className={`${tdClass} whitespace-nowrap`}>
                        {exercise.origin === 'sirid' ? <Badge tone="brand">SIRID</Badge> : <Badge>Dataset</Badge>}
                      </td>
                      <td className={tdClass}>
                        <div className="flex flex-wrap gap-1">
                          {exercise.lockedFields.map((field) => (
                            <button
                              className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800 ring-1 ring-inset ring-amber-600/20 transition hover:bg-amber-100"
                              key={field}
                              type="button"
                              title="Desbloquear: el próximo seed vuelve a traer el valor del dataset"
                              aria-label={`Desbloquear ${FIELD_LABELS[field] ?? field} de ${exercise.name}`}
                              onClick={() => { if (window.confirm(`¿Desbloquear "${FIELD_LABELS[field] ?? field}"? El próximo seed lo sobrescribe con el dataset.`)) void patch(exercise, { unlock: [field] }) }}
                            >
                              <Lock size={11} aria-hidden />{FIELD_LABELS[field] ?? field}<Unlock size={11} aria-hidden />
                            </button>
                          ))}
                          {!exercise.lockedFields.length && <span className="text-xs text-slate-300">—</span>}
                        </div>
                      </td>
                      <td className={`${tdClass} whitespace-nowrap`}>
                        <div className="flex justify-end gap-0.5">
                          <button className={`${iconButton} hover:text-brand-text`} type="button" aria-label={`Editar ${exercise.name}`} title="Editar" onClick={() => setEditing(exercise)}>
                            <Pencil size={17} aria-hidden />
                          </button>
                          <button
                            className={iconButton}
                            type="button"
                            aria-label={exercise.isActive ? `Ocultar ${exercise.name}` : `Mostrar ${exercise.name}`}
                            title={exercise.isActive ? 'Ocultar' : 'Mostrar'}
                            onClick={() => toggleActive(exercise)}
                          >
                            {exercise.isActive ? <EyeOff size={17} aria-hidden /> : <Eye size={17} aria-hidden />}
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

        {!isFirstLoad && exercises.length > 0 && (hasMore || isLoading) && (
          <div className="mt-4 flex justify-center border-t border-slate-100 pt-4">
            <button className={secondaryButton} type="button" onClick={() => void load(page + 1, query.trim(), filters)} disabled={isLoading}>
              {isLoading ? <><Loader2 className="animate-spin" size={16} aria-hidden /> Cargando...</> : 'Cargar más'}
            </button>
          </div>
        )}
      </Panel>

      {editing && <ExerciseEditor exercise={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={(exercise) => { replace(exercise); setEditing(null) }} />}
    </section>
  )
}
