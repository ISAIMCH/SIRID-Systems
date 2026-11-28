import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, BookOpen, Dumbbell, Lock, Search } from 'lucide-react'
import { getCatalogExercise, getExerciseCatalog } from '../services/api'
import type { CatalogExercise, CatalogExerciseDetail, ExerciseCatalogPage } from '../services/api'
import { EQUIPMENT_CATEGORIES, MUSCLE_GROUPS } from '../utils/exerciseCatalog'
import Panel from './ui/Panel'
import Modal from './ui/Modal'
import Badge, { type BadgeTone } from './ui/Badge'
import EmptyState from './ui/EmptyState'
import { errorAlert, fieldClass, secondaryButton } from './ui/styles'

function ExerciseDetailDialog({ exercise, onClose }: { exercise: CatalogExercise; onClose: () => void }) {
  const [detail, setDetail] = useState<CatalogExerciseDetail | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    getCatalogExercise(exercise._id)
      .then((response) => { if (active) setDetail(response.exercise) })
      .catch((requestError: unknown) => { if (active) setError(requestError instanceof Error ? requestError.message : 'No se pudo cargar el ejercicio.') })
    return () => { active = false }
  }, [exercise._id])

  return (
    <Modal eyebrow="Catálogo global" title={exercise.name} onClose={onClose} size="xl">
      <div className="grid gap-6 sm:grid-cols-[220px_1fr]">
        {exercise.gifUrl
          ? <img className="aspect-square w-full rounded-xl bg-slate-50 object-contain ring-1 ring-slate-200" src={exercise.gifUrl} alt={`Animación de ${exercise.name}`} />
          : <div className="grid aspect-square w-full place-items-center rounded-xl bg-slate-50 text-slate-300"><Dumbbell size={40} aria-hidden /></div>}
        <div>
          <div className="flex flex-wrap gap-1.5">
            <Badge tone="brand">{exercise.muscleGroup}</Badge>
            {detail?.secondaryMuscles.map((muscle) => <Badge key={muscle}>{muscle}</Badge>)}
            <Badge tone="info">{exercise.equipment || 'Sin equipo'}</Badge>
          </div>
          <h3 className="mt-5 text-sm font-semibold text-ink">Cómo hacerlo</h3>
          {error && <p className={`${errorAlert} mt-2`} role="alert">{error}</p>}
          {!detail && !error && (
            <div className="mt-3 space-y-2" aria-busy="true" aria-label="Cargando instrucciones">
              {Array.from({ length: 3 }).map((_, index) => <div className="skeleton h-4 w-full" key={index} />)}
            </div>
          )}
          {detail && (detail.steps.length
            ? (
              <ol className="mt-3 space-y-2.5 text-sm text-slate-700">
                {detail.steps.map((step, index) => (
                  <li className="flex gap-3" key={index}>
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600 tabular">{index + 1}</span>
                    <span className="pt-0.5">{step}</span>
                  </li>
                ))}
              </ol>
            )
            : <p className="mt-2 text-sm text-slate-500">Este ejercicio no tiene instrucciones paso a paso.</p>)}
          {detail?.attribution && <p className="mt-4 text-xs text-slate-400">{detail.attribution}</p>}
        </div>
      </div>
    </Modal>
  )
}

