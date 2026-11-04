// Same lists as the API (constants/equipment-families.js and constants/muscle-groups.js): the API rejects anything else.
export const EQUIPMENT_CATEGORIES = [
  'Sin equipo',
  'Barras',
  'Pesas / Mancuernas',
  'Máquinas',
  'Smith',
  'Poleas / Cables',
  'Bandas',
  'Pesas rusas',
  'Balones / Accesorios',
  'Otro',
] as const

export type EquipmentCategory = (typeof EQUIPMENT_CATEGORIES)[number]

export const MUSCLE_GROUPS = [
  'Abdominales', 'Abductores', 'Aductores', 'Antebrazos', 'Bíceps', 'Cardio', 'Cuello', 'Cuádriceps', 'Dorsales',
  'Espalda', 'Femoral', 'Gemelos', 'Glúteos', 'Hombros', 'Lumbar', 'Pecho', 'Trapecio', 'Tríceps',
] as const

export function isEquipmentCategory(value: unknown): value is EquipmentCategory {
  return typeof value === 'string' && (EQUIPMENT_CATEGORIES as readonly string[]).includes(value)
}
