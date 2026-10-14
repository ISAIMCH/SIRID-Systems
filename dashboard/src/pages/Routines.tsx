import { useEffect, useState } from 'react'
import { Pencil, Plus, Trash2, X } from 'lucide-react'
import {
  createRoutine,
  deleteRoutine,
  getRoutines,
  getUsers,
  updateRoutine,
} from '../services/api'
import type { Routine, RoutineExercise, RoutinePayload } from '../services/api'
import type { User } from '../types'

type RoutineResponse = Routine[] | { data?: unknown; routines?: unknown; rutinas?: unknown }
type UserResponse = User[] | { data?: unknown; users?: unknown }
type RoutineType = 'template' | 'custom'

interface ExerciseFormState {
  name: string
  sets: string
  reps: string
}

interface RoutineFormState {
  title: string
  description: string
  type: RoutineType
  assignedTo: string
  exercises: ExerciseFormState[]
}

const emptyForm: RoutineFormState = {
  title: '',
  description: '',
  type: 'template',
  assignedTo: '',
  exercises: [],
}

function extractArray<T>(value: unknown, keys: string[]): T[] {
  if (Array.isArray(value)) return value as T[]
  if (!value || typeof value !== 'object') return []

  const record = value as Record<string, unknown>
  const candidate = keys.map((key) => record[key]).find((item) => Array.isArray(item))
    ?? Object.values(record).find((item) => Array.isArray(item))

  return Array.isArray(candidate) ? candidate as T[] : []
}

function recordId(record: { id?: string; _id?: string }) {
  return record.id || record._id || ''
}

function relationId(value: Routine['assignedTo']) {
  return typeof value === 'string' ? value : value ? recordId(value) : ''
}

function relationName(value: Routine['assignedTo'], users: User[]) {
  if (typeof value === 'object' && value) return value.name || value.nombre || value.email || '-'
  return users.find((user) => recordId(user) === value)?.name || '-'
}

function formatRoutineType(type?: string) {
  return type?.toLowerCase() === 'custom' ? 'Personalizada' : 'Plantilla'
}

function toExerciseForm(exercise: RoutineExercise): ExerciseFormState {
  return {
    name: exercise.name || '',
    sets: String(exercise.sets ?? ''),
    reps: String(exercise.reps ?? ''),
  }
}

