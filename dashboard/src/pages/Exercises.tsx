import { useEffect, useState, type FormEvent } from 'react'
import { Activity, Boxes, Dumbbell, Pencil, PlayCircle, Plus, Search, Trash2 } from 'lucide-react'
import { createExercise, deleteExercise, getEquipment, getExercises, updateExercise } from '../services/api'
import type { Exercise, ExercisePayload } from '../services/api'
import type { Equipment } from '../types'
import GlobalExerciseCatalog from '../components/GlobalExerciseCatalog'
import {
  fetchAndFilterExercises,
  filterExerciseSuggestions,
  type SuggestedExercise,
} from '../utils/exerciseDictionary'
import PageHeader from '../components/ui/PageHeader'
import Panel from '../components/ui/Panel'
import Modal from '../components/ui/Modal'
import KpiCard from '../components/ui/KpiCard'
import Badge from '../components/ui/Badge'
import EmptyState from '../components/ui/EmptyState'
import Segmented from '../components/ui/Segmented'
import { errorAlert, fieldClass, hintClass, iconButton, labelClass, primaryButton, secondaryButton, tableHeadClass, tdClass, thClass } from '../components/ui/styles'

type ExercisesResponse = Exercise[] | { data?: unknown; exercises?: unknown }
type EquipmentResponse = Equipment[] | { data?: unknown; equipment?: unknown }

const muscleGroupOptions = [
  'Abdominales',
  'Abductores',
  'Aductores',
  'Antebrazos',
  'Bíceps',
  'Cardio',
  'Cuello',
  'Cuádriceps',
  'Dorsales',
  'Espalda',
  'Femoral',
  'Gemelos',
  'Glúteos',
  'Hombros',
  'Lumbar',
  'Pecho',
  'Trapecio',
  'Tríceps',
]

interface ExerciseFormState {
  name: string
  videoSearch: string
  muscleGroup: string
  equipment: string
  videoUrl: string
}

const emptyForm: ExerciseFormState = {
  name: '',
  videoSearch: '',
  muscleGroup: '',
  equipment: '',
  videoUrl: '',
}

function recordId(record: { id?: string; _id?: string }) {
  return record.id || record._id || ''
}

function extractExercises(response: ExercisesResponse) {
  if (Array.isArray(response)) return response
  const candidate = response.data || response.exercises || []
  return Array.isArray(candidate) ? candidate as Exercise[] : []
}

function extractEquipment(response: EquipmentResponse) {
  if (Array.isArray(response)) return response
  const candidate = response.data || response.equipment || []
  return Array.isArray(candidate) ? candidate as Equipment[] : []
}

function ExerciseIcon() {
  return (
    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-500" aria-hidden="true">
      <Dumbbell size={18} />
    </span>
  )
}

function ExerciseSuggestions({
  value,
  suggestions,
  isLoading,
  onSelect,
}: {
  value: string
  suggestions: SuggestedExercise[]
  isLoading: boolean
  onSelect: (suggestion: SuggestedExercise) => void
}) {
  const matches = filterExerciseSuggestions(suggestions, value)
  if (!value.trim()) return null

  return (
    <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lift">
      {isLoading ? (
        <p className="px-3 py-3 text-sm text-slate-500">Cargando catálogo externo...</p>
      ) : matches.length ? (
        matches.map((suggestion) => (
          <button
            className="flex w-full flex-col items-start px-3.5 py-2 text-left transition hover:bg-brand-soft"
            key={suggestion.id}
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onSelect(suggestion)}
          >
            <span className="text-sm font-medium text-ink">{suggestion.name}</span>
            <span className="text-xs text-slate-500">
              {suggestion.muscleGroup} · {suggestion.equipment || 'Peso corporal'}
            </span>
          </button>
        ))
      ) : (
        <p className="px-3 py-3 text-sm text-slate-500">No hay sugerencias para esta búsqueda.</p>
      )}
    </div>
  )
}

