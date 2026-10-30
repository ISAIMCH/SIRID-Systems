import { useEffect, useState, type FormEvent } from 'react'
import { Pencil, Plus, Trash2, UserRoundPlus, X } from 'lucide-react'
import {
  assignTemplateToClient,
  createRoutine,
  createTemplate,
  deleteRoutine,
  deleteTemplate,
  getExercises,
  getEquipment,
  getRoutines,
  getTemplates,
  getUsers,
  updateRoutine,
  updateTemplate,
} from '../services/api'
import type {
  Routine,
  RoutineBlock,
  RoutineExercise,
  RoutinePayload,
  RoutineTemplate,
  RoutineTemplatePayload,
  Exercise as CuratedExercise,
} from '../services/api'
import { socket } from '../services/socket'
import type { Equipment, User } from '../types'

type ArrayResponse<T> = T[] | {
  data?: unknown
  routines?: unknown
  rutinas?: unknown
  templates?: unknown
  routineTemplates?: unknown
  users?: unknown
  equipment?: unknown
}
type BuilderMode = 'template' | 'routine'
type ExerciseMode = 'Fuerza' | 'Cardio'
type BlockType = RoutineBlock['type']

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
const customMuscleGroupOption = 'other'
const customEquipmentOption = 'other'

interface ExerciseFormState {
  exerciseId: string
  name: string
  muscleGroup: string
  customMuscleGroup: string
  equipment: string
  customEquipment: string
  mode: ExerciseMode
  reps: string
  weight: string
  duration: string
  distance: string
  level: string
  videoUrl: string
}

interface BlockFormState {
  type: BlockType
  sets: string
  restSeconds: string
  dayOfWeek: string
  exercises: ExerciseFormState[]
}

interface RoutineFormState {
  title: string
  objective: string
  level: string
  durationWeeks: string
  assignedTo: string
  blocks: BlockFormState[]
}

const daysOfWeek = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
const inputClassName = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100'
const labelClassName = 'mb-1.5 block text-sm font-medium text-slate-700'

const emptyForm: RoutineFormState = {
  title: '',
  objective: '',
  level: '',
  durationWeeks: '',
  assignedTo: '',
  blocks: [],
}

function extractArray<T>(value: unknown, keys: string[]): T[] {
  if (Array.isArray(value)) return value as T[]
  if (!value || typeof value !== 'object') return []

  const record = value as Record<string, unknown>
  const candidate = keys.map((key) => record[key]).find(Array.isArray)
    ?? Object.values(record).find(Array.isArray)

  return Array.isArray(candidate) ? candidate as T[] : []
}

function recordId(record: { id?: string; _id?: string }) {
  const id = record.id ?? record._id
  return id == null ? '' : String(id)
}

function routineAssignedTo(routine: Routine): Routine['assignedTo'] {
  const record = routine as Routine & Record<string, unknown>
  const value = record.assignedTo
    ?? record.assignedToId
    ?? record.clientId
    ?? record.userId
    ?? record.client
    ?? record.user

  if (typeof value === 'string' || (value && typeof value === 'object')) {
    return value as Routine['assignedTo']
  }
  return null
}

function assignedUserId(value: Routine['assignedTo']) {
  if (typeof value === 'string') return value
  if (!value || typeof value !== 'object') return ''
  return recordId(value)
}

function relationName(value: Routine['assignedTo'], users: User[]) {
  if (typeof value === 'object' && value) {
    const relation = value as { name?: string; firstName?: string; nombre?: string; lastName?: string; email?: string }
    const relatedUser = users.find((user) => recordId(user) === recordId(value))
    return relatedUser
      ? userLabel(relatedUser)
      : [relation.name || relation.firstName || relation.nombre || '', relation.lastName].filter(Boolean).join(' ') || relation.email || '-'
  }
  const relatedUser = users.find((user) => recordId(user) === value)
  return relatedUser ? userLabel(relatedUser) : '-'
}

function userLabel(user: User) {
  return [user.name || user.firstName, user.lastName].filter(Boolean).join(' ') || user.email
}

function isClient(user: User) {
  return user.role.toLowerCase() === 'cliente' || user.role.toLowerCase() === 'client'
}

function toExerciseForm(exercise: RoutineExercise, equipmentNames: readonly string[] = []): ExerciseFormState {
  const isCardio = exercise.isCardio ?? (exercise.targetDuration !== undefined || exercise.time !== undefined)
  const muscleGroup = exercise.muscleGroup || ''
  const isPresetMuscleGroup = muscleGroupOptions.includes(muscleGroup)
  const equipmentName = exercise.equipment || ''
  const isPresetEquipment = !equipmentName || equipmentNames.includes(equipmentName)
  return {
    exerciseId: exercise.exerciseId || '',
    name: exercise.name || '',
    muscleGroup: isPresetMuscleGroup ? muscleGroup : customMuscleGroupOption,
    customMuscleGroup: isPresetMuscleGroup ? '' : muscleGroup,
    equipment: isPresetEquipment ? equipmentName : customEquipmentOption,
    customEquipment: isPresetEquipment ? '' : equipmentName,
    mode: isCardio ? 'Cardio' : 'Fuerza',
    reps: String(exercise.targetReps ?? exercise.reps ?? ''),
    weight: String(exercise.targetWeight ?? exercise.weight ?? ''),
    duration: String(exercise.targetDuration ?? exercise.time ?? ''),
    distance: String(exercise.targetDistance ?? ''),
    level: String(exercise.targetLevel ?? ''),
    videoUrl: exercise.videoUrl || '',
  }
}