function Routines() {
  const [routines, setRoutines] = useState<Routine[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingRoutine, setEditingRoutine] = useState<Routine | null>(null)
  const [form, setForm] = useState<RoutineFormState>(emptyForm)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [modalError, setModalError] = useState<string | null>(null)

  async function refreshRoutines() {
    const response = await getRoutines<RoutineResponse>()
    setRoutines(extractArray<Routine>(response, ['data', 'routines', 'rutinas']))
  }

  useEffect(() => {
    let isMounted = true

    async function loadData() {
      try {
        const [routinesResponse, usersResponse] = await Promise.all([
          getRoutines<RoutineResponse>(),
          getUsers<UserResponse>(),
        ])
        if (!isMounted) return

        setRoutines(extractArray<Routine>(routinesResponse, ['data', 'routines', 'rutinas']))
        setUsers(extractArray<User>(usersResponse, ['data', 'users']))
        setError(null)
      } catch (requestError) {
        if (isMounted) {
          setError(requestError instanceof Error ? requestError.message : 'No se pudieron cargar las rutinas.')
        }
      } finally {
        if (isMounted) setIsLoading(false)
      }
    }

    loadData()
    return () => {
      isMounted = false
    }
  }, [])

  function openCreateModal() {
    setEditingRoutine(null)
    setForm(emptyForm)
    setModalError(null)
    setIsModalOpen(true)
  }

  function openEditModal(routine: Routine) {
    setEditingRoutine(routine)
    setForm({
      title: routine.title || '',
      description: routine.description || '',
      type: routine.type?.toLowerCase() === 'custom' ? 'custom' : 'template',
      assignedTo: relationId(routine.assignedTo),
      exercises: (routine.exercises || []).map(toExerciseForm),
    })
    setModalError(null)
    setIsModalOpen(true)
  }

  function closeModal() {
    if (isSubmitting) return
    setEditingRoutine(null)
    setForm(emptyForm)
    setModalError(null)
    setIsModalOpen(false)
  }

  function addExercise() {
    setForm((current) => ({
      ...current,
      exercises: [...current.exercises, { name: '', sets: '', reps: '' }],
    }))
  }

  function updateExercise(index: number, field: keyof ExerciseFormState, value: string) {
    setForm((current) => ({
      ...current,
      exercises: current.exercises.map((exercise, exerciseIndex) =>
        exerciseIndex === index ? { ...exercise, [field]: value } : exercise,
      ),
    }))
  }

  function removeExercise(index: number) {
    setForm((current) => ({
      ...current,
      exercises: current.exercises.filter((_, exerciseIndex) => exerciseIndex !== index),
    }))
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setModalError(null)
    setIsSubmitting(true)

    try {
      if (!form.title.trim()) throw new Error('Escribe un título para la rutina.')
      if (form.type === 'custom' && !form.assignedTo) throw new Error('Selecciona un cliente para la rutina personalizada.')

      const payload: RoutinePayload = {
        title: form.title.trim(),
        description: form.description.trim(),
        type: form.type,
        exercises: form.exercises.map((exercise) => ({
          name: exercise.name.trim(),
          sets: Number(exercise.sets) || 0,
          reps: Number(exercise.reps) || 0,
        })),
        ...(form.type === 'custom' ? { assignedTo: form.assignedTo } : {}),
      }

      const routineId = editingRoutine && recordId(editingRoutine)
      if (editingRoutine) {
        if (!routineId) throw new Error('La rutina no tiene un identificador válido.')
        await updateRoutine(routineId, payload)
      } else {
        await createRoutine(payload)
      }

      await refreshRoutines()
      setError(null)
      closeModal()
    } catch (requestError) {
      setModalError(requestError instanceof Error ? requestError.message : 'No se pudo guardar la rutina.')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleDelete(routine: Routine) {
    const routineId = recordId(routine)
    if (!routineId) {
      setError('No se puede eliminar una rutina sin identificador.')
      return
    }
    if (!window.confirm(`¿Eliminar ${routine.title || 'esta rutina'}?`)) return

    try {
      await deleteRoutine(routineId)
      await refreshRoutines()
      setError(null)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No se pudo eliminar la rutina.')
    }
  }

  return (
    <section className="min-h-screen bg-[#F8FAFC] px-8 py-10">
      <p className="text-sm font-medium uppercase tracking-[0.25em] text-slate-500">Entrenamiento</p>
      <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight text-slate-900">Rutinas</h1>
          <p className="mt-3 text-slate-500">Crea plantillas y asigna rutinas personalizadas.</p>
        </div>
        <button
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#9BFF63] px-4 py-2 font-medium text-[#0F172A] transition hover:bg-[#abff7c]"
          type="button"
          onClick={openCreateModal}
        >
          <Plus size={18} aria-hidden="true" />
          Nueva Rutina
        </button>
      </div>

      <div className="mt-8 overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
        {error && <div className="border-b border-red-100 bg-red-50 px-6 py-4 text-sm text-red-700" role="alert">{error}</div>}
        {isLoading ? (
          <div className="space-y-4 p-6" aria-label="Cargando rutinas" aria-busy="true">
            {Array.from({ length: 5 }).map((_, index) => (
              <div className="grid grid-cols-5 gap-6" key={index}>
                {Array.from({ length: 5 }).map((__, columnIndex) => <div className="h-4 animate-pulse rounded bg-slate-200" key={columnIndex} />)}
              </div>
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-100 bg-slate-50/80 text-xs uppercase tracking-wider text-slate-500">
                <tr><th className="px-6 py-4 font-medium">Título</th><th className="px-6 py-4 font-medium">Tipo</th><th className="px-6 py-4 font-medium">Cliente</th><th className="px-6 py-4 font-medium">Ejercicios</th><th className="px-6 py-4" /></tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {routines.length > 0 ? routines.map((routine, index) => {
                  const routineId = recordId(routine) || `routine-${index}`
                  return (
                    <tr className="transition-colors hover:bg-slate-50" key={routineId}>
                      <td className="whitespace-nowrap px-6 py-4 font-medium text-slate-900">{routine.title || 'Sin título'}</td>
                      <td className="px-6 py-4"><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">{formatRoutineType(routine.type)}</span></td>
                      <td className="px-6 py-4 text-slate-500">{routine.assignedTo ? relationName(routine.assignedTo, users) : '-'}</td>
                      <td className="px-6 py-4 text-slate-500">{routine.exercises?.length || 0}</td>
                      <td className="whitespace-nowrap px-6 py-4 text-right"><div className="inline-flex items-center gap-3"><button className="text-slate-400 transition hover:text-green-600" type="button" aria-label="Editar rutina" onClick={() => openEditModal(routine)}><Pencil className="h-4 w-4" aria-hidden="true" /></button><button className="text-slate-400 transition hover:text-red-600" type="button" aria-label="Eliminar rutina" onClick={() => handleDelete(routine)}><Trash2 className="h-4 w-4" aria-hidden="true" /></button></div></td>
                    </tr>
                  )
                }) : <tr><td className="px-6 py-10 text-center text-sm text-slate-500" colSpan={5}>No hay rutinas registradas.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/50 px-4 py-8 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4"><div><p className="text-sm font-medium uppercase tracking-[0.2em] text-emerald-700">Entrenamiento</p><h2 className="mt-2 text-2xl font-semibold text-slate-900">{editingRoutine ? 'Editar rutina' : 'Nueva rutina'}</h2></div><button className="text-slate-400 transition hover:text-slate-700" type="button" aria-label="Cerrar modal" onClick={closeModal}><X size={22} /></button></div>
            <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><div><label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="routine-title">Título</label><input className="w-full rounded-lg border border-slate-200 px-4 py-3 text-slate-900 outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100" id="routine-title" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} required /></div><div><label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="routine-type">Tipo</label><select className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100" id="routine-type" value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value as RoutineType, assignedTo: '' })}><option value="template">Plantilla</option><option value="custom">Personalizada</option></select></div></div>
              <div><label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="routine-description">Descripción</label><textarea className="min-h-24 w-full rounded-lg border border-slate-200 px-4 py-3 text-slate-900 outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100" id="routine-description" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></div>
              {form.type === 'custom' && <div><label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="routine-assigned-to">Cliente</label><select className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100" id="routine-assigned-to" value={form.assignedTo} onChange={(event) => setForm({ ...form, assignedTo: event.target.value })} required><option value="">Selecciona un cliente</option>{users.map((user, index) => <option key={recordId(user) || `user-${index}`} value={recordId(user)}>{user.name || user.firstName || user.email}</option>)}</select></div>}
              <div><div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-semibold text-slate-800">Ejercicios</h3><button className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-green-400 hover:text-green-700" type="button" onClick={addExercise}><Plus size={16} />Agregar Ejercicio</button></div><div className="space-y-3">{form.exercises.map((exercise, index) => <div className="grid grid-cols-[minmax(0,1fr)_5rem_5rem_auto] items-end gap-2 rounded-lg bg-slate-50 p-3" key={index}><div><label className="mb-1 block text-xs text-slate-500" htmlFor={`exercise-name-${index}`}>Nombre</label><input className="w-full rounded border border-slate-200 bg-white px-3 py-2 text-sm" id={`exercise-name-${index}`} value={exercise.name} onChange={(event) => updateExercise(index, 'name', event.target.value)} placeholder="Sentadilla" /></div><div><label className="mb-1 block text-xs text-slate-500" htmlFor={`exercise-sets-${index}`}>Series</label><input className="w-full rounded border border-slate-200 bg-white px-3 py-2 text-sm" id={`exercise-sets-${index}`} type="number" min="0" value={exercise.sets} onChange={(event) => updateExercise(index, 'sets', event.target.value)} /></div><div><label className="mb-1 block text-xs text-slate-500" htmlFor={`exercise-reps-${index}`}>Reps</label><input className="w-full rounded border border-slate-200 bg-white px-3 py-2 text-sm" id={`exercise-reps-${index}`} type="number" min="0" value={exercise.reps} onChange={(event) => updateExercise(index, 'reps', event.target.value)} /></div><button className="rounded p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600" type="button" aria-label="Eliminar ejercicio" onClick={() => removeExercise(index)}><Trash2 size={17} /></button></div>)}</div>{form.exercises.length === 0 && <p className="rounded-lg border border-dashed border-slate-200 px-4 py-5 text-center text-sm text-slate-500">Agrega ejercicios a esta rutina.</p>}</div>
              {modalError && <p className="border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{modalError}</p>}
              <div className="flex justify-end gap-3 pt-2"><button className="rounded-lg px-4 py-2 font-medium text-slate-600 transition hover:bg-slate-100" type="button" onClick={closeModal} disabled={isSubmitting}>Cancelar</button><button className="rounded-lg bg-[#9BFF63] px-4 py-2 font-medium text-[#0F172A] transition hover:bg-[#abff7c] disabled:cursor-not-allowed disabled:opacity-60" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Guardando...' : 'Guardar rutina'}</button></div>
            </form>
          </div>
        </div>
      )}
    </section>
  )
}

export default Routines