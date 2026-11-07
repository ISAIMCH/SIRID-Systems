import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Printer } from 'lucide-react'
import { enrollClient } from '../services/api'
import type { ActivationCode } from '../services/api'
import type { User } from '../types'
import GymSelect from './GymSelect'
import { useAuth } from '../store/useAuth'
import { targetGymField } from '../utils/targetGym'

// What reception sees after registering a client, or after asking for a new code.
export interface EnrollmentOutcome {
  client: { id: string; name: string; email: string }
  activation: ActivationCode | null
  linkedExisting: boolean
  alreadyClient?: boolean
}

interface ClientEnrollmentModalProps {
  // Opens on the code view (new code for a client); otherwise on the form.
  initialOutcome?: EnrollmentOutcome | null
  // Coaches of the gym; only managers can list them, so reception registers without one.
  coaches?: User[]
  onEnrolled: (user: User) => void
  onClose: () => void
}

const inputClassName = 'w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-100'

const TRAINING_DAYS = [
  { label: 'L', name: 'Lunes', value: 1 },
  { label: 'M', name: 'Martes', value: 2 },
  { label: 'X', name: 'Miércoles', value: 3 },
  { label: 'J', name: 'Jueves', value: 4 },
  { label: 'V', name: 'Viernes', value: 5 },
  { label: 'S', name: 'Sábado', value: 6 },
  { label: 'D', name: 'Domingo', value: 0 },
]

const emptyForm = {
  name: '',
  lastName: '',
  email: '',
  phone: '',
  goal: '',
  experienceLevel: '',
  availableTrainingDays: [] as number[],
  assignedCoach: '',
  observations: '',
}

function coachName(coach: User) {
  return [coach.name || coach.firstName, coach.lastName].filter(Boolean).join(' ') || coach.email
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('es-MX', { dateStyle: 'long' }).format(new Date(value))
}

// A sheet the client takes home: the steps to activate the account and the one-time code.
function printActivationSheet(outcome: EnrollmentOutcome, activation: ActivationCode) {
  const sheet = window.open('', '_blank', 'width=600,height=800')
  if (!sheet) throw new Error('El navegador bloqueó la ventana de impresión.')
  const doc = sheet.document
  doc.title = `Activación de ${outcome.client.name}`
  doc.body.style.cssText = 'font-family: system-ui, sans-serif; text-align: center; padding: 48px; color: #0F172A;'

  const append = (tag: string, text: string, style: string) => {
    const element = doc.createElement(tag)
    element.textContent = text
    element.style.cssText = style
    doc.body.appendChild(element)
  }
  append('h1', 'Activa tu cuenta GymGo', 'font-size: 28px; margin: 0;')
  append('p', outcome.client.name, 'font-size: 18px; margin: 16px 0 0;')
  append('p', outcome.client.email, 'font-size: 14px; color: #475569; margin: 4px 0 32px;')
  append('p', 'Tu código de activación', 'font-size: 14px; color: #475569; margin: 0;')
  append('p', activation.code, 'font-size: 44px; font-weight: 700; letter-spacing: 0.3em; margin: 8px 0;')
  append('p', `Válido hasta el ${formatDate(activation.expiresAt)}. Solo se usa una vez.`, 'font-size: 14px; color: #64748B; margin: 0 0 32px;')
  append('p', '1. Descarga la app GymGo.  2. Toca «Activar cuenta».  3. Escribe tu correo, este código y una contraseña nueva.', 'font-size: 15px; line-height: 1.6;')
  append('p', 'No compartas este código. Si lo pierdes, pide uno nuevo en recepción.', 'font-size: 13px; color: #64748B; margin-top: 24px;')
  sheet.focus()
  sheet.print()
}