// Read-only: gyms do not edit global exercises, they unlock them by registering equipment of each family.
export default function GlobalExerciseCatalog() {
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [muscleGroup, setMuscleGroup] = useState('')
  const [category, setCategory] = useState('')
  const [showLocked, setShowLocked] = useState(false)
  const [result, setResult] = useState<ExerciseCatalogPage | null>(null)
  const [exercises, setExercises] = useState<CatalogExercise[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<CatalogExercise | null>(null)
  const requestId = useRef(0)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 300)
    return () => clearTimeout(timer)
  }, [query])

  async function load(page: number) {
    const id = ++requestId.current
    setIsLoading(true)
    setError(null)
    try {
      const response = await getExerciseCatalog({
        q: debouncedQuery.length >= 2 ? debouncedQuery : undefined,
        muscleGroup,
        category,
        availableOnly: showLocked ? false : undefined,
        page,
      })
      if (id !== requestId.current) return
      // The organization's own exercises are listed in the other tab.
      const globals = response.exercises.filter((exercise) => exercise.source === 'global')
      setResult(response)
      setExercises((current) => page === 1 ? globals : [...current, ...globals])
    } catch (requestError) {
      if (id === requestId.current) setError(requestError instanceof Error ? requestError.message : 'No se pudo cargar el catálogo.')
    } finally {
      if (id === requestId.current) setIsLoading(false)
    }
  }

  useEffect(() => {
    void load(1)
    // `load` reads the filters below; it is not memoized on purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery, muscleGroup, category, showLocked])

  const unlocked = new Set(result?.unlockedCategories ?? [])
  const outOfService = new Set(result?.outOfServiceCategories ?? [])

  function statusOf(equipment: string, availability?: CatalogExercise['availability']): { label: string; tone: BadgeTone; icon?: typeof Lock } {
    // The API decides per exercise when it can: master-catalog equipment may unlock a few exercises of a family.
    if (availability === 'locked') return { label: 'Falta equipo', tone: 'neutral', icon: Lock }
    if (availability === 'maintenance') return { label: 'En mantenimiento', tone: 'warning', icon: AlertTriangle }
    if (availability === 'available') return { label: 'Disponible', tone: 'success' }
    if (!unlocked.has(equipment)) return { label: 'Falta equipo', tone: 'neutral', icon: Lock }
    if (outOfService.has(equipment)) return { label: 'En mantenimiento', tone: 'warning', icon: AlertTriangle }
    return { label: 'Disponible', tone: 'success' }
  }

  return (
    <Panel
      className="mt-6"
      title="Catálogo global de SIRID"
      icon={BookOpen}
      description="Tus coaches ven los ejercicios del equipo registrado en el gimnasio. Para desbloquear más, registra equipo de esa categoría."
    >
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Categorías de equipo</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {EQUIPMENT_CATEGORIES.map((item) => {
            const isUnlocked = unlocked.has(item)
            const isOut = outOfService.has(item)
            return (
              <span key={item} title={isOut ? 'Todo el equipo de esta categoría está fuera de servicio' : isUnlocked ? 'Desbloqueada' : 'Sin equipo registrado'}>
                <Badge tone={isOut ? 'warning' : isUnlocked ? 'success' : 'neutral'} icon={isOut ? AlertTriangle : isUnlocked ? undefined : Lock}>{item}</Badge>
              </span>
            )
          })}
        </div>
      </div>

      <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_11rem_12rem_auto] lg:items-center">
        <label className="relative block sm:col-span-2 lg:col-span-1">
          <span className="sr-only">Buscar en el catálogo</span>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} aria-hidden />
          <input className={`${fieldClass} pl-10`} type="search" placeholder="Buscar en el catálogo" value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>
        <select className={fieldClass} aria-label="Grupo muscular" value={muscleGroup} onChange={(event) => setMuscleGroup(event.target.value)}>
          <option value="">Todos los músculos</option>
          {MUSCLE_GROUPS.map((group) => <option key={group} value={group}>{group}</option>)}
        </select>
        <select className={fieldClass} aria-label="Categoría de equipo" value={category} onChange={(event) => setCategory(event.target.value)}>
          <option value="">Todo el equipo</option>
          {EQUIPMENT_CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <label className="inline-flex min-h-[40px] cursor-pointer items-center gap-2 whitespace-nowrap text-sm text-slate-600">
          <input className="h-4 w-4 rounded border-slate-300" type="checkbox" checked={showLocked} onChange={(event) => setShowLocked(event.target.checked)} />
          Ver bloqueados
        </label>
      </div>

      {error && <p className={`${errorAlert} mt-4`} role="alert">{error}</p>}

      <div className="mt-5">
        {isLoading && exercises.length === 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true" aria-label="Cargando catálogo">
            {Array.from({ length: 6 }).map((_, index) => <div className="skeleton h-20 w-full rounded-xl" key={index} />)}
          </div>
        ) : !exercises.length ? (
          !error && <EmptyState icon={Dumbbell} title="Sin ejercicios con estos filtros">Cambia la búsqueda, el músculo o la categoría de equipo, o activa «Ver bloqueados».</EmptyState>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {exercises.map((exercise) => {
              const equipment = exercise.equipment || 'Sin equipo'
              const status = statusOf(equipment, exercise.availability)
              const thumbnail = exercise.imageUrl || exercise.gifUrl
              return (
                <li key={exercise._id}>
                  <button
                    className="group flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left transition duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-lift"
                    type="button"
                    onClick={() => setSelected(exercise)}
                  >
                    {thumbnail
                      ? <img className="h-14 w-14 shrink-0 rounded-lg bg-slate-50 object-cover ring-1 ring-slate-200" src={thumbnail} alt="" loading="lazy" />
                      : <span className="grid h-14 w-14 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-400"><Dumbbell size={20} aria-hidden /></span>}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-ink group-hover:text-brand-text">{exercise.name}</p>
                      <p className="truncate text-xs text-slate-500">{exercise.muscleGroup} · {equipment}</p>
                      <div className="mt-1.5"><Badge tone={status.tone} icon={status.icon}>{status.label}</Badge></div>
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <div className="mt-5 flex items-center justify-between gap-3 border-t border-slate-100 pt-4 text-sm text-slate-500">
        <span className="tabular">{result ? `${exercises.length} de ${result.total} ejercicios` : ''}</span>
        {isLoading && exercises.length > 0
          ? <span>Cargando...</span>
          : result?.hasMore && <button className={secondaryButton} type="button" onClick={() => void load(result.page + 1)}>Cargar más</button>}
      </div>
      {selected && <ExerciseDetailDialog exercise={selected} onClose={() => setSelected(null)} />}
    </Panel>
  )
}
