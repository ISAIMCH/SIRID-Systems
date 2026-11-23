import { useState, type FormEvent } from 'react'
import { CalendarPlus, Gem, Infinity as InfinityIcon } from 'lucide-react'
import { updateOrganizationSubscription, type OrganizationSubscriptionUpdate, type PlatformOrganization, type SaasPlan } from '../services/api'
import Modal from './ui/Modal'
import { errorAlert, fieldClass, labelClass, primaryButton, secondaryButton } from './ui/styles'

type Mode = OrganizationSubscriptionUpdate['status']

const MODES: { value: Mode; label: string; description: string; icon: typeof Gem }[] = [
  { value: 'trialing', label: 'Extender prueba', description: 'Da más días de prueba con el plan actual.', icon: CalendarPlus },
  { value: 'active', label: 'Pagado hasta', description: 'Pagó fuera de la web (transferencia, efectivo) hasta una fecha.', icon: Gem },
  { value: 'manual', label: 'Plan manual', description: 'Vendido por SIRID (Cadena, IoT). No vence hasta que lo cambies.', icon: InfinityIcon },
]

// yyyy-mm-dd for <input type="date">, `days` from today.
function dateInput(days: number) {
  const date = new Date(Date.now() + days * 864e5)
  return date.toISOString().slice(0, 10)
}

// The end of the chosen day in local time, so "until the 30th" includes the 30th.
function endOfDay(value: string) {
  return new Date(`${value}T23:59:59`).toISOString()
}

interface OrganizationPlanDialogProps {
  organization: PlatformOrganization
  plans: SaasPlan[]
  onClose: () => void
  onDone: (organization: PlatformOrganization) => void
}

// SIRID changes an organization's GymGo plan by hand (PATCH /platform/organizations/:id/subscription).
function OrganizationPlanDialog({ organization, plans, onClose, onDone }: OrganizationPlanDialogProps) {
  const current = organization.subscription
  const [mode, setMode] = useState<Mode>(current.status === 'trialing' ? 'trialing' : 'manual')
  const [planCode, setPlanCode] = useState(current.planCode ?? plans.find((plan) => !plan.selfService)?.code ?? plans[0]?.code ?? '')
  const [until, setUntil] = useState(dateInput(mode === 'trialing' ? 14 : 30))
  const [gymLimit, setGymLimit] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const selectedPlan = plans.find((plan) => plan.code === planCode)

  function changeMode(value: Mode) {
    setMode(value)
    setUntil(dateInput(value === 'trialing' ? 14 : value === 'active' ? 30 : 0))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setIsSubmitting(true)
    const limit = gymLimit ? { gymLimit: Number(gymLimit) } : {}
    const payload: OrganizationSubscriptionUpdate = mode === 'trialing'
      ? { status: 'trialing', trialEndsAt: endOfDay(until) }
      : mode === 'active'
        ? { status: 'active', planCode, currentPeriodEnd: endOfDay(until), ...limit }
        : { status: 'manual', planCode, ...limit }
    try {
      onDone((await updateOrganizationSubscription(organization.id, payload)).organization)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No se pudo cambiar el plan.')
      setIsSubmitting(false)
    }
  }

  return (
    <Modal eyebrow="Plan GymGo" title={`Plan de ${organization.name}`} onClose={() => { if (!isSubmitting) onClose() }}>
      <form className="space-y-5" onSubmit={handleSubmit}>
        <p className="-mt-1 text-sm text-slate-500">El dueño y su equipo ven el cambio al instante.</p>

        <fieldset className="grid gap-2">
          <legend className="sr-only">Tipo de cambio</legend>
          {MODES.map(({ value, label, description, icon: Icon }) => {
            const disabled = value === 'trialing' && !current.planCode
            const isSelected = mode === value
            return (
              <label
                key={value}
                className={`flex items-start gap-3 rounded-xl border p-3 transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand/40 ${isSelected ? 'border-brand-text/30 bg-brand-soft' : 'border-slate-200 hover:border-slate-300'} ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
              >
                <input className="sr-only" type="radio" name="mode" value={value} checked={isSelected} disabled={disabled} onChange={() => changeMode(value)} />
                <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${isSelected ? 'bg-brand text-brand-ink' : 'bg-slate-100 text-slate-600'}`}>
                  <Icon size={18} aria-hidden />
                </span>
                <span>
                  <span className="block text-sm font-semibold text-ink">{label}</span>
                  <span className="block text-sm text-slate-500">{disabled ? 'Esta organización no tiene plan; elige uno primero.' : description}</span>
                </span>
              </label>
            )
          })}
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          {mode !== 'trialing' && (
            <div>
              <label className={labelClass} htmlFor="plan-code">Plan</label>
              <select className={fieldClass} id="plan-code" value={planCode} onChange={(event) => setPlanCode(event.target.value)} required>
                {plans.map((plan) => <option key={plan.code} value={plan.code}>{plan.name}</option>)}
              </select>
            </div>
          )}
          {mode !== 'manual' && (
            <div>
              <label className={labelClass} htmlFor="plan-until">{mode === 'trialing' ? 'Prueba hasta' : 'Pagado hasta'}</label>
              <input className={fieldClass} id="plan-until" type="date" min={dateInput(1)} value={until} onChange={(event) => setUntil(event.target.value)} required />
            </div>
          )}
          {mode !== 'trialing' && (
            <div>
              <label className={labelClass} htmlFor="plan-gym-limit">Límite de sucursales</label>
              <input
                className={fieldClass}
                id="plan-gym-limit"
                type="number"
                min={1}
                max={100}
                placeholder={`Del plan (${selectedPlan?.gymLimit ?? 'sin límite'})`}
                value={gymLimit}
                onChange={(event) => setGymLimit(event.target.value)}
              />
            </div>
          )}
        </div>

        {error && <p className={errorAlert} role="alert">{error}</p>}
        <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
          <button className={secondaryButton} type="button" onClick={onClose} disabled={isSubmitting}>Cancelar</button>
          <button className={primaryButton} type="submit" disabled={isSubmitting || (mode !== 'trialing' && !planCode)}>
            {isSubmitting ? 'Guardando…' : 'Guardar plan'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

export default OrganizationPlanDialog