function ClientEnrollmentModal({ initialOutcome = null, coaches = [], onEnrolled, onClose }: ClientEnrollmentModalProps) {
  const { isAllGyms } = useAuth()
  const [form, setForm] = useState(emptyForm)
  const [gymId, setGymId] = useState('')
  const [outcome, setOutcome] = useState<EnrollmentOutcome | null>(initialOutcome)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setIsSubmitting(true)
    try {
      const result = await enrollClient({
        name: form.name.trim(),
        lastName: form.lastName.trim() || undefined,
        email: form.email.trim(),
        phone: form.phone.trim(),
        goal: form.goal.trim() || undefined,
        experienceLevel: form.experienceLevel || undefined,
        availableTrainingDays: form.availableTrainingDays.length ? form.availableTrainingDays : undefined,
        assignedCoach: form.assignedCoach || undefined,
        observations: form.observations.trim() || undefined,
        ...targetGymField(isAllGyms, gymId),
      })
      onEnrolled(result.user)
      setOutcome({
        client: {
          id: result.user.id || result.user._id || '',
          name: [result.user.name, result.user.lastName].filter(Boolean).join(' ') || form.name.trim(),
          email: result.user.email,
        },
        activation: result.activation,
        linkedExisting: result.linkedExisting,
        alreadyClient: result.alreadyClient,
      })
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No se pudo registrar al cliente.')
    } finally {
      setIsSubmitting(false)
    }
  }

  function handlePrint(activation: ActivationCode) {
    if (!outcome) return
    try {
      printActivationSheet(outcome, activation)
    } catch (printError) {
      setError(printError instanceof Error ? printError.message : 'No se pudo abrir la impresión.')
    }
  }

  function renderOutcome(current: EnrollmentOutcome) {
    const { activation } = current
    let summary = 'Cuenta creada. Entrégale el código para que active su cuenta en la app.'
    if (current.alreadyClient) summary = 'Esta persona ya es cliente de tu gimnasio; no se cambió nada.'
    else if (current.linkedExisting && activation) summary = 'Esta cuenta aún no se activa. Se generó un código nuevo y el anterior dejó de funcionar.'
    else if (current.linkedExisting) summary = 'Ya tenía cuenta GymGo: quedó registrada como cliente y verá un aviso en su app. Inicia sesión con su contraseña de siempre.'

    return (
      <div className="mt-6 space-y-5">
        <div>
          <p className="font-medium text-slate-900">{current.client.name}</p>
          <p className="text-sm text-slate-500">{current.client.email}</p>
        </div>
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">{summary}</p>

        {activation && (
          <div className="rounded-xl border border-green-200 bg-green-50 px-6 py-5 text-center">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-green-800">Código de activación</p>
            <p className="mt-2 select-all font-mono text-4xl font-semibold tracking-[0.25em] text-slate-900">{activation.code}</p>
            <p className="mt-2 text-sm text-slate-600">
              Válido hasta el {formatDate(activation.expiresAt)}. Solo se muestra ahora: imprímelo o díctaselo al cliente.
            </p>
          </div>
        )}

        {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{error}</p>}

        <div className="flex flex-wrap justify-end gap-3">
          {activation && (
            <button
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 font-medium text-slate-700 transition hover:bg-slate-50"
              type="button"
              onClick={() => handlePrint(activation)}
            >
              <Printer size={16} aria-hidden="true" /> Imprimir
            </button>
          )}
          {current.client.id && (
            <Link
              className="rounded-lg bg-brand px-4 py-2 font-medium text-ink transition hover:bg-brand-hover"
              to={`/payments?cliente=${encodeURIComponent(current.client.id)}`}
            >
              Cobrar membresía
            </Link>
          )}
          <button
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 font-medium text-slate-700 transition hover:bg-slate-50"
            type="button"
            onClick={onClose}
          >
            Listo
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-2xl animate-pop-in overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-emerald-700">Clientes</p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-900">
              {outcome ? 'Código de activación' : 'Registrar cliente'}
            </h2>
          </div>
          <button
            className="text-2xl leading-none text-slate-400 transition hover:text-slate-700"
            type="button"
            aria-label="Cerrar"
            onClick={() => { if (!isSubmitting) onClose() }}
          >
            ×
          </button>
        </div>

        {outcome ? renderOutcome(outcome) : (
          <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
            <p className="text-sm text-slate-500">
              Da de alta al cliente con su perfil. Puedes cobrar la membresía enseguida; la cuenta se activa después en la app con el código.
            </p>
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="enroll-name">Nombre</label>
                <input
                  className={inputClassName}
                  id="enroll-name"
                  type="text"
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                  minLength={2}
                  maxLength={100}
                  required
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="enroll-last-name">Apellidos</label>
                <input
                  className={inputClassName}
                  id="enroll-last-name"
                  type="text"
                  value={form.lastName}
                  onChange={(event) => setForm({ ...form, lastName: event.target.value })}
                  maxLength={50}
                />
              </div>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="enroll-email">Correo electrónico</label>
              <input
                className={inputClassName}
                id="enroll-email"
                type="email"
                autoComplete="off"
                value={form.email}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
                required
              />
              <p className="mt-1 text-xs text-slate-500">Si ya usa GymGo en otro gimnasio, se vincula su cuenta sin ver su historial.</p>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="enroll-phone">Teléfono (10 dígitos)</label>
              <input
                className={inputClassName}
                id="enroll-phone"
                type="tel"
                inputMode="numeric"
                autoComplete="off"
                value={form.phone}
                onChange={(event) => setForm({ ...form, phone: event.target.value })}
                required
              />
            </div>
            <GymSelect id="enroll-gym" label="Sucursal del cliente" value={gymId} onChange={setGymId} />

            <section className="space-y-5 rounded-xl border border-slate-200 bg-slate-50 p-5">
              <div>
                <h3 className="text-base font-semibold text-slate-900">Perfil de entrenamiento</h3>
                <p className="mt-1 text-sm text-slate-500">Opcional. Si la persona ya tenía cuenta GymGo, su objetivo, nivel y días se conservan.</p>
              </div>
              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="enroll-goal">Objetivo deportivo</label>
                  <input
                    className={inputClassName}
                    id="enroll-goal"
                    type="text"
                    placeholder="Ej. Ganar masa, bajar de peso..."
                    value={form.goal}
                    onChange={(event) => setForm({ ...form, goal: event.target.value })}
                    maxLength={120}
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="enroll-level">Nivel de experiencia</label>
                  <select
                    className={inputClassName}
                    id="enroll-level"
                    value={form.experienceLevel}
                    onChange={(event) => setForm({ ...form, experienceLevel: event.target.value })}
                  >
                    <option value="">Sin especificar</option>
                    <option value="principiante">Principiante</option>
                    <option value="intermedio">Intermedio</option>
                    <option value="avanzado">Avanzado</option>
                  </select>
                </div>
              </div>
              <fieldset>
                <legend className="mb-2 block text-sm font-medium text-slate-700">Días disponibles</legend>
                <div className="flex flex-wrap gap-2">
                  {TRAINING_DAYS.map(({ label, name, value }) => {
                    const isChecked = form.availableTrainingDays.includes(value)
                    return (
                      <label
                        className={`inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg border text-sm font-medium transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-text ${
                          isChecked ? 'border-ink bg-ink text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                        }`}
                        key={value}
                        title={name}
                      >
                        <input
                          className="sr-only"
                          type="checkbox"
                          aria-label={name}
                          checked={isChecked}
                          onChange={(event) => setForm((current) => ({
                            ...current,
                            availableTrainingDays: event.target.checked
                              ? [...current.availableTrainingDays, value]
                              : current.availableTrainingDays.filter((day) => day !== value),
                          }))}
                        />
                        {label}
                      </label>
                    )
                  })}
                </div>
              </fieldset>
              {coaches.length > 0 && (
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="enroll-coach">Coach asignado</label>
                  <select
                    className={inputClassName}
                    id="enroll-coach"
                    value={form.assignedCoach}
                    onChange={(event) => setForm({ ...form, assignedCoach: event.target.value })}
                  >
                    <option value="">Sin coach</option>
                    {coaches.map((coach) => {
                      const coachId = coach.id || coach._id || ''
                      return <option key={coachId} value={coachId}>{coachName(coach)}</option>
                    })}
                  </select>
                </div>
              )}
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="enroll-notes">Observaciones</label>
                <textarea
                  className={`${inputClassName} min-h-[88px] resize-y`}
                  id="enroll-notes"
                  placeholder="Lesiones, restricciones, preferencias..."
                  value={form.observations}
                  onChange={(event) => setForm({ ...form, observations: event.target.value })}
                  maxLength={4000}
                />
              </div>
            </section>

            {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{error}</p>}

            <div className="flex justify-end gap-3">
              <button
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 font-medium text-slate-700 transition hover:bg-slate-50"
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
              >
                Cancelar
              </button>
              <button
                className="rounded-lg bg-brand px-4 py-2 font-medium text-ink transition hover:bg-brand-hover disabled:opacity-50"
                type="submit"
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Registrando...' : 'Registrar'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

export default ClientEnrollmentModal
