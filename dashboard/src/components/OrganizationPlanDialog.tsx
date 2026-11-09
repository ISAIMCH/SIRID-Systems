import { useState, type FormEvent } from 'react'
import { CalendarPlus, Gem, Infinity as InfinityIcon, X } from 'lucide-react'
import { updateOrganizationSubscription, type OrganizationSubscriptionUpdate, type PlatformOrganization, type SaasPlan } from '../services/api'

type Mode = OrganizationSubscriptionUpdate['status']

const MODES: { value: Mode; label: string; description: string; icon: typeof Gem }[] = [
  { value: 'trialing', label: 'Extender prueba', description: 'Da más días de prueba con el plan actual.', icon: CalendarPlus },
  { value: 'active', label: 'Pagado hasta', description: 'Pagó fuera de la web (transferencia, efectivo) hasta una fecha.', icon: Gem },
  { value: 'manual', label: 'Plan manual', description: 'Vendido por SIRID (Cadena, IoT). No vence hasta que lo cambies.', icon: InfinityIcon },
]

const inputClassName = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-100'

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
    <div className="fixed inset-0 z-40 flex items-center justify-center overflow-y-auto bg-slate-900/50 px-4 py-8 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="plan-dialog-title">
      <form className="w-full max-w-lg animate-pop-in rounded-card bg-white p-6 shadow-lift" onSubmit={handleSubmit}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl font-bold text-ink" id="plan-dialog-title">Plan de {organization.name}</h2>
            <p className="mt-1 text-sm text-slate-500">El dueño y su equipo ven el cambio al instante.</p>
          </div>
          <button className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-500 hover:bg-slate-100" type="button" aria-label="Cerrar" onClick={onClose}>
            <X size={18} aria-hidden />
          </button>
        </div>

        <fieldset className="mt-5 grid gap-2">
          <legend className="sr-only">Tipo de cambio</legend>
          {MODES.map(({ value, label, description, icon: Icon }) => {
            const disabled = value === 'trialing' && !current.planCode
            return (
              <label
                key={value}
                className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${mode === value ? 'border-brand bg-brand-soft ring-1 ring-brand/50' : 'border-slate-200 hover:border-slate-300'} ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
              >
                <input className="sr-only" type="radio" name="mode" value={value} checked={mode === value} disabled={disabled} onChange={() => changeMode(value)} />
                <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${mode === value ? 'bg-brand text-brand-ink' : 'bg-slate-100 text-slate-600'}`}>
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

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {mode !== 'trialing' && (
            <div className={mode === 'manual' ? 'sm:col-span-1' : ''}>
              <label className="mb-1.5 block text-xs font-medium text-slate-500" htmlFor="plan-code">Plan</label>
              <select className={inputClassName} id="plan-code" value={planCode} onChange={(event) => setPlanCode(event.target.value)} required>
                {plans.map((plan) => <option key={plan.code} value={plan.code}>{plan.name}</option>)}
              </select>
            </div>
          )}
          {mode !== 'manual' && (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-500" htmlFor="plan-until">{mode === 'trialing' ? 'Prueba hasta' : 'Pagado hasta'}</label>
              <input className={inputClassName} id="plan-until" type="date" min={dateInput(1)} value={until} onChange={(event) => setUntil(event.target.value)} required />
            </div>
          )}
          {mode !== 'trialing' && (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-500" htmlFor="plan-gym-limit">Límite de sucursales</label>
              <input
                className={inputClassName}
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

        {error && <p className="mt-4 text-sm text-red-600" role="alert">{error}</p>}
        <div className="mt-6 flex justify-end gap-3">
          <button className="rounded-full px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100" type="button" onClick={onClose}>Cancelar</button>
          <button className="rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50" type="submit" disabled={isSubmitting || (mode !== 'trialing' && !planCode)}>
            {isSubmitting ? 'Guardando…' : 'Guardar plan'}
          </button>
        </div>
      </form>
    </div>
  )
}

export default OrganizationPlanDialog