function Exercises() {
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [equipment, setEquipment] = useState<Equipment[]>([])
  const [suggestions, setSuggestions] = useState<SuggestedExercise[]>([])
  const [isCatalogLoading, setIsCatalogLoading] = useState(true)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingExercise, setEditingExercise] = useState<Exercise | null>(null)
  const [form, setForm] = useState<ExerciseFormState>(emptyForm)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [modalError, setModalError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [muscleFilter, setMuscleFilter] = useState('')
  const [tab, setTab] = useState<'custom' | 'global'>('custom')

  async function loadExercises() {
    const response = await getExercises<ExercisesResponse>()
    setExercises(extractExercises(response))
  }

  useEffect(() => {
    let isMounted = true
    Promise.all([loadExercises(), getEquipment<EquipmentResponse>().then((response) => {
      if (isMounted) setEquipment(extractEquipment(response))
    }), fetchAndFilterExercises()])
      .then(([, , catalog]) => {
        if (isMounted) setSuggestions(catalog)
      })
      .catch((requestError: unknown) => {
        if (isMounted) setError(requestError instanceof Error ? requestError.message : 'No se pudieron cargar los ejercicios.')
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false)
          setIsCatalogLoading(false)
        }
      })

    return () => {
      isMounted = false
    }
  }, [])

  function openCreateModal() {
    setEditingExercise(null)
    setForm(emptyForm)
    setModalError(null)
    setIsModalOpen(true)
  }

  function openEditModal(exercise: Exercise) {
    setEditingExercise(exercise)
    setForm({
      name: exercise.name || '',
      videoSearch: '',
      muscleGroup: muscleGroupOptions.includes(exercise.muscleGroup || '') ? exercise.muscleGroup || '' : '',
      equipment: exercise.equipment || '',
      videoUrl: exercise.videoUrl || '',
    })
    setModalError(null)
    setIsModalOpen(true)
  }

  function closeModal() {
    if (isSubmitting) return
    setEditingExercise(null)
    setForm(emptyForm)
    setModalError(null)
    setIsModalOpen(false)
  }

  function selectSuggestion(suggestion: SuggestedExercise) {
    setForm((current) => ({
      ...current,
      name: current.name.trim() ? current.name : suggestion.name,
      videoSearch: suggestion.name,
      muscleGroup: suggestion.muscleGroup,
      videoUrl: suggestion.videoUrl,
    }))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setModalError(null)
    setIsSubmitting(true)

    try {
      const payload: ExercisePayload = {
        name: form.name.trim(),
        muscleGroup: form.muscleGroup.trim(),
        equipment: form.equipment.trim() || null,
        videoUrl: form.videoUrl.trim() || null,
      }
      if (!payload.name || !payload.muscleGroup) throw new Error('El nombre y el grupo muscular son obligatorios.')
      if (!muscleGroupOptions.includes(payload.muscleGroup)) throw new Error('Selecciona un grupo muscular válido.')

      const id = editingExercise && recordId(editingExercise)
      if (editingExercise) {
        if (!id) throw new Error('El ejercicio no tiene un identificador válido.')
        await updateExercise(id, payload)
      } else {
        await createExercise(payload)
      }

      await loadExercises()
      setError(null)
      closeModal()
    } catch (requestError) {
      setModalError(requestError instanceof Error ? requestError.message : 'No se pudo guardar el ejercicio.')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleDelete(exercise: Exercise) {
    const id = recordId(exercise)
    if (!id) {
      setError('El ejercicio no tiene un identificador válido.')
      return
    }
    if (!window.confirm(`¿Eliminar el ejercicio "${exercise.name}"?`)) return

    try {
      await deleteExercise(id)
      await loadExercises()
      setError(null)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No se pudo eliminar el ejercicio.')
    }
  }

  const query = searchTerm.trim().toLocaleLowerCase()
  const filteredExercises = exercises.filter((exercise) =>
    `${exercise.name} ${exercise.muscleGroup} ${exercise.equipment || ''}`.toLocaleLowerCase().includes(query)
    && (muscleFilter === '' || exercise.muscleGroup === muscleFilter),
  )
  const usedMuscleGroups = [...new Set(exercises.map((exercise) => exercise.muscleGroup).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'))
  const equippedExerciseCount = exercises.filter((exercise) => exercise.equipment).length
  const withVideoCount = exercises.filter((exercise) => exercise.videoUrl).length
  const isFiltered = query !== '' || muscleFilter !== ''

  const rowActions = (exercise: Exercise) => (
    <div className="flex items-center justify-end gap-1">
      {exercise.videoUrl && (
        <a className={`${iconButton} hover:text-sky-700`} href={exercise.videoUrl} target="_blank" rel="noreferrer" aria-label={`Ver video de ${exercise.name}`} title="Ver video">
          <PlayCircle size={17} aria-hidden />
        </a>
      )}
      <button className={`${iconButton} hover:text-brand-text`} type="button" aria-label={`Editar ${exercise.name}`} title="Editar" onClick={() => openEditModal(exercise)}>
        <Pencil size={17} aria-hidden />
      </button>
      <button className={`${iconButton} hover:bg-red-50 hover:text-red-600`} type="button" aria-label={`Eliminar ${exercise.name}`} title="Eliminar" onClick={() => void handleDelete(exercise)}>
        <Trash2 size={17} aria-hidden />
      </button>
    </div>
  )

  return (
    <section className="min-h-screen bg-canvas px-4 py-8 sm:px-8 sm:py-10">
      <PageHeader
        eyebrow="Entrenamiento"
        title="Ejercicios"
        description="Los ejercicios con los que tus coaches arman rutinas: los propios del gimnasio y los del catálogo global que desbloquea tu equipo."
        actions={tab === 'custom' && (
          <button className={primaryButton} type="button" onClick={openCreateModal}>
            <Plus size={18} aria-hidden /> Nuevo ejercicio
          </button>
        )}
      />

      <div className="mt-6">
        <Segmented label="Catálogo" value={tab} options={[['custom', 'Mis ejercicios'], ['global', 'Catálogo global']] as const} onChange={setTab} />
      </div>

      {tab === 'global' ? <GlobalExerciseCatalog /> : (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
            <KpiCard label="Ejercicios propios" value={exercises.length} icon={Dumbbell} tone="brand" isLoading={isLoading} hint="Creados por tu gimnasio" />
            <KpiCard label="Grupos musculares" value={usedMuscleGroups.length} icon={Activity} isLoading={isLoading} hint={`De ${muscleGroupOptions.length} posibles`} />
            <KpiCard label="Con equipo" value={equippedExerciseCount} icon={Boxes} isLoading={isLoading} hint={`${exercises.length - equippedExerciseCount} con peso corporal`} />
            <KpiCard label="Con video" value={withVideoCount} icon={PlayCircle} isLoading={isLoading} hint={exercises.length - withVideoCount > 0 ? `${exercises.length - withVideoCount} sin video` : 'Todos tienen video'} />
          </div>

          <Panel
            className="mt-6"
            title="Mis ejercicios"
            icon={Dumbbell}
            description={isLoading ? undefined : isFiltered ? `${filteredExercises.length} de ${exercises.length} ejercicios` : `${exercises.length} ejercicio${exercises.length === 1 ? '' : 's'} en tu catálogo`}
          >
            {error && <p className={`${errorAlert} mb-4`} role="alert">{error}</p>}

            <div className="flex flex-col gap-2 sm:flex-row">
              <label className="relative block sm:w-72">
                <span className="sr-only">Buscar ejercicios</span>
                <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} aria-hidden />
                <input className={`${fieldClass} pl-10`} type="search" placeholder="Buscar por nombre o equipo" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} />
              </label>
              {usedMuscleGroups.length > 1 && (
                <select className={`${fieldClass} sm:w-52`} aria-label="Grupo muscular" value={muscleFilter} onChange={(event) => setMuscleFilter(event.target.value)}>
                  <option value="">Todos los músculos</option>
                  {usedMuscleGroups.map((group) => <option key={group} value={group}>{group}</option>)}
                </select>
              )}
            </div>

            <div className="mt-4">
              {isLoading ? (
                <div className="space-y-3" aria-busy="true" aria-label="Cargando ejercicios">
                  {Array.from({ length: 5 }).map((_, index) => <div className="skeleton h-14 w-full" key={index} />)}
                </div>
              ) : filteredExercises.length === 0 ? (
                <EmptyState icon={Dumbbell} title={exercises.length === 0 ? 'Aún no tienes ejercicios propios' : 'Sin coincidencias'}>
                  {exercises.length === 0
                    ? 'Crea los ejercicios propios de tu gimnasio, o usa los del catálogo global para armar rutinas.'
                    : 'Prueba con otro nombre o grupo muscular.'}
                </EmptyState>
              ) : (
                <>
                  {/* Phones: one card per exercise. */}
                  <ul className="space-y-3 md:hidden">
                    {filteredExercises.map((exercise, index) => (
                      <li className="rounded-xl border border-slate-200 p-4" key={recordId(exercise) || `exercise-${index}`}>
                        <div className="flex items-start gap-3">
                          <ExerciseIcon />
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-semibold text-ink">{exercise.name}</p>
                            <div className="mt-1.5 flex flex-wrap gap-1.5">
                              <Badge tone="brand">{exercise.muscleGroup}</Badge>
                              <Badge>{exercise.equipment || 'Peso corporal'}</Badge>
                            </div>
                          </div>
                          {rowActions(exercise)}
                        </div>
                      </li>
                    ))}
                  </ul>

                  {/* Tablets and up: a table. */}
                  <div className="-mx-5 hidden overflow-x-auto sm:-mx-6 md:block">
                    <table className="min-w-full text-left text-sm">
                      <thead className={tableHeadClass}>
                        <tr>
                          <th className={thClass}>Ejercicio</th>
                          <th className={thClass}>Grupo muscular</th>
                          <th className={thClass}>Equipo</th>
                          <th className={thClass}><span className="sr-only">Acciones</span></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-700">
                        {filteredExercises.map((exercise, index) => (
                          <tr className="transition-colors hover:bg-slate-50/70" key={recordId(exercise) || `exercise-${index}`}>
                            <td className={tdClass}>
                              <div className="flex items-center gap-3">
                                <ExerciseIcon />
                                <p className="font-semibold text-ink">{exercise.name}</p>
                              </div>
                            </td>
                            <td className={tdClass}><Badge tone="brand">{exercise.muscleGroup}</Badge></td>
                            <td className={`${tdClass} text-slate-500`}>{exercise.equipment || 'Peso corporal'}</td>
                            <td className={tdClass}>{rowActions(exercise)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </Panel>
        </>
      )}

      {isModalOpen && (
        <Modal eyebrow="Mis ejercicios" title={editingExercise ? 'Editar ejercicio' : 'Nuevo ejercicio'} onClose={closeModal}>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className={labelClass} htmlFor="exercise-name">Nombre</label>
              <input className={fieldClass} id="exercise-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Ej. Press de banca inclinado" required />
            </div>

            <div>
              <label className={labelClass} htmlFor="exercise-video-search">Buscar un video de referencia</label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} aria-hidden />
                <input className={`${fieldClass} pl-10`} id="exercise-video-search" value={form.videoSearch} onChange={(event) => setForm({ ...form, videoSearch: event.target.value })} placeholder="Escribe un ejercicio para sugerir video y músculo" autoComplete="off" />
                <ExerciseSuggestions value={form.videoSearch} suggestions={suggestions} isLoading={isCatalogLoading} onSelect={selectSuggestion} />
              </div>
              <p className={hintClass}>Al elegir una sugerencia se llenan el grupo muscular y la URL del video.</p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass} htmlFor="exercise-muscle">Grupo muscular</label>
                <select className={fieldClass} id="exercise-muscle" value={form.muscleGroup} onChange={(event) => setForm({ ...form, muscleGroup: event.target.value })} required>
                  <option value="">Selecciona un grupo</option>
                  {muscleGroupOptions.map((group) => <option key={group} value={group}>{group}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass} htmlFor="exercise-equipment">Equipo</label>
                <select className={fieldClass} id="exercise-equipment" value={form.equipment} onChange={(event) => setForm({ ...form, equipment: event.target.value })}>
                  <option value="">Peso corporal / Ninguno</option>
                  {form.equipment && !equipment.some((item) => item.name === form.equipment) && <option value={form.equipment}>{form.equipment}</option>}
                  {equipment.map((item, index) => <option key={item._id || item.id || `equipment-${index}`} value={item.name}>{item.name}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className={labelClass} htmlFor="exercise-video">URL del video</label>
              <input className={fieldClass} id="exercise-video" type="url" value={form.videoUrl} onChange={(event) => setForm({ ...form, videoUrl: event.target.value })} placeholder="https://..." />
            </div>

            {modalError && <p className={errorAlert} role="alert">{modalError}</p>}

            <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
              <button className={secondaryButton} type="button" onClick={closeModal} disabled={isSubmitting}>Cancelar</button>
              <button className={primaryButton} type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Guardando...' : editingExercise ? 'Guardar cambios' : 'Crear ejercicio'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  )
}

export default Exercises
