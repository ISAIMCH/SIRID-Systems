import { useEffect, useState, type FormEvent } from 'react'
import { ClipboardList, Dumbbell, Layers, LayoutTemplate, Pencil, Plus, Search, Trash2, UserRoundPlus, UserRoundX, UsersRound, X } from 'lucide-react'
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
  RoutineLevel,
  RoutinePayload,
  RoutineTemplate,
  RoutineTemplatePayload,
  Exercise as CuratedExercise,
} from '../services/api'
import { socket } from '../services/socket'
import type { Equipment, User } from '../types'
import { useQuickAction } from '../utils/quickAction'
import PageHeader from '../components/ui/PageHeader'
import Panel from '../components/ui/Panel'
import Modal from '../components/ui/Modal'
import KpiCard from '../components/ui/KpiCard'
import Badge, { type BadgeTone } from '../components/ui/Badge'
import EmptyState from '../components/ui/EmptyState'
import Segmented from '../components/ui/Segmented'
import { errorAlert, fieldClass, hintClass, iconButton, labelClass, primaryButton, secondaryButton, tableHeadClass, tdClass, thClass } from '../components/ui/styles'

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
type BlockType = RoutineBlock['blockType']

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
  // Kept from the saved routine so edits keep the exercise's history and catalog link.
  _id?: string
  catalogExerciseId: string
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
  _id?: string
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

const BLOCK_TYPES: Record<BlockType, string> = {
  single: 'Individual',
  superset: 'Superserie',
  circuit: 'Circuito',
}

const LEVELS: Record<RoutineLevel, { label: string; tone: BadgeTone }> = {
  principiante: { label: 'Principiante', tone: 'success' },
  intermedio: { label: 'Intermedio', tone: 'info' },
  avanzado: { label: 'Avanzado', tone: 'warning' },
}

function levelOf(level?: string) {
  return LEVELS[level as RoutineLevel] ?? (level ? { label: level, tone: 'neutral' as BadgeTone } : null)
}

// Routine.status in the API: active | paused | inactive.
const ROUTINE_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  active: { label: 'Activa', tone: 'success' },
  paused: { label: 'Pausada', tone: 'warning' },
  inactive: { label: 'Inactiva', tone: 'neutral' },
}

function statusOf(routine: Routine) {
  const status = routine.status || 'active'
  return ROUTINE_STATUS[status] ?? { label: status, tone: 'neutral' as BadgeTone }
}

function ClientAvatar({ name }: { name: string }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toLocaleUpperCase()
  return (
    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-slate-100 text-sm font-semibold text-slate-600" aria-hidden="true">
      {initials || '?'}
    </span>
  )
}

function RoutineStats({ blocks, durationWeeks }: { blocks?: RoutineBlock[]; durationWeeks?: number }) {
  const items = [
    { label: 'Bloques', value: blocks?.length || 0 },
    { label: 'Ejercicios', value: exerciseCount(blocks) },
    { label: 'Semanas', value: durationWeeks || '—' },
  ]
  return (
    <dl className="mt-4 grid grid-cols-3 gap-2 rounded-lg bg-slate-50 px-3 py-2.5">
      {items.map((item) => (
        <div key={item.label}>
          <dt className="text-[11px] font-medium uppercase tracking-wider text-slate-500">{item.label}</dt>
          <dd className="font-display text-lg font-bold leading-tight text-ink tabular">{item.value}</dd>
        </div>
      ))}
    </dl>
  )
}

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

function equipmentIdOf(exercise: RoutineExercise) {
  const value = exercise.equipmentId
  return typeof value === 'object' && value ? String(value._id) : value ? String(value) : ''
}

function toExerciseForm(exercise: RoutineExercise, inventory: Equipment[]): ExerciseFormState {
  const muscleGroup = exercise.muscleGroup || ''
  const equipmentId = equipmentIdOf(exercise)
  const inventoryName = equipmentId
    ? inventory.find((item) => recordId(item) === equipmentId)?.name
      ?? (typeof exercise.equipmentId === 'object' ? exercise.equipmentId?.name : undefined)
    : undefined
  const freeEquipment = exercise.bodyweight ? '' : exercise.equipment || ''
  const isInventoryName = Boolean(inventoryName) || inventory.some((item) => item.name === freeEquipment)
  const equipmentName = inventoryName || freeEquipment
  return {
    _id: exercise._id,
    catalogExerciseId: exercise.catalogExerciseId || '',
    exerciseId: '',
    name: exercise.name || '',
    muscleGroup: muscleGroupOptions.includes(muscleGroup) ? muscleGroup : '',
    customMuscleGroup: '',
    equipment: !equipmentName || isInventoryName ? equipmentName : customEquipmentOption,
    customEquipment: !equipmentName || isInventoryName ? '' : equipmentName,
    mode: exercise.metricType === 'cardio' ? 'Cardio' : 'Fuerza',
    reps: exercise.reps ?? '',
    weight: exercise.suggestedWeight === undefined ? '' : String(exercise.suggestedWeight),
    duration: exercise.targetDurationMinutes === undefined ? '' : String(exercise.targetDurationMinutes),
    distance: exercise.targetDistanceKm === undefined ? '' : String(exercise.targetDistanceKm),
    level: exercise.targetLevel === undefined ? '' : String(exercise.targetLevel),
    videoUrl: exercise.videoUrl || '',
  }
}

