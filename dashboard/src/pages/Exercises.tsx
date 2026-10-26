import { useEffect, useState, type FormEvent } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { createExercise, deleteExercise, getEquipment, getExercises, updateExercise } from '../services/api'
import type { Exercise, ExercisePayload } from '../services/api'
import type { Equipment } from '../types'
import {
  fetchAndFilterExercises,
  filterExerciseSuggestions,
  type SuggestedExercise,
} from '../utils/exerciseDictionary'

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
const inputClassName = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100'
const labelClassName = 'mb-1.5 block text-sm font-medium text-slate-700'

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
    <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
      {isLoading ? (
        <p className="px-3 py-3 text-sm text-slate-500">Cargando catálogo externo...</p>
      ) : matches.length ? (
        matches.map((suggestion) => (
          <button
            className="flex w-full flex-col items-start px-3 py-2 text-left transition hover:bg-green-50"
            key={suggestion.id}
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onSelect(suggestion)}
          >
            <span className="text-sm font-medium text-slate-900">{suggestion.name}</span>
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
      const error = requestError as {
        response?: { data?: unknown }
        message?: string
      }
      const responseData = error.response?.data
      const responseMessage = responseData && typeof responseData === 'object' && 'message' in responseData
        ? (responseData as { message?: unknown }).message
        : undefined
      alert(JSON.stringify(responseMessage || responseData || error.message))
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

  const filteredExercises = exercises.filter((exercise) =>
    `${exercise.name} ${exercise.muscleGroup} ${exercise.equipment || ''}`
      .toLocaleLowerCase()
      .includes(searchTerm.trim().toLocaleLowerCase()),
  )

  return (
    <section className="min-h-screen bg-[#F8FAFC] px-8 py-10">
      <p className="text-sm font-medium uppercase tracking-[0.25em] text-slate-500">Entrenamiento</p>
      <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight text-slate-900">Ejercicios</h1>
          <p className="mt-3 text-slate-500">Administra el catálogo disponible para construir rutinas.</p>
        </div>
        <button className="inline-flex items-center gap-2 rounded-lg bg-[#9BFF63] px-4 py-2 font-medium text-[#0F172A] transition hover:bg-[#abff7c]" type="button" onClick={openCreateModal}>
          <Plus size={18} aria-hidden="true" />Nuevo ejercicio
        </button>
      </div>

      <div className="mt-8 overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
        {error && <div className="border-b border-red-100 bg-red-50 px-6 py-4 text-sm text-red-700" role="alert">{error}</div>}
        <div className="border-b border-slate-100 p-4">
          <input className="w-full max-w-sm rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100" type="search" placeholder="Buscar ejercicios..." aria-label="Buscar ejercicios" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} />
        </div>
        {isLoading ? (
          <div className="p-6 text-sm text-slate-500">Cargando ejercicios...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-100 bg-slate-50/80 text-xs uppercase tracking-wider text-slate-500">
                <tr><th className="px-6 py-4 font-medium">Nombre</th><th className="px-6 py-4 font-medium">Grupo muscular</th><th className="px-6 py-4 font-medium">Equipo</th><th className="px-6 py-4 text-right font-medium">Acciones</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredExercises.length ? filteredExercises.map((exercise, index) => {
                  const id = recordId(exercise) || `exercise-${index}`
                  return <tr className="hover:bg-slate-50" key={id}>
                    <td className="px-6 py-4 font-medium text-slate-900">{exercise.name}</td>
                    <td className="px-6 py-4 text-slate-500">{exercise.muscleGroup}</td>
                    <td className="px-6 py-4 text-slate-500">{exercise.equipment || 'Peso corporal'}</td>
                    <td className="px-6 py-4 text-right"><div className="inline-flex gap-3">
                      <button className="text-slate-400 hover:text-green-600" type="button" aria-label={`Editar ${exercise.name}`} onClick={() => openEditModal(exercise)}><Pencil size={17} /></button>
                      <button className="text-slate-400 hover:text-red-600" type="button" aria-label={`Eliminar ${exercise.name}`} onClick={() => handleDelete(exercise)}><Trash2 size={17} /></button>
                    </div></td>
                  </tr>
                }) : <tr><td className="px-6 py-10 text-center text-sm text-slate-500" colSpan={4}>No hay ejercicios registrados.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {isModalOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4 backdrop-blur-sm">
        <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
          <div className="flex items-start justify-between gap-4"><div><p className="text-sm font-medium uppercase tracking-[0.2em] text-emerald-700">Catálogo curado</p><h2 className="mt-2 text-2xl font-semibold text-slate-900">{editingExercise ? 'Editar ejercicio' : 'Nuevo ejercicio'}</h2></div><button className="text-2xl text-slate-400" type="button" aria-label="Cerrar modal" onClick={closeModal}>×</button></div>
          <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
            <div><label className={labelClassName} htmlFor="exercise-name">Nombre</label><input className={inputClassName} id="exercise-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Escribe el nombre del ejercicio" required /></div>
            <div className="relative"><label className={labelClassName} htmlFor="exercise-video-search">Buscar Video (GitHub)</label><input className={inputClassName} id="exercise-video-search" value={form.videoSearch} onChange={(event) => setForm({ ...form, videoSearch: event.target.value })} placeholder="Busca un ejercicio para encontrar su video" autoComplete="off" /><ExerciseSuggestions value={form.videoSearch} suggestions={suggestions} isLoading={isCatalogLoading} onSelect={selectSuggestion} /></div>
            <div><label className={labelClassName} htmlFor="exercise-muscle">Grupo muscular</label><select className={inputClassName} id="exercise-muscle" value={form.muscleGroup} onChange={(event) => setForm({ ...form, muscleGroup: event.target.value })} required><option value="">Selecciona un grupo</option>{muscleGroupOptions.map((group) => <option key={group} value={group}>{group}</option>)}</select></div>
            <div><label className={labelClassName} htmlFor="exercise-equipment">Equipo</label><select className={inputClassName} id="exercise-equipment" value={form.equipment} onChange={(event) => setForm({ ...form, equipment: event.target.value })}><option value="">Peso corporal / Ninguno</option>{form.equipment && !equipment.some((item) => item.name === form.equipment) && <option value={form.equipment}>{form.equipment}</option>}{equipment.map((item, index) => <option key={item._id || item.id || `equipment-${index}`} value={item.name}>{item.name}</option>)}</select></div>
            <div><label className={labelClassName} htmlFor="exercise-video">URL del video</label><input className={inputClassName} id="exercise-video" type="url" value={form.videoUrl} onChange={(event) => setForm({ ...form, videoUrl: event.target.value })} placeholder="https://..." /></div>
            {modalError && <p className="border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{modalError}</p>}
            <div className="flex justify-end gap-3 pt-2"><button className="rounded-lg px-4 py-2 font-medium text-slate-600 hover:bg-slate-100" type="button" onClick={closeModal} disabled={isSubmitting}>Cancelar</button><button className="rounded-lg bg-[#9BFF63] px-4 py-2 font-medium text-[#0F172A] disabled:opacity-60" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Guardando...' : 'Guardar'}</button></div>
          </form>
        </div>
      </div>}
    </section>
  )
}

export default Exercises
