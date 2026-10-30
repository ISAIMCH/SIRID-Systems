// The gymId to send with a new record: required in the all-gyms view, omitted otherwise (the API uses the selected gym).
export function targetGymField(isAllGyms: boolean, gymId: string) {
  if (!isAllGyms) return {}
  if (!gymId) throw new Error('Selecciona la sucursal.')
  return { gymId }
}
