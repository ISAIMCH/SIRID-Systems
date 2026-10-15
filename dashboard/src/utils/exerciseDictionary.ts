const EXERCISE_DATA_URL = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json'
const EXERCISE_IMAGE_BASE_URL = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/'

const mexicanExerciseNames: Record<string, string> = {
  squat: 'Sentadilla',
  'barbell squat': 'Sentadilla con barra',
  'front barbell squat': 'Sentadilla frontal con barra',
  'goblet squat': 'Sentadilla copa',
  lunge: 'Desplante',
  lunges: 'Desplantes',
  'dumbbell lunge': 'Desplante con mancuernas',
  'push up': 'Lagartija',
  'push-up': 'Lagartija',
  'pushups': 'Lagartijas',
  'pull up': 'Dominada',
  'pull-up': 'Dominada',
  'pullups': 'Dominadas',
  'chin up': 'Dominada supina',
  'chin-up': 'Dominada supina',
  deadlift: 'Peso Muerto',
  'barbell deadlift': 'Peso Muerto con barra',
  'romanian deadlift': 'Peso Muerto rumano',
  'bench press': 'Press de Pecho',
  'barbell bench press': 'Press de Pecho con barra',
  'dumbbell bench press': 'Press de Pecho con mancuernas',
  crunch: 'Abdominales',
  crunches: 'Abdominales',
  'cable crunch': 'Abdominales en polea',
  'shoulder press': 'Press de Hombros',
  'military press': 'Press militar',
  'overhead press': 'Press por encima de la cabeza',
  'bicep curl': 'Curl de bíceps',
  'dumbbell curl': 'Curl de bíceps con mancuernas',
  'barbell curl': 'Curl de bíceps con barra',
  'triceps dip': 'Fondos para tríceps',
  'triceps pushdown': 'Jalón de tríceps',
  'lat pulldown': 'Jalón al pecho',
  'seated cable row': 'Remo sentado en polea',
  'bent over row': 'Remo inclinado',
  'barbell row': 'Remo con barra',
  'leg press': 'Prensa de piernas',
  'leg extension': 'Extensión de piernas',
  'leg curl': 'Curl de piernas',
  'calf raise': 'Elevación de pantorrillas',
  'hip thrust': 'Empuje de cadera',
  plank: 'Plancha',
  'side plank': 'Plancha lateral',
  'jumping jack': 'Saltos de tijera',
  'jumping jacks': 'Saltos de tijera',
  burpee: 'Burpee',
  burpees: 'Burpees',
  'mountain climber': 'Escalador',
  'mountain climbers': 'Escaladores',
  'air bike': 'Bicicleta abdominal',
  'standing calf raises': 'Elevación de pantorrillas de pie',
}

const muscleGroupTranslations: Record<string, string> = {
  abdominals: 'Core',
  abductors: 'Piernas',
  adductors: 'Piernas',
  biceps: 'Brazos',
  calves: 'Piernas',
  chest: 'Pecho',
  forearms: 'Brazos',
  glutes: 'Piernas',
  hamstrings: 'Piernas',
  lats: 'Espalda',
  lower_back: 'Espalda',
  middle_back: 'Espalda',
  neck: 'Hombros',
  quadriceps: 'Piernas',
  shoulders: 'Hombros',
  traps: 'Espalda',
  triceps: 'Brazos',
}

interface FreeExercise {
  id?: string
  name?: string
  equipment?: string | null
  primaryMuscles?: string[] | null
  secondaryMuscles?: string[] | null
  category?: string | null
  images?: string[] | null
  gifUrl?: string | null
  videoUrl?: string | null
}

export interface SuggestedExercise {
  id: string
  name: string
  originalName: string
  equipment: string
  muscleGroup: string
  videoUrl: string
}

function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function translateExerciseName(name: string) {
  return mexicanExerciseNames[name.toLocaleLowerCase().trim()] || name
}

function translateMuscleGroup(muscles: string[] | null | undefined, category?: string | null) {
  for (const muscle of muscles || []) {
    const translated = muscleGroupTranslations[normalize(muscle).replaceAll(' ', '_')]
    if (translated) return translated
  }

  return category?.toLocaleLowerCase() === 'cardio' ? 'Cardio' : 'Cuerpo Completo'
}

function imageUrl(image: string) {
  if (/^https?:\/\//i.test(image)) return image
  return `${EXERCISE_IMAGE_BASE_URL}${image.split('/').map(encodeURIComponent).join('/')}`
}

export async function fetchAndFilterExercises(): Promise<SuggestedExercise[]> {
  const response = await fetch(EXERCISE_DATA_URL)
  if (!response.ok) {
    throw new Error(`No se pudo cargar el catálogo de ejercicios (HTTP ${response.status}).`)
  }

  const data: unknown = await response.json()
  if (!Array.isArray(data)) {
    throw new Error('El catálogo de ejercicios tiene un formato inesperado.')
  }

  return (data as FreeExercise[])
    .filter((exercise) => typeof exercise.name === 'string')
    .map((exercise) => {
      const originalName = exercise.name || ''
      const muscleGroup = translateMuscleGroup(exercise.primaryMuscles, exercise.category)
      const firstImage = exercise.images?.[0]
      return {
        id: exercise.id || originalName,
        name: translateExerciseName(originalName),
        originalName,
        equipment: exercise.equipment || '',
        muscleGroup,
        videoUrl: exercise.gifUrl || exercise.videoUrl || (firstImage ? imageUrl(firstImage) : ''),
      }
    })
}

export function filterExerciseSuggestions(exercises: SuggestedExercise[], query: string) {
  const normalizedQuery = normalize(query)
  if (!normalizedQuery) return []

  return exercises
    .filter((exercise) => (
      normalize(exercise.name).includes(normalizedQuery)
      || normalize(exercise.originalName).includes(normalizedQuery)
    ))
    .slice(0, 8)
}
