import { useEffect, useState, type FormEvent } from 'react'
import { Pencil, Plus, Trash2, X } from 'lucide-react'
import {
  createRoutine,
  deleteRoutine,
  getRoutines,
  getUsers,
  updateRoutine,
} from '../services/api'
import type { Block, Exercise, Routine, RoutinePayload } from '../services/api'
import type { User } from '../types'

type RoutineResponse = Routine[] | { data?: unknown; routines?: unknown; rutinas?: unknown }
type UserResponse = User[] | { data?: unknown; users?: unknown }
type RoutineType = 'template' | 'custom'
type ExerciseMode = 'Fuerza' | 'Cardio'
type BlockStructure = Block['structure']

interface ExerciseFormState {
  name: string
  muscleGroup: string
  equipment: string
  mode: ExerciseMode
  reps: string
  time: string
  suggestedWeight: string
  videoUrl: string
}

interface BlockFormState {
  structure: BlockStructure
  blockSets: string
  restTime: string
  exercises: ExerciseFormState[]
}

interface RoutineFormState {
  title: string
  description: string
  type: RoutineType
  assignedTo: string
  objective: string
  durationWeeks: string
  level: string
  days: string[]
  blocks: BlockFormState[]
}

const daysOfWeek = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

const emptyForm: RoutineFormState = {
  title: '',
  description: '',
  type: 'template',
  assignedTo: '',
  objective: '',
  durationWeeks: '',
  level: '',
  days: [],
  blocks: [],
}

const inputClassName = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100'
const labelClassName = 'mb-1.5 block text-sm font-medium text-slate-700'

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

function toExerciseForm(exercise: Exercise): ExerciseFormState {
  return {
    name: exercise.name || '',
    muscleGroup: exercise.muscleGroup || '',
    equipment: exercise.equipment || '',
    mode: exercise.time !== undefined && exercise.reps === undefined ? 'Cardio' : 'Fuerza',
    reps: String(exercise.reps ?? ''),
    time: String(exercise.time ?? ''),
    suggestedWeight: String(exercise.suggestedWeight ?? ''),
    videoUrl: exercise.videoUrl || '',
  }
}

function toBlockForm(block: Block): BlockFormState {
  return {
    structure: block.structure || 'Individual',
    blockSets: String(block.blockSets ?? 3),
    restTime: String(block.restTime ?? 60),
    exercises: (block.exercises || []).map(toExerciseForm),
  }
}

function createExerciseForm(): ExerciseFormState {
  return {
    name: '',
    muscleGroup: '',
    equipment: '',
    mode: 'Fuerza',
    reps: '',
    time: '',
    suggestedWeight: '',
    videoUrl: '',
  }
}