function toBlockForm(block: RoutineBlock, equipmentNames: readonly string[] = []): BlockFormState {
  const legacyStructure = block.structure
  const type = block.type || (legacyStructure === 'Superset' ? 'superset' : legacyStructure === 'Circuito' ? 'circuit' : 'single')
  const legacyDay = block.scheduleDays?.map((day) => daysOfWeek.indexOf(day)).find((day) => day >= 0)
  return {
    type,
    sets: String(block.sets ?? block.blockSets ?? 3),
    restSeconds: String(block.restSeconds ?? block.restTime ?? 60),
    dayOfWeek: String(block.dayOfWeek ?? legacyDay ?? 0),
    exercises: (block.exercises || []).map((exercise) => toExerciseForm(exercise, equipmentNames)),
  }
}

function createExerciseForm(): ExerciseFormState {
  return {
    exerciseId: '',
    name: '',
    muscleGroup: '',
    customMuscleGroup: '',
    equipment: '',
    customEquipment: '',
    mode: 'Fuerza',
    reps: '',
    weight: '',
    duration: '',
    distance: '',
    level: '',
    videoUrl: '',
  }
}

function createBlockForm(): BlockFormState {
  return { type: 'single', sets: '3', restSeconds: '60', dayOfWeek: '0', exercises: [] }
}

function exerciseCount(blocks: RoutineBlock[] | undefined) {
  return blocks?.reduce((total, block) => total + (block.exercises?.length || 0), 0) || 0
}

function routineScheduleDays(blocks: RoutineBlock[] | undefined) {
  return [...new Set(blocks?.map((block) => daysOfWeek[block.dayOfWeek] || block.scheduleDays?.join(', ') || '') || [])].filter(Boolean)
}

function RoutineSkeleton() {
  return (
    <div className="space-y-4 p-6" aria-label="Cargando rutinas" aria-busy="true">
      {Array.from({ length: 4 }).map((_, index) => (
        <div className="grid grid-cols-5 gap-6" key={index}>
          {Array.from({ length: 5 }).map((__, columnIndex) => <div className="h-4 animate-pulse rounded bg-slate-200" key={columnIndex} />)}
        </div>
      ))}
    </div>
  )
}

interface ExerciseNameAutocompleteProps {
  id: string
  value: string
  suggestions: CuratedExercise[]
  isLoading: boolean
  error: string | null
  onChange: (value: string) => void
  onSelect: (exercise: CuratedExercise) => void
}

function filterCuratedExercises(exercises: CuratedExercise[], query: string) {
  const normalizedQuery = query.trim().toLocaleLowerCase()
  if (!normalizedQuery) return []
  return exercises
    .filter((exercise) => `${exercise.name} ${exercise.originalName || ''}`.toLocaleLowerCase().includes(normalizedQuery))
    .slice(0, 8)
}

