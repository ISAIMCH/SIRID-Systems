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
  onEnrolled: (user: User) => void
  onClose: () => void
}

const inputClassName = 'w-full rounded-lg border border-slate-200 px-4 py-3 text-slate-900 outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-100'

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

function ClientEnrollmentModal({ initialOutcome = null, onEnrolled, onClose }: ClientEnrollmentModalProps) {
  const { isAllGyms } = useAuth()
  const [form, setForm] = useState({ name: '', lastName: '', email: '', phone: '' })
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
              className="rounded-lg bg-[#9BFF63] px-4 py-2 font-medium text-[#0F172A] transition hover:bg-[#abff7c]"
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
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-emerald-700">Recepción</p>
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
              Para clientes que aún no tienen la app. Puedes cobrar la membresía enseguida; la cuenta se activa después en la app con el código.
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
                className="rounded-lg bg-[#9BFF63] px-4 py-2 font-medium text-[#0F172A] transition hover:bg-[#abff7c] disabled:opacity-50"
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