function createBlockForm(): BlockFormState {
  return {
    structure: 'Individual',
    blockSets: '3',
    restTime: '60',
    exercises: [],
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
      objective: routine.objective || '',
      durationWeeks: String(routine.durationWeeks ?? ''),
      level: routine.level || '',
      days: routine.days || [],
      blocks: (routine.blocks || []).map(toBlockForm),
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

  function updateBlock(index: number, field: keyof Omit<BlockFormState, 'exercises'>, value: string) {
    setForm((current) => ({
      ...current,
      blocks: current.blocks.map((block, blockIndex) =>
        blockIndex === index ? { ...block, [field]: value } : block,
      ),
    }))
  }

  function addBlock() {
    setForm((current) => ({ ...current, blocks: [...current.blocks, createBlockForm()] }))
  }

  function removeBlock(index: number) {
    setForm((current) => ({
      ...current,
      blocks: current.blocks.filter((_, blockIndex) => blockIndex !== index),
    }))
  }

  function addExercise(blockIndex: number) {
    setForm((current) => ({
      ...current,
      blocks: current.blocks.map((block, index) =>
        index === blockIndex ? { ...block, exercises: [...block.exercises, createExerciseForm()] } : block,
      ),
    }))
  }

  function updateExercise(
    blockIndex: number,
    exerciseIndex: number,
    field: keyof ExerciseFormState,
    value: string,
  ) {
    setForm((current) => ({
      ...current,
      blocks: current.blocks.map((block, index) => index === blockIndex
        ? {
            ...block,
            exercises: block.exercises.map((exercise, currentExerciseIndex) =>
              currentExerciseIndex === exerciseIndex ? { ...exercise, [field]: value } : exercise,
            ),
          }
        : block),
    }))
  }

  function removeExercise(blockIndex: number, exerciseIndex: number) {
    setForm((current) => ({
      ...current,
      blocks: current.blocks.map((block, index) => index === blockIndex
        ? { ...block, exercises: block.exercises.filter((_, currentExerciseIndex) => currentExerciseIndex !== exerciseIndex) }
        : block),
    }))
  }

  function toggleDay(day: string) {
    setForm((current) => ({
      ...current,
      days: current.days.includes(day)
        ? current.days.filter((selectedDay) => selectedDay !== day)
        : [...current.days, day],
    }))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
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
        objective: form.objective.trim(),
        durationWeeks: Number(form.durationWeeks) || 0,
        level: form.level,
        days: form.days,
        blocks: form.blocks.map((block) => ({
          structure: block.structure,
          blockSets: Number(block.blockSets) || 0,
          restTime: Number(block.restTime) || 0,
          exercises: block.exercises.map((exercise) => ({
            name: exercise.name.trim(),
            muscleGroup: exercise.muscleGroup.trim(),
            equipment: exercise.equipment.trim(),
            videoUrl: exercise.videoUrl.trim(),
            ...(exercise.mode === 'Cardio'
              ? { time: Number(exercise.time) || 0 }
              : {
                  reps: Number(exercise.reps) || 0,
                  suggestedWeight: Number(exercise.suggestedWeight) || 0,
                }),
          })),
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
      setEditingRoutine(null)
      setForm(emptyForm)
      setModalError(null)
      setIsModalOpen(false)
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

  const controlClassName = inputClassName

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
                  const exerciseCount = routine.blocks?.reduce((total, block) => total + (block.exercises?.length || 0), 0) || 0
                  return (
                    <tr className="transition-colors hover:bg-slate-50" key={routineId}>
                      <td className="whitespace-nowrap px-6 py-4 font-medium text-slate-900">{routine.title || 'Sin título'}</td>
                      <td className="px-6 py-4"><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">{formatRoutineType(routine.type)}</span></td>
                      <td className="px-6 py-4 text-slate-500">{routine.assignedTo ? relationName(routine.assignedTo, users) : '-'}</td>
                      <td className="px-6 py-4 text-slate-500">{exerciseCount}</td>
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
          <div className="my-auto w-full max-w-4xl rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.2em] text-emerald-700">Entrenamiento</p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-900">{editingRoutine ? 'Editar rutina' : 'Nueva rutina'}</h2>
              </div>
              <button className="text-slate-400 transition hover:text-slate-700" type="button" aria-label="Cerrar modal" onClick={closeModal}><X size={22} /></button>
            </div>

            <form className="mt-6 space-y-6" onSubmit={handleSubmit}>
              <section className="space-y-4">
                <h3 className="text-base font-semibold text-slate-900">Información de la rutina</h3>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className={labelClassName} htmlFor="routine-title">Título</label>
                    <input className={controlClassName} id="routine-title" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} required />
                  </div>
                  <div>
                    <label className={labelClassName} htmlFor="routine-type">Tipo</label>
                    <select className={controlClassName} id="routine-type" value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value as RoutineType, assignedTo: '' })}>
                      <option value="template">Plantilla</option>
                      <option value="custom">Personalizada</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelClassName} htmlFor="routine-objective">Objetivo</label>
                    <input className={controlClassName} id="routine-objective" value={form.objective} onChange={(event) => setForm({ ...form, objective: event.target.value })} placeholder="Ej. Ganancia muscular" />
                  </div>
                  <div>
                    <label className={labelClassName} htmlFor="routine-duration">Duración (semanas)</label>
                    <input className={controlClassName} id="routine-duration" type="number" min="1" value={form.durationWeeks} onChange={(event) => setForm({ ...form, durationWeeks: event.target.value })} />
                  </div>
                  <div>
                    <label className={labelClassName} htmlFor="routine-level">Nivel</label>
                    <select className={controlClassName} id="routine-level" value={form.level} onChange={(event) => setForm({ ...form, level: event.target.value })}>
                      <option value="">Selecciona un nivel</option>
                      <option value="Principiante">Principiante</option>
                      <option value="Intermedio">Intermedio</option>
                      <option value="Avanzado">Avanzado</option>
                    </select>
                  </div>
                  {form.type === 'custom' && (
                    <div>
                      <label className={labelClassName} htmlFor="routine-assigned-to">Cliente</label>
                      <select className={controlClassName} id="routine-assigned-to" value={form.assignedTo} onChange={(event) => setForm({ ...form, assignedTo: event.target.value })} required>
                        <option value="">Selecciona un cliente</option>
                        {users.map((user, index) => <option key={recordId(user) || `user-${index}`} value={recordId(user)}>{user.name || user.firstName || user.email}</option>)}
                      </select>
                    </div>
                  )}
                </div>
                <div>
                  <label className={labelClassName} htmlFor="routine-description">Descripción</label>
                  <textarea className={`${controlClassName} min-h-20`} id="routine-description" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
                </div>
                <fieldset>
                  <legend className={labelClassName}>Días de entrenamiento</legend>
                  <div className="flex flex-wrap gap-x-5 gap-y-2">
                    {daysOfWeek.map((day) => (
                      <label className="inline-flex items-center gap-2 text-sm text-slate-700" key={day}>
                        <input className="h-4 w-4 accent-green-600" type="checkbox" checked={form.days.includes(day)} onChange={() => toggleDay(day)} />
                        {day}
                      </label>
                    ))}
                  </div>
                </fieldset>
              </section>

              <section className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900">Bloques de entrenamiento</h3>
                    <p className="mt-1 text-sm text-slate-500">Organiza los ejercicios en bloques individuales, superseries o circuitos.</p>
                  </div>
                  <button className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-green-400 hover:text-green-700" type="button" onClick={addBlock}>
                    <Plus size={16} aria-hidden="true" />Agregar Bloque
                  </button>
                </div>

                {form.blocks.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500">Agrega un bloque para comenzar a construir la rutina.</p>
                ) : (
                  <div className="space-y-4">
                    {form.blocks.map((block, blockIndex) => (
                      <article className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 sm:p-5" key={blockIndex}>
                        <div className="mb-4 flex items-center justify-between gap-3">
                          <h4 className="font-semibold text-slate-900">Bloque {blockIndex + 1}</h4>
                          <button className="inline-flex items-center gap-1 rounded px-2 py-1 text-sm text-slate-400 transition hover:bg-red-50 hover:text-red-600" type="button" onClick={() => removeBlock(blockIndex)} aria-label={`Eliminar bloque ${blockIndex + 1}`}>
                            <Trash2 size={16} aria-hidden="true" />Eliminar bloque
                          </button>
                        </div>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                          <div>
                            <label className={labelClassName} htmlFor={`block-structure-${blockIndex}`}>Estructura</label>
                            <select className={controlClassName} id={`block-structure-${blockIndex}`} value={block.structure} onChange={(event) => updateBlock(blockIndex, 'structure', event.target.value)}>
                              <option value="Individual">Individual</option>
                              <option value="Superset">Superset</option>
                              <option value="Circuito">Circuito</option>
                            </select>
                          </div>
                          <div>
                            <label className={labelClassName} htmlFor={`block-sets-${blockIndex}`}>Series del bloque</label>
                            <input className={controlClassName} id={`block-sets-${blockIndex}`} type="number" min="1" value={block.blockSets} onChange={(event) => updateBlock(blockIndex, 'blockSets', event.target.value)} />
                          </div>
                          <div>
                            <label className={labelClassName} htmlFor={`block-rest-${blockIndex}`}>Descanso (segundos)</label>
                            <input className={controlClassName} id={`block-rest-${blockIndex}`} type="number" min="0" value={block.restTime} onChange={(event) => updateBlock(blockIndex, 'restTime', event.target.value)} />
                          </div>
                        </div>

                        <div className="mt-5 border-t border-slate-200 pt-4">
                          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                            <h5 className="text-sm font-semibold text-slate-800">Ejercicios del bloque</h5>
                            <button className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-green-400 hover:text-green-700" type="button" onClick={() => addExercise(blockIndex)}>
                              <Plus size={15} aria-hidden="true" />Agregar Ejercicio al Bloque
                            </button>
                          </div>

                          {block.exercises.length === 0 ? (
                            <p className="rounded-lg border border-dashed border-slate-200 bg-white px-4 py-4 text-center text-sm text-slate-500">Este bloque todavía no tiene ejercicios.</p>
                          ) : (
                            <div className="space-y-3">
                              {block.exercises.map((exercise, exerciseIndex) => (
                                <div className="rounded-lg border border-slate-200 bg-white p-4" key={exerciseIndex}>
                                  <div className="mb-4 flex items-center justify-between gap-3">
                                    <h6 className="text-sm font-medium text-slate-800">Ejercicio {exerciseIndex + 1}</h6>
                                    <button className="rounded p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600" type="button" aria-label={`Eliminar ejercicio ${exerciseIndex + 1}`} onClick={() => removeExercise(blockIndex, exerciseIndex)}>
                                      <Trash2 size={16} aria-hidden="true" />
                                    </button>
                                  </div>
                                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                    <div>
                                      <label className={labelClassName} htmlFor={`exercise-name-${blockIndex}-${exerciseIndex}`}>Nombre</label>
                                      <input className={controlClassName} id={`exercise-name-${blockIndex}-${exerciseIndex}`} value={exercise.name} onChange={(event) => updateExercise(blockIndex, exerciseIndex, 'name', event.target.value)} placeholder="Ej. Sentadilla" />
                                    </div>
                                    <div>
                                      <label className={labelClassName} htmlFor={`exercise-muscle-${blockIndex}-${exerciseIndex}`}>Grupo muscular</label>
                                      <input className={controlClassName} id={`exercise-muscle-${blockIndex}-${exerciseIndex}`} value={exercise.muscleGroup} onChange={(event) => updateExercise(blockIndex, exerciseIndex, 'muscleGroup', event.target.value)} placeholder="Ej. Piernas" />
                                    </div>
                                    <div>
                                      <label className={labelClassName} htmlFor={`exercise-equipment-${blockIndex}-${exerciseIndex}`}>Equipo</label>
                                      <input className={controlClassName} id={`exercise-equipment-${blockIndex}-${exerciseIndex}`} value={exercise.equipment} onChange={(event) => updateExercise(blockIndex, exerciseIndex, 'equipment', event.target.value)} placeholder="Ej. Barra" />
                                    </div>
                                    <div>
                                      <label className={labelClassName} htmlFor={`exercise-video-${blockIndex}-${exerciseIndex}`}>Video (enlace de GitHub)</label>
                                      <input className={controlClassName} id={`exercise-video-${blockIndex}-${exerciseIndex}`} type="url" value={exercise.videoUrl} onChange={(event) => updateExercise(blockIndex, exerciseIndex, 'videoUrl', event.target.value)} placeholder="https://github.com/..." />
                                    </div>
                                    <div>
                                      <label className={labelClassName} htmlFor={`exercise-mode-${blockIndex}-${exerciseIndex}`}>Tipo de ejercicio</label>
                                      <select className={controlClassName} id={`exercise-mode-${blockIndex}-${exerciseIndex}`} value={exercise.mode} onChange={(event) => updateExercise(blockIndex, exerciseIndex, 'mode', event.target.value)}>
                                        <option value="Fuerza">Fuerza</option>
                                        <option value="Cardio">Cardio</option>
                                      </select>
                                    </div>
                                    {exercise.mode === 'Fuerza' ? (
                                      <>
                                        <div>
                                          <label className={labelClassName} htmlFor={`exercise-reps-${blockIndex}-${exerciseIndex}`}>Repeticiones</label>
                                          <input className={controlClassName} id={`exercise-reps-${blockIndex}-${exerciseIndex}`} type="number" min="1" value={exercise.reps} onChange={(event) => updateExercise(blockIndex, exerciseIndex, 'reps', event.target.value)} />
                                        </div>
                                        <div>
                                          <label className={labelClassName} htmlFor={`exercise-weight-${blockIndex}-${exerciseIndex}`}>Peso sugerido (kg)</label>
                                          <input className={controlClassName} id={`exercise-weight-${blockIndex}-${exerciseIndex}`} type="number" min="0" step="0.5" value={exercise.suggestedWeight} onChange={(event) => updateExercise(blockIndex, exerciseIndex, 'suggestedWeight', event.target.value)} />
                                        </div>
                                      </>
                                    ) : (
                                      <div>
                                        <label className={labelClassName} htmlFor={`exercise-time-${blockIndex}-${exerciseIndex}`}>Tiempo (minutos)</label>
                                        <input className={controlClassName} id={`exercise-time-${blockIndex}-${exerciseIndex}`} type="number" min="1" value={exercise.time} onChange={(event) => updateExercise(blockIndex, exerciseIndex, 'time', event.target.value)} />
                                      </div>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>

              {modalError && <p className="border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{modalError}</p>}
              <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
                <button className="rounded-lg px-4 py-2 font-medium text-slate-600 transition hover:bg-slate-100" type="button" onClick={closeModal} disabled={isSubmitting}>Cancelar</button>
                <button className="rounded-lg bg-[#9BFF63] px-4 py-2 font-medium text-[#0F172A] transition hover:bg-[#abff7c] disabled:cursor-not-allowed disabled:opacity-60" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Guardando...' : 'Guardar rutina'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  )
}

export default Routines