function ExerciseNameAutocomplete({
  id,
  value,
  suggestions,
  isLoading,
  error,
  onChange,
  onSelect,
}: ExerciseNameAutocompleteProps) {
  const [isOpen, setIsOpen] = useState(false)
  const matches = filterCuratedExercises(suggestions, value)

  return (
    <div className="relative">
      <input
        className={inputClassName}
        id={id}
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={isOpen && value.trim().length > 0}
        aria-controls={`${id}-suggestions`}
        autoComplete="off"
        value={value}
        onFocus={() => setIsOpen(true)}
        onChange={(event) => {
          onChange(event.target.value)
          setIsOpen(true)
        }}
        onBlur={() => setIsOpen(false)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setIsOpen(false)
        }}
        placeholder="Busca un ejercicio o escribe uno propio"
      />
      {isOpen && value.trim().length > 0 && (
        <div
          className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
          id={`${id}-suggestions`}
          role="listbox"
        >
          {isLoading ? (
            <p className="px-3 py-3 text-sm text-slate-500">Cargando ejercicios compatibles...</p>
          ) : matches.length > 0 ? (
            matches.map((exercise) => (
              <button
                className="flex w-full flex-col items-start px-3 py-2 text-left transition hover:bg-green-50 focus:bg-green-50 focus:outline-none"
                key={exercise.id}
                type="button"
                role="option"
                aria-selected="false"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onSelect(exercise)
                  setIsOpen(false)
                }}
              >
                <span className="text-sm font-medium text-slate-900">{exercise.name}</span>
                <span className="text-xs text-slate-500">
                  {exercise.originalName && exercise.originalName !== exercise.name ? `${exercise.originalName} · ` : ''}
                  {exercise.equipment || 'Peso corporal'}
                </span>
              </button>
            ))
          ) : (
            <p className="px-3 py-3 text-sm text-slate-500">
              {error || 'Sin coincidencias. Puedes escribir el nombre manualmente.'}
            </p>
          )}
          {error && !isLoading && (
            <p className="border-t border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              No se pudo cargar el catálogo externo; puedes capturar el nombre manualmente.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function Routines() {
  const [templates, setTemplates] = useState<RoutineTemplate[]>([])
  const [routines, setRoutines] = useState<Routine[]>([])
  const [clients, setClients] = useState<User[]>([])
  const [equipment, setEquipment] = useState<Equipment[]>([])
  const [exerciseSuggestions, setExerciseSuggestions] = useState<CuratedExercise[]>([])
  const [isExerciseCatalogLoading, setIsExerciseCatalogLoading] = useState(true)
  const [exerciseCatalogError, setExerciseCatalogError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<BuilderMode>('template')
  const [isBuilderOpen, setIsBuilderOpen] = useState(false)
  const [builderMode, setBuilderMode] = useState<BuilderMode>('template')
  const [editingTemplate, setEditingTemplate] = useState<RoutineTemplate | null>(null)
  const [editingRoutine, setEditingRoutine] = useState<Routine | null>(null)
  const [form, setForm] = useState<RoutineFormState>(emptyForm)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [modalError, setModalError] = useState<string | null>(null)
  const [assigningTemplate, setAssigningTemplate] = useState<RoutineTemplate | null>(null)
  const [selectedClientId, setSelectedClientId] = useState('')
  const [isAssigning, setIsAssigning] = useState(false)
  const [assignmentError, setAssignmentError] = useState<string | null>(null)

  async function refreshTemplates() {
    const response = await getTemplates<ArrayResponse<RoutineTemplate>>()
    setTemplates(extractArray<RoutineTemplate>(response, ['data', 'templates', 'routineTemplates']))
  }

  async function refreshRoutines() {
    const response = await getRoutines<ArrayResponse<Routine>>()
    setRoutines(extractArray<Routine>(response, ['data', 'routines', 'rutinas']))
  }

  async function refreshAssignedRoutines() {
    await refreshRoutines()
  }

  useEffect(() => {
    let isMounted = true

    async function loadData() {
      try {
        const [templatesResponse, routinesResponse, usersResponse, equipmentResponse, exercisesResponse] = await Promise.all([
          getTemplates<ArrayResponse<RoutineTemplate>>(),
          getRoutines<ArrayResponse<Routine>>(),
          getUsers<ArrayResponse<User>>(),
          getEquipment<ArrayResponse<Equipment>>(),
          getExercises<ArrayResponse<CuratedExercise>>(),
        ])
        if (!isMounted) return

        setTemplates(extractArray<RoutineTemplate>(templatesResponse, ['data', 'templates', 'routineTemplates']))
        setRoutines(extractArray<Routine>(routinesResponse, ['data', 'routines', 'rutinas']))
        setClients(extractArray<User>(usersResponse, ['data', 'users']).filter(isClient))
        const equipmentList = extractArray<Equipment>(equipmentResponse, ['data', 'equipment'])
        setEquipment(equipmentList)
        setExerciseSuggestions(extractArray<CuratedExercise>(exercisesResponse, ['data', 'exercises']))
        setExerciseCatalogError(null)
        setIsExerciseCatalogLoading(false)
        setError(null)
      } catch (requestError) {
        if (isMounted) {
          setError(requestError instanceof Error ? requestError.message : 'No se pudieron cargar los datos de rutinas.')
          setExerciseCatalogError(requestError instanceof Error ? requestError.message : 'No se pudo cargar el catálogo de ejercicios.')
          setIsExerciseCatalogLoading(false)
        }
      } finally {
        if (isMounted) setIsLoading(false)
      }
    }

    void loadData()
    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    const refreshFromEvent = () => {
      void Promise.all([refreshTemplates(), refreshRoutines()]).catch((requestError: unknown) => {
        setError(requestError instanceof Error ? requestError.message : 'No se pudieron actualizar las rutinas.')
      })
    }
    const events = [
      'routine-created',
      'routine-updated',
      'routine-deleted',
      'routine-assigned',
      'routines-updated',
      'routine-template-created',
      'routine-template-updated',
      'routine-template-deleted',
      'routine-templates-updated',
    ]
    events.forEach((eventName) => socket.on(eventName, refreshFromEvent))

    return () => {
      events.forEach((eventName) => socket.off(eventName, refreshFromEvent))
    }
  }, [])

  function startCreate(mode: BuilderMode) {
    setBuilderMode(mode)
    setEditingTemplate(null)
    setEditingRoutine(null)
    setForm(emptyForm)
    setModalError(null)
    setIsBuilderOpen(true)
  }

  function startEditTemplate(template: RoutineTemplate) {
    setBuilderMode('template')
    setEditingTemplate(template)
    setEditingRoutine(null)
    setForm({
      title: template.title || '',
      objective: template.objective || '',
      level: template.level || '',
      durationWeeks: String(template.durationWeeks ?? ''),
      assignedTo: '',
      blocks: (template.blocks || []).map((block) => toBlockForm(block, equipment.map((item) => item.name || ''))),
    })
    setModalError(null)
    setIsBuilderOpen(true)
  }

  function startEditRoutine(routine: Routine) {
    setBuilderMode('routine')
    setEditingTemplate(null)
    setEditingRoutine(routine)
    const assignedTo = routineAssignedTo(routine)
    setForm({
      title: routine.title || '',
      objective: routine.objective || '',
      level: routine.level || '',
      durationWeeks: String(routine.durationWeeks ?? ''),
      assignedTo: assignedUserId(assignedTo),
      blocks: (routine.blocks || []).map((block) => toBlockForm(block, equipment.map((item) => item.name || ''))),
    })
    setModalError(null)
    setIsBuilderOpen(true)
  }

  function closeBuilder() {
    if (isSubmitting) return
    setEditingTemplate(null)
    setEditingRoutine(null)
    setForm(emptyForm)
    setModalError(null)
    setIsBuilderOpen(false)
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

  function selectSuggestedExercise(
    blockIndex: number,
    exerciseIndex: number,
    suggestion: CuratedExercise,
  ) {
    const isPresetMuscleGroup = muscleGroupOptions.includes(suggestion.muscleGroup)
    setForm((current) => ({
      ...current,
      blocks: current.blocks.map((block, currentBlockIndex) =>
        currentBlockIndex === blockIndex
          ? {
              ...block,
              exercises: block.exercises.map((exercise, currentExerciseIndex) =>
                currentExerciseIndex === exerciseIndex
                  ? {
                      ...exercise,
                      name: suggestion.name,
                      videoUrl: suggestion.videoUrl || '',
                      muscleGroup: isPresetMuscleGroup ? suggestion.muscleGroup : customMuscleGroupOption,
                      customMuscleGroup: isPresetMuscleGroup ? '' : suggestion.muscleGroup,
                      equipment: suggestion.equipment ? customEquipmentOption : '',
                      customEquipment: suggestion.equipment || '',
                      exerciseId: suggestion.id || suggestion._id || '',
                      ...(suggestion.muscleGroup === 'Cardio' ? { mode: 'Cardio' as const } : {}),
                    }
                  : exercise,
              ),
            }
          : block,
      ),
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

  function updateMuscleGroup(
    blockIndex: number,
    exerciseIndex: number,
    value: string,
  ) {
    setForm((current) => ({
      ...current,
      blocks: current.blocks.map((block, currentBlockIndex) =>
        currentBlockIndex === blockIndex
          ? {
              ...block,
              exercises: block.exercises.map((exercise, currentExerciseIndex) =>
                currentExerciseIndex === exerciseIndex
                  ? {
                      ...exercise,
                      muscleGroup: value,
                      customMuscleGroup: value === customMuscleGroupOption ? exercise.customMuscleGroup : '',
                    }
                  : exercise,
              ),
            }
          : block,
      ),
    }))
  }

  function buildBlocks(): RoutineBlock[] {
    return form.blocks.map((block, blockIndex) => ({
      dayOfWeek: Number(block.dayOfWeek),
      type: block.type,
      sets: Number(block.sets) || 0,
      restSeconds: Number(block.restSeconds) || 0,
      order: blockIndex,
      exercises: block.exercises.map((exercise): RoutineExercise => ({
        exerciseId: exercise.exerciseId,
        ...(exercise.mode === 'Cardio'
          ? {
              ...(exercise.duration !== '' ? { targetDuration: Number(exercise.duration) } : {}),
              ...(exercise.distance !== '' ? { targetDistance: Number(exercise.distance) } : {}),
              ...(exercise.level !== '' ? { targetLevel: Number(exercise.level) } : {}),
            }
          : {
              ...(exercise.reps !== '' ? { targetReps: Number(exercise.reps) } : {}),
              ...(exercise.weight !== '' ? { targetWeight: Number(exercise.weight) } : {}),
            }),
        name: exercise.name.trim(),
        muscleGroup: (exercise.muscleGroup === customMuscleGroupOption
          ? exercise.customMuscleGroup
          : exercise.muscleGroup).trim(),
        equipment: (exercise.equipment === customEquipmentOption
          ? exercise.customEquipment
          : exercise.equipment).trim() || null,
        videoUrl: exercise.videoUrl.trim(),
        isCardio: exercise.mode === 'Cardio',
      })),
    }))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setModalError(null)
    setIsSubmitting(true)

    try {
      if (!form.title.trim()) throw new Error('Escribe un título para la rutina.')
      if (builderMode === 'routine' && !form.assignedTo) {
        throw new Error('Selecciona un cliente para la rutina asignada.')
      }
      for (const [blockIndex, block] of form.blocks.entries()) {
        if (!block.exercises.length) throw new Error(`El bloque ${blockIndex + 1} debe tener al menos un ejercicio.`)
        if (block.type === 'superset' && block.exercises.length < 2) throw new Error(`El superset ${blockIndex + 1} debe tener al menos dos ejercicios.`)
        for (const [exerciseIndex, exercise] of block.exercises.entries()) {
          if (!exercise.exerciseId) throw new Error(`Selecciona un ejercicio del catálogo en el bloque ${blockIndex + 1}, ejercicio ${exerciseIndex + 1}.`)
        }
      }

      const definition: RoutineTemplatePayload = {
        title: form.title.trim(),
        objective: form.objective.trim(),
        level: form.level,
        durationWeeks: Number(form.durationWeeks) || 0,
        blocks: buildBlocks(),
      }

      if (builderMode === 'template') {
        const templateId = editingTemplate && recordId(editingTemplate)
        if (editingTemplate) {
          if (!templateId) throw new Error('La plantilla no tiene un identificador válido.')
          await updateTemplate(templateId, definition)
        } else {
          await createTemplate(definition)
        }
        await refreshTemplates()
        setActiveTab('template')
      } else {
        const routineId = editingRoutine && recordId(editingRoutine)
        const routinePayload: RoutinePayload = { ...definition, assignedTo: form.assignedTo }
        if (editingRoutine) {
          if (!routineId) throw new Error('La rutina no tiene un identificador válido.')
          await updateRoutine(routineId, routinePayload)
        } else {
          await createRoutine(routinePayload)
        }
        await refreshAssignedRoutines()
        setActiveTab('routine')
      }

      setError(null)
      setEditingTemplate(null)
      setEditingRoutine(null)
      setForm(emptyForm)
      setIsBuilderOpen(false)
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
      setModalError(requestError instanceof Error ? requestError.message : 'No se pudo guardar la rutina.')
    } finally {
      setIsSubmitting(false)
    }
  }

  function startAssign(template: RoutineTemplate) {
    setAssigningTemplate(template)
    setSelectedClientId('')
    setAssignmentError(null)
  }

  function closeAssign() {
    if (isAssigning) return
    setAssigningTemplate(null)
    setSelectedClientId('')
    setAssignmentError(null)
  }

  async function handleAssign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!assigningTemplate) return
    const templateId = recordId(assigningTemplate)
    if (!templateId) {
      setAssignmentError('La plantilla no tiene un identificador válido.')
      return
    }
    if (!selectedClientId) {
      setAssignmentError('Selecciona un cliente.')
      return
    }

    setIsAssigning(true)
    setAssignmentError(null)
    try {
      await assignTemplateToClient(templateId, selectedClientId)
      await refreshAssignedRoutines()
      setError(null)
      setAssigningTemplate(null)
      setSelectedClientId('')
    } catch (requestError) {
      setAssignmentError(requestError instanceof Error ? requestError.message : 'No se pudo asignar la plantilla.')
    } finally {
      setIsAssigning(false)
    }
  }

  async function handleDeleteTemplate(template: RoutineTemplate) {
    const templateId = recordId(template)
    if (!templateId) {
      setError('No se puede eliminar una plantilla sin identificador.')
      return
    }
    if (!window.confirm(`¿Eliminar la plantilla "${template.title}"?`)) return
    try {
      await deleteTemplate(templateId)
      await refreshTemplates()
      setError(null)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No se pudo eliminar la plantilla.')
    }
  }

  async function handleDeleteRoutine(routine: Routine) {
    const routineId = recordId(routine)
    if (!routineId) {
      setError('No se puede eliminar una rutina sin identificador.')
      return
    }
    if (!window.confirm(`¿Eliminar la rutina "${routine.title}"?`)) return
    try {
      await deleteRoutine(routineId)
      await refreshAssignedRoutines()
      setError(null)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No se pudo eliminar la rutina.')
    }
  }

  const tabButtonClass = (tab: BuilderMode) => `border-b-2 px-4 py-3 text-sm font-medium transition ${
    activeTab === tab
      ? 'border-green-500 text-slate-900'
      : 'border-transparent text-slate-500 hover:text-slate-800'
  }`

  return (
    <section className="min-h-screen bg-[#F8FAFC] px-8 py-10">
      <p className="text-sm font-medium uppercase tracking-[0.25em] text-slate-500">Entrenamiento</p>
      <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight text-slate-900">Rutinas</h1>
          <p className="mt-3 text-slate-500">Diseña plantillas y asígnalas a tus clientes.</p>
        </div>
        <button
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#9BFF63] px-4 py-2 font-medium text-[#0F172A] transition hover:bg-[#abff7c]"
          type="button"
          onClick={() => startCreate(activeTab)}
        >
          <Plus size={18} aria-hidden="true" />
          {activeTab === 'template' ? 'Nueva plantilla' : 'Crear rutina asignada'}
        </button>
      </div>

      <div className="mt-8 overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
        {error && <div className="border-b border-red-100 bg-red-50 px-6 py-4 text-sm text-red-700" role="alert">{error}</div>}
        <div className="flex border-b border-slate-100 px-4" role="tablist" aria-label="Secciones de rutinas">
          <button className={tabButtonClass('template')} type="button" role="tab" aria-selected={activeTab === 'template'} onClick={() => setActiveTab('template')}>
            Plantillas Base <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs">{templates.length}</span>
          </button>
          <button className={tabButtonClass('routine')} type="button" role="tab" aria-selected={activeTab === 'routine'} onClick={() => setActiveTab('routine')}>
            Rutinas Asignadas <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs">{routines.length}</span>
          </button>
        </div>

        {isLoading ? <RoutineSkeleton /> : (
          <div className="overflow-x-auto">
            {activeTab === 'template' ? (
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-slate-100 bg-slate-50/80 text-xs uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-6 py-4 font-medium">Plantilla</th>
                    <th className="px-6 py-4 font-medium">Objetivo</th>
                    <th className="px-6 py-4 font-medium">Nivel</th>
                    <th className="px-6 py-4 font-medium">Bloques / ejercicios</th>
                    <th className="px-6 py-4 font-medium">Días por bloque</th>
                    <th className="px-6 py-4 font-medium text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {templates.length ? templates.map((template, index) => {
                    const templateId = recordId(template) || `template-${index}`
                    return (
                      <tr className="transition-colors hover:bg-slate-50" key={templateId}>
                        <td className="px-6 py-4 font-medium text-slate-900">{template.title || 'Sin título'}</td>
                        <td className="px-6 py-4 text-slate-500">{template.objective || '-'}</td>
                        <td className="px-6 py-4 text-slate-500">{template.level || '-'}</td>
                        <td className="px-6 py-4 text-slate-500">{template.blocks?.length || 0} / {exerciseCount(template.blocks)}</td>
                        <td className="px-6 py-4 text-slate-500">{routineScheduleDays(template.blocks).join(', ') || '-'}</td>
                        <td className="whitespace-nowrap px-6 py-4 text-right">
                          <div className="inline-flex items-center justify-end gap-2">
                            <button className="inline-flex items-center gap-1 rounded-lg bg-[#9BFF63] px-2.5 py-2 text-xs font-semibold text-slate-900 transition hover:bg-[#abff7c]" type="button" onClick={() => startAssign(template)} aria-label={`Asignar ${template.title} a un cliente`}>
                              <UserRoundPlus size={15} aria-hidden="true" />Asignar a Cliente
                            </button>
                            <button className="rounded p-2 text-slate-400 transition hover:bg-green-50 hover:text-green-700" type="button" aria-label={`Editar plantilla ${template.title}`} onClick={() => startEditTemplate(template)}>
                              <Pencil size={16} aria-hidden="true" />
                            </button>
                            <button className="rounded p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600" type="button" aria-label={`Eliminar plantilla ${template.title}`} onClick={() => handleDeleteTemplate(template)}>
                              <Trash2 size={16} aria-hidden="true" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  }) : <tr><td className="px-6 py-10 text-center text-sm text-slate-500" colSpan={6}>No hay plantillas base. Crea una para empezar.</td></tr>}
                </tbody>
              </table>
            ) : (
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-slate-100 bg-slate-50/80 text-xs uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-6 py-4 font-medium">Rutina</th>
                    <th className="px-6 py-4 font-medium">Cliente</th>
                    <th className="px-6 py-4 font-medium">Objetivo</th>
                    <th className="px-6 py-4 font-medium">Estado</th>
                    <th className="px-6 py-4 font-medium">Bloques / ejercicios</th>
                    <th className="px-6 py-4 font-medium text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {routines.length ? routines.map((routine, index) => {
                    const routineId = recordId(routine) || `routine-${index}`
                    const assignedTo = routineAssignedTo(routine)
                    return (
                      <tr className="transition-colors hover:bg-slate-50" key={routineId}>
                        <td className="px-6 py-4 font-medium text-slate-900">{routine.title || 'Sin título'}</td>
                        <td className="px-6 py-4 text-slate-500">{assignedTo ? relationName(assignedTo, clients) : '-'}</td>
                        <td className="px-6 py-4 text-slate-500">{routine.objective || '-'}</td>
                        <td className="px-6 py-4 text-slate-500">{routine.status || 'Activa'}</td>
                        <td className="px-6 py-4 text-slate-500">{routine.blocks?.length || 0} / {exerciseCount(routine.blocks)}</td>
                        <td className="whitespace-nowrap px-6 py-4 text-right">
                          <div className="inline-flex items-center justify-end gap-2">
                            <button className="rounded p-2 text-slate-400 transition hover:bg-green-50 hover:text-green-700" type="button" aria-label={`Editar rutina ${routine.title}`} onClick={() => startEditRoutine(routine)}>
                              <Pencil size={16} aria-hidden="true" />
                            </button>
                            <button className="rounded p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600" type="button" aria-label={`Eliminar rutina ${routine.title}`} onClick={() => handleDeleteRoutine(routine)}>
                              <Trash2 size={16} aria-hidden="true" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  }) : <tr><td className="px-6 py-10 text-center text-sm text-slate-500" colSpan={6}>No hay rutinas asignadas a clientes.</td></tr>}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {isBuilderOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/50 px-4 py-8 backdrop-blur-sm">
          <div className="my-auto max-h-[calc(100vh-4rem)] w-full max-w-4xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.2em] text-emerald-700">Entrenamiento</p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-900">
                  {editingTemplate || editingRoutine ? 'Editar' : 'Crear'} {builderMode === 'template' ? 'plantilla' : 'rutina asignada'}
                </h2>
              </div>
              <button className="text-slate-400 transition hover:text-slate-700" type="button" aria-label="Cerrar editor" onClick={closeBuilder}><X size={22} /></button>
            </div>

            <form className="mt-6 space-y-6" onSubmit={handleSubmit}>
              <section className="space-y-4">
                <h3 className="text-base font-semibold text-slate-900">Información general</h3>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className={labelClassName} htmlFor="routine-title">Título</label>
                    <input className={inputClassName} id="routine-title" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} required />
                  </div>
                  <div>
                    <label className={labelClassName} htmlFor="routine-objective">Objetivo</label>
                    <input className={inputClassName} id="routine-objective" value={form.objective} onChange={(event) => setForm({ ...form, objective: event.target.value })} placeholder="Ej. Ganancia muscular" />
                  </div>
                  <div>
                    <label className={labelClassName} htmlFor="routine-duration">Duración (semanas)</label>
                    <input className={inputClassName} id="routine-duration" type="number" min="1" value={form.durationWeeks} onChange={(event) => setForm({ ...form, durationWeeks: event.target.value })} />
                  </div>
                  <div>
                    <label className={labelClassName} htmlFor="routine-level">Nivel</label>
                    <select className={inputClassName} id="routine-level" value={form.level} onChange={(event) => setForm({ ...form, level: event.target.value })}>
                      <option value="">Selecciona un nivel</option>
                      <option value="Principiante">Principiante</option>
                      <option value="Intermedio">Intermedio</option>
                      <option value="Avanzado">Avanzado</option>
                    </select>
                  </div>
                  {builderMode === 'routine' && (
                    <div>
                      <label className={labelClassName} htmlFor="routine-client">Cliente</label>
                      <select className={inputClassName} id="routine-client" value={form.assignedTo} onChange={(event) => setForm({ ...form, assignedTo: event.target.value })} required>
                        <option value="">Selecciona un cliente</option>
                        {clients.map((client, index) => <option key={recordId(client) || `client-${index}`} value={recordId(client)}>{userLabel(client)}</option>)}
                      </select>
                      {clients.length === 0 && <p className="mt-1 text-xs text-amber-700">No hay clientes disponibles para asignar.</p>}
                    </div>
                  )}
                </div>
              </section>

              <section className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900">Bloques de entrenamiento</h3>
                    <p className="mt-1 text-sm text-slate-500">Organiza los ejercicios por estructura, series y descanso.</p>
                  </div>
                  <button className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-green-400 hover:text-green-700" type="button" onClick={addBlock}>
                    <Plus size={16} aria-hidden="true" />Agregar Bloque
                  </button>
                </div>

                {form.blocks.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500">Agrega un bloque para construir el entrenamiento.</p>
                ) : (
                  <div className="space-y-4">
                    {form.blocks.map((block, blockIndex) => (
                      <article className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 sm:p-5" key={`block-${blockIndex}`}>
                        <div className="mb-4 flex items-center justify-between gap-3">
                          <h4 className="font-semibold text-slate-900">Bloque {blockIndex + 1}</h4>
                          <button className="inline-flex items-center gap-1 rounded px-2 py-1 text-sm text-slate-400 transition hover:bg-red-50 hover:text-red-600" type="button" onClick={() => removeBlock(blockIndex)} aria-label={`Eliminar bloque ${blockIndex + 1}`}>
                            <Trash2 size={16} aria-hidden="true" />Eliminar bloque
                          </button>
                        </div>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                          <div>
                            <label className={labelClassName} htmlFor={`block-type-${blockIndex}`}>Tipo de bloque</label>
                            <select className={inputClassName} id={`block-type-${blockIndex}`} value={block.type} onChange={(event) => updateBlock(blockIndex, 'type', event.target.value)}>
                              <option value="single">Single</option>
                              <option value="superset">Superset</option>
                              <option value="circuit">Circuit</option>
                            </select>
                          </div>
                          <div>
                            <label className={labelClassName} htmlFor={`block-sets-${blockIndex}`}>Series</label>
                            <input className={inputClassName} id={`block-sets-${blockIndex}`} type="number" min="1" value={block.sets} onChange={(event) => updateBlock(blockIndex, 'sets', event.target.value)} />
                          </div>
                          <div>
                            <label className={labelClassName} htmlFor={`block-rest-${blockIndex}`}>Descanso (segundos)</label>
                            <input className={inputClassName} id={`block-rest-${blockIndex}`} type="number" min="0" value={block.restSeconds} onChange={(event) => updateBlock(blockIndex, 'restSeconds', event.target.value)} />
                          </div>
                          <div>
                            <label className={labelClassName} htmlFor={`block-day-${blockIndex}`}>Día</label>
                            <select className={inputClassName} id={`block-day-${blockIndex}`} value={block.dayOfWeek} onChange={(event) => updateBlock(blockIndex, 'dayOfWeek', event.target.value)}>
                              {daysOfWeek.map((day, dayIndex) => <option key={day} value={dayIndex}>{day}</option>)}
                            </select>
                          </div>
                        </div>

                        <div className="mt-5 border-t border-slate-200 pt-4">
                          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                            <h5 className="text-sm font-semibold text-slate-800">Ejercicios del bloque</h5>
                            <button className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-green-400 hover:text-green-700" type="button" onClick={() => addExercise(blockIndex)}>
                              <Plus size={15} aria-hidden="true" />Agregar Ejercicio
                            </button>
                          </div>

                          {block.exercises.length === 0 ? (
                            <p className="rounded-lg border border-dashed border-slate-200 bg-white px-4 py-4 text-center text-sm text-slate-500">Este bloque todavía no tiene ejercicios.</p>
                          ) : (
                            <div className="space-y-3">
                              {block.exercises.map((exercise, exerciseIndex) => (
                                <div className="rounded-lg border border-slate-200 bg-white p-4" key={`exercise-${blockIndex}-${exerciseIndex}`}>
                                  <div className="mb-4 flex items-center justify-between gap-3">
                                    <h6 className="text-sm font-medium text-slate-800">Ejercicio {exerciseIndex + 1}</h6>
                                    <button className="rounded p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600" type="button" aria-label={`Eliminar ejercicio ${exerciseIndex + 1}`} onClick={() => removeExercise(blockIndex, exerciseIndex)}>
                                      <Trash2 size={16} aria-hidden="true" />
                                    </button>
                                  </div>
                                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                    <div>
                                      <label className={labelClassName} htmlFor={`exercise-name-${blockIndex}-${exerciseIndex}`}>Nombre</label>
                                      <ExerciseNameAutocomplete
                                        id={`exercise-name-${blockIndex}-${exerciseIndex}`}
                                        value={exercise.name}
                                        suggestions={exerciseSuggestions}
                                        isLoading={isExerciseCatalogLoading}
                                        error={exerciseCatalogError}
                                        onChange={(value) => updateExercise(blockIndex, exerciseIndex, 'name', value)}
                                        onSelect={(suggestion) => selectSuggestedExercise(blockIndex, exerciseIndex, suggestion)}
                                      />
                                    </div>
                                    <div>
                                      <label className={labelClassName} htmlFor={`exercise-muscle-${blockIndex}-${exerciseIndex}`}>Grupo muscular</label>
                                      <select
                                        className={inputClassName}
                                        id={`exercise-muscle-${blockIndex}-${exerciseIndex}`}
                                        value={exercise.muscleGroup}
                                        onChange={(event) => updateMuscleGroup(blockIndex, exerciseIndex, event.target.value)}
                                        required
                                      >
                                        <option value="">Selecciona un grupo muscular</option>
                                        {muscleGroupOptions.map((muscleGroup) => <option key={muscleGroup} value={muscleGroup}>{muscleGroup}</option>)}
                                        <option value={customMuscleGroupOption}>+ Agregar otro...</option>
                                      </select>
                                    </div>
                                    {exercise.muscleGroup === customMuscleGroupOption && (
                                      <div>
                                        <label className={labelClassName} htmlFor={`exercise-custom-muscle-${blockIndex}-${exerciseIndex}`}>Grupo muscular personalizado</label>
                                        <input
                                          className={inputClassName}
                                          id={`exercise-custom-muscle-${blockIndex}-${exerciseIndex}`}
                                          type="text"
                                          value={exercise.customMuscleGroup}
                                          onChange={(event) => updateExercise(blockIndex, exerciseIndex, 'customMuscleGroup', event.target.value)}
                                          placeholder="Escribe el grupo muscular"
                                          required
                                        />
                                      </div>
                                    )}
                                    <div>
                                      <label className={labelClassName} htmlFor={`exercise-equipment-${blockIndex}-${exerciseIndex}`}>Equipo</label>
                                      <select className={inputClassName} id={`exercise-equipment-${blockIndex}-${exerciseIndex}`} value={exercise.equipment} onChange={(event) => updateExercise(blockIndex, exerciseIndex, 'equipment', event.target.value)}>
                                        <option value="">Selecciona equipo</option>
                                        {equipment.map((item, index) => {
                                          return <option key={item._id || `equipment-${index}`} value={item.name || ''}>{item.name}</option>
                                        })}
                                        <option value={customEquipmentOption}>+ Agregar otro...</option>
                                      </select>
                                    </div>
                                    {exercise.equipment === customEquipmentOption && (
                                      <div>
                                        <label className={labelClassName} htmlFor={`exercise-custom-equipment-${blockIndex}-${exerciseIndex}`}>Equipo personalizado</label>
                                        <input
                                          className={inputClassName}
                                          id={`exercise-custom-equipment-${blockIndex}-${exerciseIndex}`}
                                          type="text"
                                          value={exercise.customEquipment}
                                          onChange={(event) => updateExercise(blockIndex, exerciseIndex, 'customEquipment', event.target.value)}
                                          placeholder="Escribe el nombre del equipo"
                                        />
                                      </div>
                                    )}
                                    <div>
                                      <label className={labelClassName} htmlFor={`exercise-video-${blockIndex}-${exerciseIndex}`}>URL del video</label>
                                      <input className={inputClassName} id={`exercise-video-${blockIndex}-${exerciseIndex}`} type="url" value={exercise.videoUrl} onChange={(event) => updateExercise(blockIndex, exerciseIndex, 'videoUrl', event.target.value)} placeholder="https://..." />
                                    </div>
                                    <div>
                                      <label className={labelClassName} htmlFor={`exercise-mode-${blockIndex}-${exerciseIndex}`}>Modalidad</label>
                                      <select className={inputClassName} id={`exercise-mode-${blockIndex}-${exerciseIndex}`} value={exercise.mode} onChange={(event) => updateExercise(blockIndex, exerciseIndex, 'mode', event.target.value)}>
                                        <option value="Fuerza">Fuerza</option>
                                        <option value="Cardio">Cardio</option>
                                      </select>
                                    </div>
                                    {exercise.mode === 'Cardio' ? (
                                      <div>
                                        <label className={labelClassName} htmlFor={`exercise-duration-${blockIndex}-${exerciseIndex}`}>Duración (minutos)</label>
                                        <input className={inputClassName} id={`exercise-duration-${blockIndex}-${exerciseIndex}`} type="number" min="1" value={exercise.duration} onChange={(event) => updateExercise(blockIndex, exerciseIndex, 'duration', event.target.value)} />
                                        <label className={labelClassName} htmlFor={`exercise-distance-${blockIndex}-${exerciseIndex}`}>Distancia</label>
                                        <input className={inputClassName} id={`exercise-distance-${blockIndex}-${exerciseIndex}`} type="number" min="0" step="0.1" value={exercise.distance} onChange={(event) => updateExercise(blockIndex, exerciseIndex, 'distance', event.target.value)} />
                                        <label className={labelClassName} htmlFor={`exercise-level-${blockIndex}-${exerciseIndex}`}>Nivel</label>
                                        <input className={inputClassName} id={`exercise-level-${blockIndex}-${exerciseIndex}`} type="number" min="0" value={exercise.level} onChange={(event) => updateExercise(blockIndex, exerciseIndex, 'level', event.target.value)} />
                                      </div>
                                    ) : (
                                      <>
                                        <div>
                                          <label className={labelClassName} htmlFor={`exercise-reps-${blockIndex}-${exerciseIndex}`}>Repeticiones</label>
                                          <input className={inputClassName} id={`exercise-reps-${blockIndex}-${exerciseIndex}`} type="number" min="1" value={exercise.reps} onChange={(event) => updateExercise(blockIndex, exerciseIndex, 'reps', event.target.value)} />
                                        </div>
                                        <div>
                                          <label className={labelClassName} htmlFor={`exercise-weight-${blockIndex}-${exerciseIndex}`}>Peso (kg)</label>
                                          <input className={inputClassName} id={`exercise-weight-${blockIndex}-${exerciseIndex}`} type="number" min="0" step="0.5" value={exercise.weight} onChange={(event) => updateExercise(blockIndex, exerciseIndex, 'weight', event.target.value)} />
                                        </div>
                                      </>
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
                <button className="rounded-lg px-4 py-2 font-medium text-slate-600 transition hover:bg-slate-100" type="button" onClick={closeBuilder} disabled={isSubmitting}>Cancelar</button>
                <button className="rounded-lg bg-[#9BFF63] px-4 py-2 font-medium text-[#0F172A] transition hover:bg-[#abff7c] disabled:cursor-not-allowed disabled:opacity-60" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Guardando...' : 'Guardar'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {assigningTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/50 px-4 py-8 backdrop-blur-sm">
          <div className="my-auto w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.2em] text-emerald-700">Asignación</p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-900">Asignar a Cliente</h2>
                <p className="mt-1 text-sm text-slate-500">{assigningTemplate.title}</p>
              </div>
              <button className="text-slate-400 transition hover:text-slate-700" type="button" aria-label="Cerrar asignación" onClick={closeAssign}><X size={22} /></button>
            </div>
            <form className="mt-6 space-y-4" onSubmit={handleAssign}>
              <div>
                <label className={labelClassName} htmlFor="assignment-client">Cliente</label>
                <select className={inputClassName} id="assignment-client" value={selectedClientId} onChange={(event) => setSelectedClientId(event.target.value)} required>
                  <option value="">Selecciona un cliente</option>
                  {clients.map((client, index) => <option key={recordId(client) || `client-${index}`} value={recordId(client)}>{userLabel(client)}</option>)}
                </select>
                {clients.length === 0 && <p className="mt-1 text-xs text-amber-700">No hay clientes disponibles para asignar.</p>}
              </div>
              {assignmentError && <p className="border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{assignmentError}</p>}
              <div className="flex justify-end gap-3 pt-2">
                <button className="rounded-lg px-4 py-2 font-medium text-slate-600 transition hover:bg-slate-100" type="button" onClick={closeAssign} disabled={isAssigning}>Cancelar</button>
                <button className="rounded-lg bg-[#9BFF63] px-4 py-2 font-medium text-[#0F172A] transition hover:bg-[#abff7c] disabled:cursor-not-allowed disabled:opacity-60" type="submit" disabled={isAssigning || clients.length === 0}>{isAssigning ? 'Asignando...' : 'Asignar rutina'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  )
}

export default Routines
