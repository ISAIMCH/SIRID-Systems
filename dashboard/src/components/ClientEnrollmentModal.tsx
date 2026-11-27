import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { MailCheck, Printer, Wallet } from 'lucide-react'
import { cancelClientLink, confirmClientLink, enrollClient, resendClientLinkCode } from '../services/api'
import type { ActivationCode, ClientEnrollmentResult, ClientLinkRequest } from '../services/api'
import { connectSocket } from '../services/socket'
import type { User } from '../types'
import GymSelect from './GymSelect'
import Modal from './ui/Modal'
import { errorAlert, fieldClass, hintClass, labelClass, primaryButton, secondaryButton } from './ui/styles'
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

type PendingLink = { request: ClientLinkRequest; alreadyPending?: boolean; emailSent?: boolean }

// The email already has a GymGo account from another gym: it joins this gym only once its holder agrees, by reading
// to reception the code we emailed them or by accepting in their app.
function LinkPendingView({ pending, onLinked, onCancelled, onClose }: {
  pending: PendingLink
  onLinked: (result: ClientEnrollmentResult | null) => void
  onCancelled: () => void
  onClose: () => void
}) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState<'confirm' | 'resend' | 'cancel' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState(pending.alreadyPending
    ? 'Ya había una solicitud pendiente para este correo. Si no le llegó el código, reenvíalo.'
    : pending.emailSent === false
      ? 'No pudimos enviar el correo. Reenvía el código o pide que acepte desde su app.'
      : '')
  const requestId = pending.request.id

  // The holder may accept or reject in their app while reception waits.
  useEffect(() => {
    const socket = connectSocket()
    const onUpdate = (event: { id: string; status: string }) => {
      if (event.id !== requestId) return
      if (event.status === 'accepted') onLinked(null)
      if (event.status === 'rejected') {
        setInfo('')
        setError('La persona rechazó la solicitud desde su app.')
      }
    }
    socket.on('client-link-updated', onUpdate)
    return () => { socket.off('client-link-updated', onUpdate) }
  }, [requestId, onLinked])

  async function run(action: 'confirm' | 'resend' | 'cancel') {
    setError(null)
    setInfo('')
    setBusy(action)
    try {
      if (action === 'confirm') {
        onLinked(await confirmClientLink(requestId, code))
      } else if (action === 'resend') {
        const result = await resendClientLinkCode(requestId)
        setCode('')
        setInfo(result.emailSent ? 'Enviamos un código nuevo a su correo.' : 'No pudimos enviar el correo. Pide que acepte desde su app.')
      } else {
        await cancelClientLink(requestId)
        onCancelled()
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No se pudo completar la acción.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <form className="space-y-5" onSubmit={(event) => { event.preventDefault(); void run('confirm') }}>
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-amber-50 text-amber-600" aria-hidden>
          <MailCheck size={20} />
        </span>
        <div className="min-w-0">
          <p className="font-semibold text-ink">Esperando confirmación</p>
          <p className="truncate text-sm text-slate-500">{pending.request.email}</p>
        </div>
      </div>
      <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
        Este correo ya tiene cuenta de GymGo en otro gimnasio. Para registrarla aquí la persona debe estar de acuerdo:
        le enviamos un código de 6 dígitos a su correo para que te lo dicte. También puede aceptar desde su app.
      </p>
      <div>
        <label className={labelClass} htmlFor="link-code">Código del correo</label>
        <input
          className={`${fieldClass} font-mono text-lg tracking-[0.3em]`}
          id="link-code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={6}
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
          required
        />
      </div>
      {info && <p className={hintClass}>{info}</p>}
      {error && <p className={errorAlert} role="alert">{error}</p>}
      <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:flex-wrap sm:justify-end">
        <button className={secondaryButton} type="button" onClick={onClose} disabled={busy !== null}>Cerrar</button>
        <button className={secondaryButton} type="button" onClick={() => void run('cancel')} disabled={busy !== null}>
          {busy === 'cancel' ? 'Cancelando...' : 'Cancelar solicitud'}
        </button>
        <button className={secondaryButton} type="button" onClick={() => void run('resend')} disabled={busy !== null}>
          {busy === 'resend' ? 'Enviando...' : 'Reenviar código'}
        </button>
        <button className={primaryButton} type="submit" disabled={busy !== null || code.length !== 6}>
          {busy === 'confirm' ? 'Confirmando...' : 'Confirmar'}
        </button>
      </div>
    </form>
  )
}

function ClientEnrollmentModal({ initialOutcome = null, coaches = [], onEnrolled, onClose }: ClientEnrollmentModalProps) {
  const { isAllGyms } = useAuth()
  const [form, setForm] = useState(emptyForm)
  const [gymId, setGymId] = useState('')
  const [outcome, setOutcome] = useState<EnrollmentOutcome | null>(initialOutcome)
  const [pendingLink, setPendingLink] = useState<PendingLink | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function showLinked(result: ClientEnrollmentResult | null, email: string) {
    if (result) onEnrolled(result.user)
    setPendingLink(null)
    setOutcome({
      client: {
        id: result?.user.id || result?.user._id || '',
        name: result ? [result.user.name, result.user.lastName].filter(Boolean).join(' ') || email : email,
        email,
      },
      activation: null,
      linkedExisting: true,
    })
  }

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
      if (result.linkRequest) {
        setPendingLink({ request: result.linkRequest, alreadyPending: result.alreadyPending, emailSent: result.emailSent })
        return
      }
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
    else if (current.linkedExisting && activation) summary = 'Se generó un código nuevo y el anterior dejó de funcionar.'
    else if (current.linkedExisting) summary = 'Aceptó la solicitud: quedó registrada como cliente de tu gimnasio. Entra con su contraseña de siempre.'

    return (
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-slate-100 text-sm font-semibold text-slate-600" aria-hidden>
            {current.client.name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toLocaleUpperCase()).join('')}
          </span>
          <div className="min-w-0">
            <p className="truncate font-semibold text-ink">{current.client.name}</p>
            <p className="truncate text-sm text-slate-500">{current.client.email}</p>
          </div>
        </div>
        <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">{summary}</p>

        {activation && (
          <div className="relative overflow-hidden rounded-card bg-ink px-6 py-6 text-center text-white">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_85%_15%,rgba(16,255,133,0.25),transparent_55%)]" aria-hidden="true" />
            <p className="relative text-xs font-semibold uppercase tracking-[0.2em] text-brand">Código de activación</p>
            <p className="relative mt-3 select-all font-mono text-4xl font-semibold tracking-[0.25em] tabular">{activation.code}</p>
            <p className="relative mt-3 text-sm text-slate-300">
              Válido hasta el {formatDate(activation.expiresAt)}. Solo se muestra ahora: imprímelo o díctaselo al cliente.
            </p>
          </div>
        )}

        {error && <p className={errorAlert} role="alert">{error}</p>}

        <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:flex-wrap sm:justify-end">
          <button className={secondaryButton} type="button" onClick={onClose}>Listo</button>
          {activation && (
            <button className={secondaryButton} type="button" onClick={() => handlePrint(activation)}>
              <Printer size={16} aria-hidden /> Imprimir
            </button>
          )}
          {current.client.id && (
            <Link className={primaryButton} to={`/caja?cliente=${encodeURIComponent(current.client.id)}`}>
              <Wallet size={16} aria-hidden /> Cobrar membresía
            </Link>
          )}
        </div>
      </div>
    )
  }

  return (
    <Modal
      eyebrow="Clientes"
      title={pendingLink ? 'Confirmación del cliente' : outcome ? (outcome.activation ? 'Código de activación' : 'Cliente registrado') : 'Registrar cliente'}
      onClose={() => { if (!isSubmitting) onClose() }}
      size={outcome || pendingLink ? 'lg' : 'xl'}
    >
      {pendingLink ? (
        <LinkPendingView
          pending={pendingLink}
          onLinked={(result) => showLinked(result, pendingLink.request.email)}
          onCancelled={() => setPendingLink(null)}
          onClose={onClose}
        />
      ) : outcome ? renderOutcome(outcome) : (
        <form className="space-y-5" onSubmit={handleSubmit}>
          <p className="-mt-1 text-sm text-slate-500">
            Da de alta al cliente con su perfil. Puedes cobrar la membresía enseguida; la cuenta se activa después en la app con el código.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor="enroll-name">Nombre</label>
              <input
                className={fieldClass}
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
              <label className={labelClass} htmlFor="enroll-last-name">Apellidos</label>
              <input
                className={fieldClass}
                id="enroll-last-name"
                type="text"
                value={form.lastName}
                onChange={(event) => setForm({ ...form, lastName: event.target.value })}
                maxLength={50}
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor="enroll-email">Correo electrónico</label>
              <input
                className={fieldClass}
                id="enroll-email"
                type="email"
                autoComplete="off"
                value={form.email}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
                aria-describedby="enroll-email-hint"
                required
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="enroll-phone">Teléfono (10 dígitos)</label>
              <input
                className={fieldClass}
                id="enroll-phone"
                type="tel"
                inputMode="numeric"
                autoComplete="off"
                value={form.phone}
                onChange={(event) => setForm({ ...form, phone: event.target.value })}
                required
              />
            </div>
          </div>
          <p className={`${hintClass} -mt-3`} id="enroll-email-hint">Si ya usa GymGo en otro gimnasio, le enviaremos un código a su correo para que confirme; su historial sigue siendo privado.</p>
          <GymSelect id="enroll-gym" label="Sucursal del cliente" value={gymId} onChange={setGymId} />

          <fieldset className="space-y-4 rounded-xl border border-slate-200 p-4">
            <legend className="px-1 text-sm font-semibold text-ink">
              Perfil de entrenamiento <span className="font-normal text-slate-400">(opcional)</span>
            </legend>
            <p className="-mt-1 text-xs text-slate-500">Si la persona ya tenía cuenta GymGo, su objetivo, nivel y días se conservan.</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass} htmlFor="enroll-goal">Objetivo deportivo</label>
                <input
                  className={fieldClass}
                  id="enroll-goal"
                  type="text"
                  placeholder="Ej. Ganar masa, bajar de peso..."
                  value={form.goal}
                  onChange={(event) => setForm({ ...form, goal: event.target.value })}
                  maxLength={120}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="enroll-level">Nivel de experiencia</label>
                <select
                  className={fieldClass}
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
              <legend className={labelClass}>Días disponibles</legend>
              <div className="flex flex-wrap gap-2">
                {TRAINING_DAYS.map(({ label, name, value }) => {
                  const isChecked = form.availableTrainingDays.includes(value)
                  return (
                    <label
                      className={`inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl border text-sm font-semibold transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand/40 ${
                        isChecked ? 'border-ink bg-ink text-brand' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
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
                <label className={labelClass} htmlFor="enroll-coach">Coach asignado</label>
                <select
                  className={fieldClass}
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
              <label className={labelClass} htmlFor="enroll-notes">Observaciones</label>
              <textarea
                className={`${fieldClass} min-h-[88px] resize-y`}
                id="enroll-notes"
                placeholder="Lesiones, restricciones, preferencias..."
                value={form.observations}
                onChange={(event) => setForm({ ...form, observations: event.target.value })}
                maxLength={4000}
              />
            </div>
          </fieldset>

          {error && <p className={errorAlert} role="alert">{error}</p>}

          <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
            <button className={secondaryButton} type="button" onClick={onClose} disabled={isSubmitting}>Cancelar</button>
            <button className={primaryButton} type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Registrando...' : 'Registrar'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  )
}

export default ClientEnrollmentModal