function toBlockForm(block: RoutineBlock, inventory: Equipment[]): BlockFormState {
  return {
    _id: block._id,
    type: block.blockType || 'single',
    sets: String(block.sets ?? 3),
    restSeconds: String(block.restSeconds ?? 60),
    dayOfWeek: String(block.day ?? 0),
    exercises: (block.exercises || []).map((exercise) => toExerciseForm(exercise, inventory)),
  }
}

function createExerciseForm(): ExerciseFormState {
  return {
    catalogExerciseId: '',
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
  const days = [...new Set(blocks?.map((block) => block.day) ?? [])].sort((a, b) => a - b)
  return days.map((day) => daysOfWeek[day]).filter(Boolean)
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
      <Dumbbell className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} aria-hidden />
      <input
        className={`${fieldClass} pl-10`}
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
          className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lift"
          id={`${id}-suggestions`}
          role="listbox"
        >
          {isLoading ? (
            <p className="px-3 py-3 text-sm text-slate-500">Cargando ejercicios compatibles...</p>
          ) : matches.length > 0 ? (
            matches.map((exercise) => (
              <button
                className="flex w-full flex-col items-start px-3.5 py-2 text-left transition hover:bg-brand-soft focus:bg-brand-soft focus:outline-none"
                key={exercise.id || exercise._id}
                type="button"
                role="option"
                aria-selected="false"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onSelect(exercise)
                  setIsOpen(false)
                }}
              >
                <span className="text-sm font-medium text-ink">{exercise.name}</span>
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
  const [searchTerm, setSearchTerm] = useState('')

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

  // A client enrolled or assigned to this coach elsewhere becomes selectable without reloading the page.
  useEffect(() => {
    function refreshClients() {
      getUsers<ArrayResponse<User>>()
        .then((response) => setClients(extractArray<User>(response, ['data', 'users']).filter(isClient)))
        .catch(() => undefined)
    }
    socket.on('directory-updated', refreshClients)
    return () => { socket.off('directory-updated', refreshClients) }
  }, [])

  function startCreate(mode: BuilderMode) {
    setBuilderMode(mode)
    setEditingTemplate(null)
    setEditingRoutine(null)
    setForm(emptyForm)
    setModalError(null)
    setIsBuilderOpen(true)
  }

  useQuickAction('nuevo', () => {
    setActiveTab('routine')
    startCreate('routine')
  })

  function startEditTemplate(template: RoutineTemplate) {
    setBuilderMode('template')
    setEditingTemplate(template)
    setEditingRoutine(null)
    setForm({
      title: template.title || '',
      objective: template.goal || '',
      level: template.level || '',
      durationWeeks: String(template.durationWeeks ?? ''),
      assignedTo: '',
      blocks: (template.blocks || []).map((block) => toBlockForm(block, equipment)),
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
      objective: routine.goal || '',
      level: routine.level || '',
      durationWeeks: String(routine.durationWeeks ?? ''),
      assignedTo: assignedUserId(assignedTo),
      blocks: (routine.blocks || []).map((block) => toBlockForm(block, equipment)),
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

  // An inventory machine is chosen by name in the select; anything else is free text.
  function equipmentChoice(name: string) {
    if (!name || equipment.some((item) => item.name === name)) return { equipment: name, customEquipment: '' }
    return { equipment: customEquipmentOption, customEquipment: name }
  }

  // The API takes strength or cardio from the machine's type, so the form follows it.
  function modeForEquipment(name: string): { mode?: ExerciseMode } {
    const type = equipment.find((item) => item.name === name)?.type
    return type ? { mode: type === 'cardio' ? 'Cardio' : 'Fuerza' } : {}
  }

  function updateEquipment(blockIndex: number, exerciseIndex: number, value: string) {
    setForm((current) => ({
      ...current,
      blocks: current.blocks.map((block, index) => index === blockIndex
        ? {
            ...block,
            exercises: block.exercises.map((exercise, currentExerciseIndex) =>
              currentExerciseIndex === exerciseIndex ? { ...exercise, equipment: value, ...modeForEquipment(value) } : exercise,
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
                      catalogExerciseId: '',
                      videoUrl: suggestion.videoUrl || '',
                      muscleGroup: isPresetMuscleGroup ? suggestion.muscleGroup : '',
                      customMuscleGroup: '',
                      ...equipmentChoice(suggestion.equipment || ''),
                      exerciseId: suggestion.id || suggestion._id || '',
                      ...(suggestion.muscleGroup === 'Cardio' ? { mode: 'Cardio' as const } : {}),
                      ...modeForEquipment(suggestion.equipment || ''),
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
      ...(block._id ? { _id: block._id } : {}),
      day: Number(block.dayOfWeek),
      blockType: block.type,
      sets: Number(block.sets) || 1,
      restSeconds: Number(block.restSeconds) || 0,
      order: blockIndex,
      exercises: block.exercises.map((exercise, exerciseIndex): RoutineExercise => {
        const inventoryItem = equipment.find((item) => exercise.equipment !== customEquipmentOption && item.name === exercise.equipment)
        const freeEquipment = exercise.equipment === customEquipmentOption ? exercise.customEquipment.trim() : ''
        const isCardio = exercise.mode === 'Cardio'
        const number = (value: string) => (value.trim() === '' ? undefined : Number(value))
        return {
          ...(exercise._id ? { _id: exercise._id } : {}),
          ...(exercise.catalogExerciseId ? { catalogExerciseId: exercise.catalogExerciseId } : {}),
          name: exercise.name.trim(),
          muscleGroup: exercise.muscleGroup,
          ...(inventoryItem ? { equipmentId: recordId(inventoryItem), equipment: inventoryItem.name } : freeEquipment ? { equipment: freeEquipment } : {}),
          bodyweight: !inventoryItem && !freeEquipment,
          metricType: isCardio ? 'cardio' : 'strength',
          ...(exercise.videoUrl.trim() ? { videoUrl: exercise.videoUrl.trim() } : {}),
          ...(isCardio
            ? {
                targetDurationMinutes: number(exercise.duration),
                targetDistanceKm: number(exercise.distance),
                targetLevel: number(exercise.level),
              }
            : {
                reps: exercise.reps.trim(),
                suggestedWeight: number(exercise.weight),
              }),
          order: exerciseIndex,
        }
      }),
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
      if (!form.level) throw new Error('Selecciona el nivel de la rutina.')
      if (!form.blocks.length) throw new Error('Agrega al menos un bloque con ejercicios.')
      for (const [blockIndex, block] of form.blocks.entries()) {
        const where = `Bloque ${blockIndex + 1}`
        if (!block.exercises.length) throw new Error(`${where}: agrega al menos un ejercicio.`)
        if (block.type === 'single' && block.exercises.length !== 1) throw new Error(`${where}: un bloque individual lleva exactamente un ejercicio; usa superserie o circuito para combinar varios.`)
        if (block.type !== 'single' && block.exercises.length < 2) throw new Error(`${where}: una superserie o un circuito necesita al menos dos ejercicios.`)
        for (const [exerciseIndex, exercise] of block.exercises.entries()) {
          const label = `${where}, ejercicio ${exerciseIndex + 1}`
          if (!exercise.name.trim()) throw new Error(`${label}: escribe o elige el ejercicio.`)
          if (!exercise.muscleGroup) throw new Error(`${label}: selecciona el grupo muscular.`)
          if (exercise.mode === 'Fuerza' && !exercise.reps.trim()) throw new Error(`${label}: indica las repeticiones.`)
          if (exercise.mode === 'Cardio' && !exercise.duration && !exercise.distance && !exercise.level) throw new Error(`${label}: indica minutos, distancia o nivel.`)
        }
      }

      // The API wants the training days once each, and every block on one of them.
      const scheduleDays = [...new Set(form.blocks.map((block) => Number(block.dayOfWeek)))].sort((a, b) => a - b)
      const definition: RoutineTemplatePayload = {
        title: form.title.trim(),
        ...(form.objective.trim() ? { goal: form.objective.trim() } : {}),
        level: form.level as RoutineLevel,
        durationWeeks: Number(form.durationWeeks) || 4,
        daysPerWeek: scheduleDays.length,
        scheduleDays,
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

  const routineActions = (routine: Routine) => (
    <div className="flex items-center justify-end gap-1">
      <button className={`${iconButton} hover:text-brand-text`} type="button" aria-label={`Editar rutina ${routine.title}`} title="Editar" onClick={() => startEditRoutine(routine)}>
        <Pencil size={17} aria-hidden />
      </button>
      <button className={`${iconButton} hover:bg-red-50 hover:text-red-600`} type="button" aria-label={`Eliminar rutina ${routine.title}`} title="Eliminar" onClick={() => void handleDeleteRoutine(routine)}>
        <Trash2 size={17} aria-hidden />
      </button>
    </div>
  )

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

  const query = searchTerm.trim().toLocaleLowerCase()
  const matchesQuery = (...values: Array<string | undefined>) => !query || values.join(' ').toLocaleLowerCase().includes(query)
  const visibleTemplates = templates.filter((template) => matchesQuery(template.title, template.goal, template.level))
  const visibleRoutines = routines.filter((routine) => {
    const assignedTo = routineAssignedTo(routine)
    return matchesQuery(routine.title, routine.goal, assignedTo ? relationName(assignedTo, clients) : '')
  })
  const clientsWithRoutine = new Set(routines.map((routine) => assignedUserId(routineAssignedTo(routine))).filter(Boolean))
  const clientsWithoutRoutine = clients.filter((client) => !clientsWithRoutine.has(recordId(client))).length
  const activeRoutines = routines.filter((routine) => (routine.status || 'active') === 'active').length

  return (
    <section className="min-h-screen bg-canvas px-4 py-8 sm:px-8 sm:py-10">
      <PageHeader
        eyebrow="Entrenamiento"
        title="Rutinas"
        description="Diseña plantillas reutilizables y asígnalas a tus clientes; cada cliente ve su rutina en la app."
        actions={(
          <>
            {activeTab === 'template' && (
              <button className={secondaryButton} type="button" onClick={() => { setActiveTab('routine'); startCreate('routine') }}>
                <UserRoundPlus size={18} aria-hidden /> Rutina para un cliente
              </button>
            )}
            <button className={primaryButton} type="button" onClick={() => startCreate(activeTab)}>
              <Plus size={18} aria-hidden /> {activeTab === 'template' ? 'Nueva plantilla' : 'Nueva rutina asignada'}
            </button>
          </>
        )}
      />

      <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <KpiCard label="Plantillas" value={templates.length} icon={LayoutTemplate} isLoading={isLoading} hint="Listas para asignar" />
        <KpiCard label="Rutinas asignadas" value={routines.length} icon={ClipboardList} tone="brand" isLoading={isLoading} hint={`${activeRoutines} activa${activeRoutines === 1 ? '' : 's'}`} />
        <KpiCard label="Clientes con rutina" value={clientsWithRoutine.size} icon={UsersRound} isLoading={isLoading} hint={`De ${clients.length} cliente${clients.length === 1 ? '' : 's'}`} />
        <KpiCard label="Clientes sin rutina" value={clientsWithoutRoutine} icon={UserRoundX} tone={clientsWithoutRoutine > 0 ? 'warning' : 'default'} isLoading={isLoading} hint={clientsWithoutRoutine > 0 ? 'Esperan una asignación' : 'Todos tienen rutina'} />
      </div>

      <Panel
        className="mt-6"
        title={activeTab === 'template' ? 'Plantillas base' : 'Rutinas asignadas'}
        icon={activeTab === 'template' ? LayoutTemplate : ClipboardList}
        description={activeTab === 'template' ? 'Estructuras de entrenamiento que puedes copiar a cualquier cliente.' : 'La rutina que cada cliente sigue en la app.'}
      >
        {error && <p className={`${errorAlert} mb-4`} role="alert">{error}</p>}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="-mx-1 overflow-x-auto px-1 pb-1">
            <Segmented
              label="Sección"
              value={activeTab}
              options={[['template', `Plantillas ${templates.length}`], ['routine', `Asignadas ${routines.length}`]] as const}
              onChange={setActiveTab}
            />
          </div>
          <label className="relative block sm:w-72">
            <span className="sr-only">Buscar rutinas</span>
            <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} aria-hidden />
            <input className={`${fieldClass} pl-10`} type="search" placeholder={activeTab === 'template' ? 'Buscar por título u objetivo' : 'Buscar por rutina o cliente'} value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} />
          </label>
        </div>

        <div className="mt-4">
          {isLoading ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true" aria-label="Cargando rutinas">
              {Array.from({ length: 3 }).map((_, index) => <div className="skeleton h-40 w-full rounded-xl" key={index} />)}
            </div>
          ) : activeTab === 'template' ? (
            visibleTemplates.length === 0 ? (
              <EmptyState icon={LayoutTemplate} title={templates.length === 0 ? 'Aún no hay plantillas' : 'Sin coincidencias'}>
                {templates.length === 0 ? 'Crea una plantilla con sus bloques y ejercicios para asignarla a varios clientes.' : 'Prueba con otro título u objetivo.'}
              </EmptyState>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {visibleTemplates.map((template, index) => {
                  const days = routineScheduleDays(template.blocks)
                  return (
                    <li className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 transition duration-200 hover:-translate-y-0.5 hover:shadow-lift" key={recordId(template) || `template-${index}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-ink">{template.title || 'Sin título'}</p>
                          <p className="mt-0.5 line-clamp-2 text-sm text-slate-500">{template.goal || 'Sin objetivo'}</p>
                        </div>
                        {levelOf(template.level) && <Badge tone={levelOf(template.level)!.tone}>{levelOf(template.level)!.label}</Badge>}
                      </div>
                      <RoutineStats blocks={template.blocks} durationWeeks={template.durationWeeks} />
                      {days.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1">
                          {days.map((day) => <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600" key={day}>{day.slice(0, 3)}</span>)}
                        </div>
                      )}
                      <div className="min-h-4 flex-1" />
                      <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
                        <button className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-brand-soft px-3 text-sm font-semibold text-brand-text transition hover:bg-brand hover:text-brand-ink" type="button" onClick={() => startAssign(template)} aria-label={`Asignar ${template.title} a un cliente`}>
                          <UserRoundPlus size={16} aria-hidden /> Asignar
                        </button>
                        <div className="flex gap-1">
                          <button className={`${iconButton} hover:text-brand-text`} type="button" aria-label={`Editar plantilla ${template.title}`} title="Editar" onClick={() => startEditTemplate(template)}>
                            <Pencil size={17} aria-hidden />
                          </button>
                          <button className={`${iconButton} hover:bg-red-50 hover:text-red-600`} type="button" aria-label={`Eliminar plantilla ${template.title}`} title="Eliminar" onClick={() => void handleDeleteTemplate(template)}>
                            <Trash2 size={17} aria-hidden />
                          </button>
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )
          ) : visibleRoutines.length === 0 ? (
            <EmptyState icon={ClipboardList} title={routines.length === 0 ? 'Aún no hay rutinas asignadas' : 'Sin coincidencias'}>
              {routines.length === 0 ? 'Asigna una plantilla o crea una rutina directamente para un cliente.' : 'Prueba con otro nombre de rutina o cliente.'}
            </EmptyState>
          ) : (
            <>
              {/* Phones: one card per routine. */}
              <ul className="space-y-3 md:hidden">
                {visibleRoutines.map((routine, index) => {
                  const assignedTo = routineAssignedTo(routine)
                  const clientName = assignedTo ? relationName(assignedTo, clients) : 'Sin cliente'
                  const status = statusOf(routine)
                  return (
                    <li className="rounded-xl border border-slate-200 p-4" key={recordId(routine) || `routine-${index}`}>
                      <div className="flex items-start gap-3">
                        <ClientAvatar name={clientName} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold text-ink">{routine.title || 'Sin título'}</p>
                          <p className="truncate text-xs text-slate-500">{clientName}</p>
                        </div>
                        {routineActions(routine)}
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <Badge tone={status.tone}>{status.label}</Badge>
                        <span>{routine.blocks?.length || 0} bloques · {exerciseCount(routine.blocks)} ejercicios</span>
                      </div>
                    </li>
                  )
                })}
              </ul>

              {/* Tablets and up: a table. */}
              <div className="-mx-5 hidden overflow-x-auto sm:-mx-6 md:block">
                <table className="min-w-full text-left text-sm">
                  <thead className={tableHeadClass}>
                    <tr>
                      <th className={thClass}>Cliente</th>
                      <th className={thClass}>Rutina</th>
                      <th className={thClass}>Estructura</th>
                      <th className={thClass}>Estado</th>
                      <th className={thClass}><span className="sr-only">Acciones</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {visibleRoutines.map((routine, index) => {
                      const assignedTo = routineAssignedTo(routine)
                      const clientName = assignedTo ? relationName(assignedTo, clients) : 'Sin cliente'
                      const status = statusOf(routine)
                      return (
                        <tr className="transition-colors hover:bg-slate-50/70" key={recordId(routine) || `routine-${index}`}>
                          <td className={tdClass}>
                            <div className="flex items-center gap-3">
                              <ClientAvatar name={clientName} />
                              <p className="font-semibold text-ink">{clientName}</p>
                            </div>
                          </td>
                          <td className={tdClass}>
                            <p className="font-medium text-ink">{routine.title || 'Sin título'}</p>
                            {routine.goal && <p className="text-xs text-slate-500">{routine.goal}</p>}
                          </td>
                          <td className={`${tdClass} text-slate-500`}>
                            {routine.blocks?.length || 0} bloques · {exerciseCount(routine.blocks)} ejercicios
                            {routineScheduleDays(routine.blocks).length > 0 && <span className="block text-xs">{routineScheduleDays(routine.blocks).map((day) => day.slice(0, 3)).join(' · ')}</span>}
                          </td>
                          <td className={tdClass}><Badge tone={status.tone}>{status.label}</Badge></td>
                          <td className={tdClass}>{routineActions(routine)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </Panel>

      {isBuilderOpen && (
        <Modal
          eyebrow={builderMode === 'template' ? 'Plantilla base' : 'Rutina asignada'}
          title={`${editingTemplate || editingRoutine ? 'Editar' : 'Crear'} ${builderMode === 'template' ? 'plantilla' : 'rutina'}`}
          onClose={closeBuilder}
          size="2xl"
        >
          <form className="space-y-6" onSubmit={handleSubmit}>
            <section className="space-y-4">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500">Información general</h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {builderMode === 'routine' && (
                  <div className="sm:col-span-2">
                    <label className={labelClass} htmlFor="routine-client">Cliente</label>
                    <select className={fieldClass} id="routine-client" value={form.assignedTo} onChange={(event) => setForm({ ...form, assignedTo: event.target.value })} required>
                      <option value="">Selecciona un cliente</option>
                      {clients.map((client, index) => <option key={recordId(client) || `client-${index}`} value={recordId(client)}>{userLabel(client)}</option>)}
                    </select>
                    {clients.length === 0 && <p className={`${hintClass} text-amber-700`}>No hay clientes disponibles para asignar.</p>}
                  </div>
                )}
                <div>
                  <label className={labelClass} htmlFor="routine-title">Título</label>
                  <input className={fieldClass} id="routine-title" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Ej. Fuerza full body" required />
                </div>
                <div>
                  <label className={labelClass} htmlFor="routine-objective">Objetivo</label>
                  <input className={fieldClass} id="routine-objective" value={form.objective} onChange={(event) => setForm({ ...form, objective: event.target.value })} placeholder="Ej. Ganancia muscular" />
                </div>
                <div>
                  <label className={labelClass} htmlFor="routine-level">Nivel</label>
                  <select className={fieldClass} id="routine-level" value={form.level} onChange={(event) => setForm({ ...form, level: event.target.value })} required>
                    <option value="">Selecciona un nivel</option>
                    {(Object.entries(LEVELS) as Array<[RoutineLevel, { label: string }]>).map(([value, level]) => <option key={value} value={value}>{level.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelClass} htmlFor="routine-duration">Duración (semanas)</label>
                  <input className={fieldClass} id="routine-duration" type="number" min="1" value={form.durationWeeks} onChange={(event) => setForm({ ...form, durationWeeks: event.target.value })} />
                </div>
              </div>
            </section>

            <section className="space-y-4">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500">Bloques de entrenamiento</h3>
                  <p className="mt-1 text-sm text-slate-500">Cada bloque es un día con su estructura, series y descanso.</p>
                </div>
                <button className={secondaryButton} type="button" onClick={addBlock}>
                  <Plus size={16} aria-hidden /> Agregar bloque
                </button>
              </div>

              {form.blocks.length === 0 ? (
                <EmptyState icon={Layers} title="Sin bloques todavía">Agrega un bloque para empezar a construir el entrenamiento.</EmptyState>
              ) : (
                <ol className="space-y-4">
                  {form.blocks.map((block, blockIndex) => (
                    <li className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 sm:p-5" key={`block-${blockIndex}`}>
                      <div className="mb-4 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                          <span className="grid h-7 w-7 place-items-center rounded-lg bg-ink text-xs font-bold text-white tabular">{blockIndex + 1}</span>
                          <h4 className="font-semibold text-ink">
                            {daysOfWeek[Number(block.dayOfWeek)] ?? `Bloque ${blockIndex + 1}`}
                            <span className="ml-2 text-sm font-normal text-slate-500">{BLOCK_TYPES[block.type]} · {block.exercises.length} ejercicio{block.exercises.length === 1 ? '' : 's'}</span>
                          </h4>
                        </div>
                        <button className={`${iconButton} hover:bg-red-50 hover:text-red-600`} type="button" onClick={() => removeBlock(blockIndex)} aria-label={`Eliminar bloque ${blockIndex + 1}`} title="Eliminar bloque">
                          <Trash2 size={17} aria-hidden />
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                        <div>
                          <label className={labelClass} htmlFor={`block-day-${blockIndex}`}>Día</label>
                          <select className={fieldClass} id={`block-day-${blockIndex}`} value={block.dayOfWeek} onChange={(event) => updateBlock(blockIndex, 'dayOfWeek', event.target.value)}>
                            {daysOfWeek.map((day, dayIndex) => <option key={day} value={dayIndex}>{day}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className={labelClass} htmlFor={`block-type-${blockIndex}`}>Estructura</label>
                          <select className={fieldClass} id={`block-type-${blockIndex}`} value={block.type} onChange={(event) => updateBlock(blockIndex, 'type', event.target.value)}>
                            {(Object.entries(BLOCK_TYPES) as Array<[BlockType, string]>).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className={labelClass} htmlFor={`block-sets-${blockIndex}`}>Series</label>
                          <input className={fieldClass} id={`block-sets-${blockIndex}`} type="number" min="1" value={block.sets} onChange={(event) => updateBlock(blockIndex, 'sets', event.target.value)} />
                        </div>
                        <div>
                          <label className={labelClass} htmlFor={`block-rest-${blockIndex}`}>Descanso (s)</label>
                          <input className={fieldClass} id={`block-rest-${blockIndex}`} type="number" min="0" value={block.restSeconds} onChange={(event) => updateBlock(blockIndex, 'restSeconds', event.target.value)} />
                        </div>
                      </div>

                      <div className="mt-4 space-y-3">
                        {block.exercises.length === 0 && (
                          <p className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-4 text-center text-sm text-slate-500">Este bloque todavía no tiene ejercicios.</p>
                        )}
                        {block.exercises.map((exercise, exerciseIndex) => {
                          const fieldId = (name: string) => `exercise-${name}-${blockIndex}-${exerciseIndex}`
                          return (
                            <div className="rounded-xl border border-slate-200 bg-white p-4" key={`exercise-${blockIndex}-${exerciseIndex}`}>
                              <div className="mb-3 flex items-center justify-between gap-3">
                                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Ejercicio {exerciseIndex + 1}</p>
                                <div className="flex items-center gap-2">
                                  <div className="inline-flex rounded-lg bg-slate-100 p-0.5 text-xs" role="group" aria-label="Modalidad">
                                    {(['Fuerza', 'Cardio'] as const).map((mode) => (
                                      <button
                                        className={`rounded-md px-2.5 py-1 font-medium transition ${exercise.mode === mode ? 'bg-white text-ink shadow-sm' : 'text-slate-500 hover:text-ink'}`}
                                        type="button"
                                        aria-pressed={exercise.mode === mode}
                                        key={mode}
                                        onClick={() => updateExercise(blockIndex, exerciseIndex, 'mode', mode)}
                                      >
                                        {mode}
                                      </button>
                                    ))}
                                  </div>
                                  <button className={`${iconButton} h-8 w-8 hover:bg-red-50 hover:text-red-600`} type="button" aria-label={`Eliminar ejercicio ${exerciseIndex + 1}`} title="Quitar ejercicio" onClick={() => removeExercise(blockIndex, exerciseIndex)}>
                                    <X size={16} aria-hidden />
                                  </button>
                                </div>
                              </div>
                              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <div className="sm:col-span-2">
                                  <label className={labelClass} htmlFor={fieldId('name')}>Ejercicio del catálogo</label>
                                  <ExerciseNameAutocomplete
                                    id={fieldId('name')}
                                    value={exercise.name}
                                    suggestions={exerciseSuggestions}
                                    isLoading={isExerciseCatalogLoading}
                                    error={exerciseCatalogError}
                                    onChange={(value) => updateExercise(blockIndex, exerciseIndex, 'name', value)}
                                    onSelect={(suggestion) => selectSuggestedExercise(blockIndex, exerciseIndex, suggestion)}
                                  />
                                </div>
                                <div>
                                  <label className={labelClass} htmlFor={fieldId('muscle')}>Grupo muscular</label>
                                  <select className={fieldClass} id={fieldId('muscle')} value={exercise.muscleGroup} onChange={(event) => updateMuscleGroup(blockIndex, exerciseIndex, event.target.value)} required>
                                    <option value="">Selecciona un grupo muscular</option>
                                    {muscleGroupOptions.map((muscleGroup) => <option key={muscleGroup} value={muscleGroup}>{muscleGroup}</option>)}
                                  </select>
                                </div>
                                <div>
                                  <label className={labelClass} htmlFor={fieldId('equipment')}>Equipo</label>
                                  <select className={fieldClass} id={fieldId('equipment')} value={exercise.equipment} onChange={(event) => updateEquipment(blockIndex, exerciseIndex, event.target.value)}>
                                    <option value="">Peso corporal / Ninguno</option>
                                    {equipment.map((item, index) => (
                                      <option key={item._id || `equipment-${index}`} value={item.name || ''} disabled={item.status === 'out_of_service'}>
                                        {item.name}{item.status === 'out_of_service' ? ' (fuera de servicio)' : ''}
                                      </option>
                                    ))}
                                    <option value={customEquipmentOption}>+ Agregar otro...</option>
                                  </select>
                                </div>
                                {exercise.equipment === customEquipmentOption && (
                                  <div>
                                    <label className={labelClass} htmlFor={fieldId('custom-equipment')}>Equipo personalizado</label>
                                    <input className={fieldClass} id={fieldId('custom-equipment')} type="text" value={exercise.customEquipment} onChange={(event) => updateExercise(blockIndex, exerciseIndex, 'customEquipment', event.target.value)} placeholder="Escribe el nombre del equipo" />
                                  </div>
                                )}
                                {exercise.mode === 'Cardio' ? (
                                  <div className="grid grid-cols-3 gap-3 sm:col-span-2">
                                    <div>
                                      <label className={labelClass} htmlFor={fieldId('duration')}>Minutos</label>
                                      <input className={fieldClass} id={fieldId('duration')} type="number" min="1" value={exercise.duration} onChange={(event) => updateExercise(blockIndex, exerciseIndex, 'duration', event.target.value)} />
                                    </div>
                                    <div>
                                      <label className={labelClass} htmlFor={fieldId('distance')}>Distancia (km)</label>
                                      <input className={fieldClass} id={fieldId('distance')} type="number" min="0.01" step="0.01" value={exercise.distance} onChange={(event) => updateExercise(blockIndex, exerciseIndex, 'distance', event.target.value)} />
                                    </div>
                                    <div>
                                      <label className={labelClass} htmlFor={fieldId('level')}>Nivel</label>
                                      <input className={fieldClass} id={fieldId('level')} type="number" min="1" max="100" value={exercise.level} onChange={(event) => updateExercise(blockIndex, exerciseIndex, 'level', event.target.value)} />
                                    </div>
                                  </div>
                                ) : (
                                  <div className="grid grid-cols-2 gap-3 sm:col-span-2">
                                    <div>
                                      <label className={labelClass} htmlFor={fieldId('reps')}>Repeticiones</label>
                                      <input className={fieldClass} id={fieldId('reps')} type="text" maxLength={30} placeholder="Ej. 10 o 8-12" value={exercise.reps} onChange={(event) => updateExercise(blockIndex, exerciseIndex, 'reps', event.target.value)} />
                                    </div>
                                    <div>
                                      <label className={labelClass} htmlFor={fieldId('weight')}>Peso (kg)</label>
                                      <input className={fieldClass} id={fieldId('weight')} type="number" min="0" step="0.5" value={exercise.weight} onChange={(event) => updateExercise(blockIndex, exerciseIndex, 'weight', event.target.value)} />
                                    </div>
                                  </div>
                                )}
                                <div className="sm:col-span-2">
                                  <label className={labelClass} htmlFor={fieldId('video')}>URL del video</label>
                                  <input className={fieldClass} id={fieldId('video')} type="url" value={exercise.videoUrl} onChange={(event) => updateExercise(blockIndex, exerciseIndex, 'videoUrl', event.target.value)} placeholder="https://..." />
                                </div>
                              </div>
                            </div>
                          )
                        })}
                        <button className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:border-brand-text hover:text-brand-text" type="button" onClick={() => addExercise(blockIndex)}>
                          <Plus size={16} aria-hidden /> Agregar ejercicio
                        </button>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            {modalError && <p className={errorAlert} role="alert">{modalError}</p>}
            <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
              <button className={secondaryButton} type="button" onClick={closeBuilder} disabled={isSubmitting}>Cancelar</button>
              <button className={primaryButton} type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Guardando...' : editingTemplate || editingRoutine ? 'Guardar cambios' : builderMode === 'template' ? 'Crear plantilla' : 'Asignar rutina'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {assigningTemplate && (
        <Modal eyebrow="Asignar plantilla" title={assigningTemplate.title || 'Plantilla'} onClose={closeAssign} size="md">
          <form className="space-y-4" onSubmit={handleAssign}>
            <p className="text-sm text-slate-500">Se crea una copia de la plantilla como rutina del cliente; luego puedes ajustarla solo para él.</p>
            <div>
              <label className={labelClass} htmlFor="assignment-client">Cliente</label>
              <select className={fieldClass} id="assignment-client" value={selectedClientId} onChange={(event) => setSelectedClientId(event.target.value)} required>
                <option value="">Selecciona un cliente</option>
                {clients.map((client, index) => (
                  <option key={recordId(client) || `client-${index}`} value={recordId(client)}>
                    {userLabel(client)}{clientsWithRoutine.has(recordId(client)) ? ' · ya tiene rutina' : ''}
                  </option>
                ))}
              </select>
              {clients.length === 0 && <p className={`${hintClass} text-amber-700`}>No hay clientes disponibles para asignar.</p>}
            </div>
            {assignmentError && <p className={errorAlert} role="alert">{assignmentError}</p>}
            <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
              <button className={secondaryButton} type="button" onClick={closeAssign} disabled={isAssigning}>Cancelar</button>
              <button className={primaryButton} type="submit" disabled={isAssigning || clients.length === 0}>{isAssigning ? 'Asignando...' : 'Asignar rutina'}</button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  )
}

export default Routines
