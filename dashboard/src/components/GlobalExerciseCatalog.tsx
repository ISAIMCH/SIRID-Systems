import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Dumbbell, Lock, Search, X } from 'lucide-react'
import { getCatalogExercise, getExerciseCatalog } from '../services/api'
import type { CatalogExercise, CatalogExerciseDetail, ExerciseCatalogPage } from '../services/api'
import { EQUIPMENT_CATEGORIES, MUSCLE_GROUPS } from '../utils/exerciseCatalog'

const inputClassName = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100'

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="catalog-exercise-title">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-emerald-700">Catálogo global</p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-900" id="catalog-exercise-title">{exercise.name}</h2>
          </div>
          <button className="text-slate-400 hover:text-slate-700" type="button" aria-label="Cerrar" onClick={onClose}><X size={22} /></button>
        </div>
        <div className="mt-5 grid gap-6 sm:grid-cols-[220px_1fr]">
          {exercise.gifUrl
            ? <img className="aspect-square w-full rounded-xl bg-slate-50 object-contain" src={exercise.gifUrl} alt={`Animación de ${exercise.name}`} />
            : <div className="flex aspect-square w-full items-center justify-center rounded-xl bg-slate-50 text-slate-300"><Dumbbell size={40} /></div>}
          <div>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">{exercise.muscleGroup}</span>
              {detail?.secondaryMuscles.map((muscle) => <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600" key={muscle}>{muscle}</span>)}
              <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">{exercise.equipment || 'Sin equipo'}</span>
            </div>
            <h3 className="mt-5 text-sm font-semibold text-slate-900">Cómo hacerlo</h3>
            {error && <p className="mt-2 text-sm text-red-700" role="alert">{error}</p>}
            {!detail && !error && <p className="mt-2 text-sm text-slate-500">Cargando instrucciones...</p>}
            {detail && (detail.steps.length
              ? <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm text-slate-700">{detail.steps.map((step, index) => <li key={index}>{step}</li>)}</ol>
              : <p className="mt-2 text-sm text-slate-500">Este ejercicio no tiene instrucciones paso a paso.</p>)}
            {detail?.attribution && <p className="mt-4 text-xs text-slate-400">{detail.attribution}</p>}
          </div>
        </div>
      </div>
    </div>
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

  return (
    <div className="mt-6 overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
      <div className="border-b border-gray-100 p-5">
        <h2 className="text-base font-semibold text-slate-900">Catálogo global de SIRID</h2>
        <p className="mt-1 text-sm text-slate-500">Tus coaches ven los ejercicios del equipo registrado en el gimnasio. Para desbloquear más, registra equipo de esa categoría.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {EQUIPMENT_CATEGORIES.map((item) => {
            const isUnlocked = unlocked.has(item)
            const isOut = outOfService.has(item)
            const tone = isOut ? 'border-amber-200 bg-amber-50 text-amber-800' : isUnlocked ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-slate-50 text-slate-400'
            return (
              <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${tone}`} key={item} title={isOut ? 'Todo el equipo de esta categoría está fuera de servicio' : isUnlocked ? 'Desbloqueada' : 'Sin equipo registrado'}>
                {isOut ? <AlertTriangle size={12} aria-hidden="true" /> : !isUnlocked ? <Lock size={12} aria-hidden="true" /> : null}
                {item}
              </span>
            )
          })}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_180px_200px_auto] sm:items-center">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} aria-hidden="true" />
            <input className={`${inputClassName} pl-9`} type="search" placeholder="Buscar en el catálogo..." aria-label="Buscar en el catálogo" value={query} onChange={(event) => setQuery(event.target.value)} />
          </div>
          <select className={inputClassName} aria-label="Grupo muscular" value={muscleGroup} onChange={(event) => setMuscleGroup(event.target.value)}>
            <option value="">Todos los músculos</option>
            {MUSCLE_GROUPS.map((group) => <option key={group} value={group}>{group}</option>)}
          </select>
          <select className={inputClassName} aria-label="Categoría de equipo" value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="">Todo el equipo</option>
            {EQUIPMENT_CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <label className="inline-flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={showLocked} onChange={(event) => setShowLocked(event.target.checked)} />
            Ver bloqueados
          </label>
        </div>
      </div>
      {error && <div className="border-b border-red-100 bg-red-50 px-6 py-4 text-sm text-red-700" role="alert">{error}</div>}
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-gray-100 bg-gray-50/80 text-xs uppercase tracking-wider text-slate-500">
            <tr><th className="px-5 py-4 font-medium sm:px-6">Ejercicio</th><th className="px-5 py-4 font-medium sm:px-6">Grupo muscular</th><th className="px-5 py-4 font-medium sm:px-6">Equipo</th><th className="px-5 py-4 font-medium sm:px-6">Estado</th></tr>
          </thead>
          <tbody className="divide-y divide-gray-100 text-slate-700">
            {exercises.map((exercise) => {
              const equipment = exercise.equipment || 'Sin equipo'
              return (
                <tr className="cursor-pointer hover:bg-slate-50" key={exercise._id} onClick={() => setSelected(exercise)}>
                  <td className="px-5 py-3 sm:px-6">
                    <div className="flex items-center gap-3">
                      {exercise.imageUrl || exercise.gifUrl
                        ? <img className="h-10 w-10 shrink-0 rounded-full bg-slate-100 object-cover" src={exercise.imageUrl || exercise.gifUrl || ''} alt="" loading="lazy" />
                        : <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-400"><Dumbbell size={18} /></span>}
                      <button className="text-left font-medium text-slate-900 hover:text-green-700" type="button">{exercise.name}</button>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 sm:px-6"><span className="inline-flex rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">{exercise.muscleGroup}</span></td>
                  <td className="whitespace-nowrap px-5 py-3 sm:px-6"><span className="inline-flex rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">{equipment}</span></td>
                  <td className="whitespace-nowrap px-5 py-3 text-xs sm:px-6">
                    {!unlocked.has(equipment)
                      ? <span className="inline-flex items-center gap-1 text-slate-400"><Lock size={12} />Falta equipo</span>
                      : outOfService.has(equipment)
                        ? <span className="inline-flex items-center gap-1 text-amber-700"><AlertTriangle size={12} />Equipo en mantenimiento</span>
                        : <span className="text-emerald-700">Disponible</span>}
                  </td>
                </tr>
              )
            })}
            {!isLoading && !exercises.length && <tr><td className="px-6 py-10 text-center text-sm text-slate-500" colSpan={4}>No hay ejercicios con estos filtros.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-gray-100 px-5 py-4 text-sm text-slate-500 sm:px-6">
        <span>{result ? `${exercises.length} de ${result.total} ejercicios` : ''}</span>
        {isLoading
          ? <span>Cargando...</span>
          : result?.hasMore && <button className="rounded-lg border border-slate-200 px-4 py-2 font-medium text-slate-700 hover:bg-slate-50" type="button" onClick={() => void load(result.page + 1)}>Cargar más</button>}
      </div>
      {selected && <ExerciseDetailDialog exercise={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}
