import { useAuth } from '../store/useAuth'

interface GymSelectProps {
  id: string
  label?: string
  value: string
  onChange: (gymId: string) => void
}

// In the all-gyms view a new record must name its gym instead of silently going to the main one.
// Renders nothing when a gym is already selected: the API then uses that gym.
function GymSelect({ id, label = 'Sucursal', value, onChange }: GymSelectProps) {
  const { isAllGyms, organizationGyms } = useAuth()
  if (!isAllGyms) return null

  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor={id}>
        {label}
      </label>
      <select
        className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-100"
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required
      >
        <option value="">Selecciona una sucursal</option>
        {organizationGyms.map((gym) => <option key={gym.id} value={gym.id}>{gym.name}</option>)}
      </select>
    </div>
  )
}

export default GymSelect
