import { useAuth } from '../store/useAuth'
import { fieldClass, labelClass } from './ui/styles'

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
      <label className={labelClass} htmlFor={id}>
        {label}
      </label>
      <select
        className={fieldClass}
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
