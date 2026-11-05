import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Dumbbell, Eye, EyeOff, Loader2, Lock, Pencil, Plus, Search, Unlock, Upload, X } from 'lucide-react'
import { createPlatformExercise, getPlatformExercises, updatePlatformExercise, uploadPlatformExerciseMedia } from '../services/api'
import type { PlatformExercise, PlatformExerciseFilters, PlatformExercisePayload } from '../services/api'
import { EQUIPMENT_CATEGORIES, MUSCLE_GROUPS } from '../utils/exerciseCatalog'

const inputClassName = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100'
const labelClassName = 'mb-1.5 block text-sm font-medium text-slate-700'

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

const MEDIA_ACCEPT = { gif: 'image/gif,image/webp', image: 'image/jpeg,image/png,image/webp' }
const MAX_MEDIA_BYTES = 5 * 1024 * 1024

// URL field with an "upload" shortcut: the file goes to the catalog's R2 bucket and its public URL fills the field.
function MediaField({ id, label, kind, value, required, onChange, onError }: {
  id: string
  label: string
  kind: 'gif' | 'image'
  value: string
  required?: boolean
  onChange: (value: string) => void
  onError: (message: string | null) => void
}) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [isUploading, setIsUploading] = useState(false)

  async function handleFile(file: File | undefined) {
    if (!file) return
    if (file.size > MAX_MEDIA_BYTES) return onError('El archivo supera el tamaño máximo de 5 MB.')
    onError(null)
    setIsUploading(true)
    try {
      onChange((await uploadPlatformExerciseMedia(file, kind)).url)
    } catch (uploadError) {
      onError(uploadError instanceof Error ? uploadError.message : 'No se pudo subir el archivo.')
    } finally {
      setIsUploading(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  return (
    <div>
      <label className={labelClassName} htmlFor={id}>{label}</label>
      <div className="flex gap-2">
        <input className={inputClassName} id={id} type="url" value={value} onChange={(event) => onChange(event.target.value)} required={required} placeholder="https://..." />
        <button
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          type="button"
          onClick={() => fileInput.current?.click()}
          disabled={isUploading}
          aria-label={`Subir ${kind === 'gif' ? 'GIF' : 'miniatura'}`}
        >
          {isUploading ? <Loader2 className="animate-spin" size={16} /> : <Upload size={16} />}
          <span className="hidden sm:inline">{isUploading ? 'Subiendo' : 'Subir'}</span>
        </button>
        <input ref={fileInput} className="hidden" type="file" accept={MEDIA_ACCEPT[kind]} onChange={(event) => handleFile(event.target.files?.[0])} />
      </div>
      {value && (
        <img
          className={`mt-3 rounded-xl border border-slate-100 bg-slate-50 ${kind === 'gif' ? 'h-40 w-40 object-contain' : 'h-20 w-20 object-cover'}`}
          src={value}
          alt={kind === 'gif' ? 'Vista previa del GIF' : 'Vista previa de la miniatura'}
        />
      )}
    </div>
  )
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="platform-exercise-title">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-emerald-700">Catálogo global</p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-900" id="platform-exercise-title">{exercise ? 'Editar ejercicio' : 'Nuevo ejercicio SIRID'}</h2>
            {exercise?.origin === 'dataset' && <p className="mt-1 text-xs text-slate-500">Los campos que cambies quedan bloqueados: el seed del dataset ya no los sobrescribe.</p>}
          </div>
          <button className="text-slate-400 hover:text-slate-700" type="button" aria-label="Cerrar" onClick={onClose}><X size={22} /></button>
        </div>
        <form className="mt-6 grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit}>
          <div className="sm:col-span-2"><label className={labelClassName} htmlFor="pe-name">Nombre</label><input className={inputClassName} id="pe-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></div>
          <div><label className={labelClassName} htmlFor="pe-muscle">Músculo principal</label><select className={inputClassName} id="pe-muscle" value={form.targetMuscle} onChange={(event) => setForm({ ...form, targetMuscle: event.target.value })} required><option value="">Selecciona</option>{MUSCLE_GROUPS.map((group) => <option key={group} value={group}>{group}</option>)}</select></div>
          <div><label className={labelClassName} htmlFor="pe-equipment">Categoría de equipo</label><select className={inputClassName} id="pe-equipment" value={form.equipment} onChange={(event) => setForm({ ...form, equipment: event.target.value })}>{EQUIPMENT_CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}</select></div>
          <div><label className={labelClassName} htmlFor="pe-secondary">Músculos secundarios</label><input className={inputClassName} id="pe-secondary" value={form.secondaryMuscles} onChange={(event) => setForm({ ...form, secondaryMuscles: event.target.value })} placeholder="Tríceps, Hombros" /></div>
          <div><label className={labelClassName} htmlFor="pe-metric">Métrica</label><select className={inputClassName} id="pe-metric" value={form.metricType} onChange={(event) => setForm({ ...form, metricType: event.target.value === 'cardio' ? 'cardio' : 'strength' })}><option value="strength">Fuerza</option><option value="cardio">Cardio</option></select></div>
          <MediaField id="pe-gif" label="GIF de la técnica" kind="gif" value={form.gifUrl} required onChange={(gifUrl) => setForm((current) => ({ ...current, gifUrl }))} onError={setError} />
          <MediaField id="pe-image" label="Miniatura (opcional)" kind="image" value={form.imageUrl} onChange={(imageUrl) => setForm((current) => ({ ...current, imageUrl }))} onError={setError} />
          <div className="sm:col-span-2"><label className={labelClassName} htmlFor="pe-steps">Pasos (uno por línea)</label><textarea className={`${inputClassName} min-h-32`} id="pe-steps" value={form.steps} onChange={(event) => setForm({ ...form, steps: event.target.value })} /></div>
          {error && <p className="border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700 sm:col-span-2" role="alert">{error}</p>}
          <div className="flex justify-end gap-3 pt-2 sm:col-span-2">
            <button className="rounded-lg px-4 py-2 font-medium text-slate-600 hover:bg-slate-100" type="button" onClick={onClose} disabled={isSubmitting}>Cancelar</button>
            <button className="rounded-lg bg-[#9BFF63] px-4 py-2 font-medium text-[#0F172A] disabled:opacity-60" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Guardando...' : 'Guardar'}</button>
          </div>
        </form>
      </div>
    </div>
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

  return (
    <section className="min-h-screen bg-gray-50 px-5 py-8 sm:px-8 sm:py-10">
      <p className="text-sm font-medium uppercase tracking-[0.25em] text-slate-500">SIRID</p>
      <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight text-slate-900">Catálogo global de ejercicios</h1>
          <p className="mt-3 text-slate-500">Lo que ven todos los gimnasios al crear rutinas, según el equipo que tengan registrado.</p>
        </div>
        <button className="inline-flex items-center gap-2 rounded-lg bg-[#9BFF63] px-4 py-2 font-medium text-[#0F172A] hover:bg-[#abff7c]" type="button" onClick={() => setEditing('new')}>
          <Plus size={18} aria-hidden="true" />Nuevo ejercicio
        </button>
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
        <div className="grid gap-3 border-b border-gray-100 p-5 sm:grid-cols-[1fr_170px_190px_150px_150px]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} aria-hidden="true" />
            <input className={`${inputClassName} pl-9`} type="search" placeholder="Buscar por nombre..." aria-label="Buscar ejercicios" value={query} onChange={(event) => setQuery(event.target.value)} />
          </div>
          <select className={inputClassName} aria-label="Músculo" value={filters.muscleGroup ?? ''} onChange={(event) => setFilters({ ...filters, muscleGroup: event.target.value })}>
            <option value="">Todos los músculos</option>{MUSCLE_GROUPS.map((group) => <option key={group} value={group}>{group}</option>)}
          </select>
          <select className={inputClassName} aria-label="Equipo" value={filters.category ?? ''} onChange={(event) => setFilters({ ...filters, category: event.target.value })}>
            <option value="">Todo el equipo</option>{EQUIPMENT_CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <select className={inputClassName} aria-label="Estado" value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value as PlatformExerciseFilters['status'] })}>
            <option value="all">Todos</option><option value="active">Visibles</option><option value="inactive">Ocultos</option>
          </select>
          <select className={inputClassName} aria-label="Origen" value={filters.origin} onChange={(event) => setFilters({ ...filters, origin: event.target.value as PlatformExerciseFilters['origin'] })}>
            <option value="">Todo origen</option><option value="dataset">Dataset</option><option value="sirid">SIRID</option>
          </select>
        </div>
        {error && <div className="border-b border-red-100 bg-red-50 px-6 py-4 text-sm text-red-700" role="alert">{error}</div>}
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-gray-100 bg-gray-50/80 text-xs uppercase tracking-wider text-slate-500">
              <tr><th className="px-5 py-4 font-medium">Ejercicio</th><th className="px-5 py-4 font-medium">Músculo</th><th className="px-5 py-4 font-medium">Equipo</th><th className="px-5 py-4 font-medium">Origen</th><th className="px-5 py-4 font-medium">Bloqueados</th><th className="px-5 py-4 text-right font-medium">Acciones</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-slate-700">
              {exercises.map((exercise) => (
                <tr className={exercise.isActive ? 'hover:bg-slate-50' : 'bg-slate-50/60 text-slate-400'} key={exercise._id}>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      {exercise.imageUrl || exercise.gifUrl
                        ? <img className="h-10 w-10 shrink-0 rounded-full bg-slate-100 object-cover" src={exercise.imageUrl || exercise.gifUrl} alt="" loading="lazy" />
                        : <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-400"><Dumbbell size={18} /></span>}
                      <div>
                        <p className={`font-medium ${exercise.isActive ? 'text-slate-900' : 'line-through'}`}>{exercise.name}</p>
                        <p className="text-xs text-slate-400">{exercise.steps.length} pasos{exercise.isActive ? '' : ' · oculto'}</p>
                      </div>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-5 py-3">{exercise.targetMuscle}</td>
                  <td className="whitespace-nowrap px-5 py-3">{exercise.equipment}</td>
                  <td className="whitespace-nowrap px-5 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${exercise.origin === 'sirid' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{exercise.origin === 'sirid' ? 'SIRID' : 'Dataset'}</span></td>
                  <td className="px-5 py-3">
                    <div className="flex flex-wrap gap-1">
                      {exercise.lockedFields.map((field) => (
                        <button className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs text-amber-800 hover:bg-amber-100" key={field} type="button" title="Desbloquear: el próximo seed vuelve a traer el valor del dataset" onClick={() => { if (window.confirm(`¿Desbloquear "${FIELD_LABELS[field] ?? field}"? El próximo seed lo sobrescribe con el dataset.`)) void patch(exercise, { unlock: [field] }) }}>
                          <Lock size={11} aria-hidden="true" />{FIELD_LABELS[field] ?? field}<Unlock size={11} aria-hidden="true" />
                        </button>
                      ))}
                      {!exercise.lockedFields.length && <span className="text-xs text-slate-300">—</span>}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-right">
                    <div className="inline-flex gap-3">
                      <button className="text-slate-400 hover:text-green-600" type="button" aria-label={`Editar ${exercise.name}`} onClick={() => setEditing(exercise)}><Pencil size={17} /></button>
                      <button className="text-slate-400 hover:text-slate-700" type="button" aria-label={exercise.isActive ? `Ocultar ${exercise.name}` : `Mostrar ${exercise.name}`} onClick={() => toggleActive(exercise)}>{exercise.isActive ? <EyeOff size={17} /> : <Eye size={17} />}</button>
                    </div>
                  </td>
                </tr>
              ))}
              {!isLoading && !exercises.length && <tr><td className="px-6 py-10 text-center text-sm text-slate-500" colSpan={6}>No hay ejercicios con estos filtros.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-gray-100 px-5 py-4 text-sm text-slate-500">
          <span>{exercises.length} de {total} ejercicios</span>
          {isLoading
            ? <span>Cargando...</span>
            : hasMore && <button className="rounded-lg border border-slate-200 px-4 py-2 font-medium text-slate-700 hover:bg-slate-50" type="button" onClick={() => void load(page + 1, query.trim(), filters)}>Cargar más</button>}
        </div>
      </div>

      {editing && <ExerciseEditor exercise={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={(exercise) => { replace(exercise); setEditing(null) }} />}
    </section>
  )
}
