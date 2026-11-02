// Titles for the rules the API checks on entry (evaluateAccess); the API's message gives the details.
export const DENIAL_TITLES: Record<string, string> = {
  account_disabled: 'Cuenta no habilitada',
  membership_inactive: 'Membresía no vigente',
  gym_not_included: 'Sucursal no incluida en el plan',
  outside_schedule: 'Fuera del horario del plan',
  document_required: 'Documento pendiente',
}

export function denialTitleForCode(code: string | null | undefined) {
  return (code && DENIAL_TITLES[code]) || 'Acceso denegado'
}

// A time in the gym's own zone (the browser's when it is unknown).
export function formatGymTime(value: string, timezone?: string | null, withDate = false) {
  return new Intl.DateTimeFormat('es-MX', {
    ...(withDate ? { dateStyle: 'medium' } : {}),
    timeStyle: 'short',
    ...(timezone ? { timeZone: timezone } : {}),
  }).format(new Date(value))
}
