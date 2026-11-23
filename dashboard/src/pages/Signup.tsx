import { useState, type FormEvent, type ReactNode } from 'react'
import { Building2, CheckCircle2, MapPin, UserRound, type LucideIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import AuthShell from '../components/AuthShell'
import { errorAlert, fieldClass, hintClass, labelClass, primaryButton } from '../components/ui/styles'
import { ApiError, signupOwner, type OwnerSignupPayload } from '../services/api'

const EMPTY_FORM: Required<OwnerSignupPayload> = {
  name: '',
  lastName: '',
  email: '',
  password: '',
  phone: '',
  organizationName: '',
  legalName: '',
  rfc: '',
  gymName: '',
  gymAddress: '',
}

interface FieldProps {
  id: keyof OwnerSignupPayload
  label: string
  hint?: string
  children: ReactNode
}

function Field({ id, label, hint, children }: FieldProps) {
  return (
    <div>
      <label className={labelClass} htmlFor={id}>{label}</label>
      {children}
      {hint && <p className={hintClass}>{hint}</p>}
    </div>
  )
}

function Legend({ icon: Icon, step, children }: { icon: LucideIcon; step: number; children: ReactNode }) {
  return (
    <legend className="mb-4 flex items-center gap-2.5 text-sm font-semibold text-ink">
      <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand-soft text-brand-text" aria-hidden="true"><Icon size={15} /></span>
      <span><span className="text-slate-400">{step}.</span> {children}</span>
    </legend>
  )
}

// Validation errors name the field that failed (e.g. the phone or the RFC) instead of a generic message.
function signupErrorMessage(error: unknown) {
  if (!(error instanceof Error)) return 'No se pudo enviar la solicitud.'
  const details = error instanceof ApiError ? (error.response.data as { details?: { message?: string }[] }).details : undefined
  const detail = Array.isArray(details) ? details.find((item) => item.message)?.message : undefined
  return detail ? `${error.message} ${detail}` : error.message
}

// Public signup for gym owners: the request waits until SIRID approves it from the platform panel.
function Signup() {
  const [form, setForm] = useState(EMPTY_FORM)
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [result, setResult] = useState<{ name: string; existingAccount: boolean; verifyEmail?: string } | null>(null)

  const update = (field: keyof OwnerSignupPayload) => (event: { target: { value: string } }) => {
    setForm((current) => ({ ...current, [field]: event.target.value }))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setIsSubmitting(true)
    try {
      const trimmed = Object.fromEntries(Object.entries(form).map(([key, value]) => [key, key === 'password' ? value : value.trim()]))
      const response = await signupOwner(trimmed as Required<OwnerSignupPayload>)
      setResult({
        name: response.organization.name,
        existingAccount: response.existingAccount,
        verifyEmail: response.verificationRequired ? response.email : undefined,
      })
    } catch (requestError) {
      setError(signupErrorMessage(requestError))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AuthShell eyebrow="Registro de gimnasios" width="2xl">
      {result ? (
        <div className="py-2 text-center sm:py-4">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-brand-soft text-brand-text" aria-hidden="true">
            <CheckCircle2 size={30} />
          </span>
          <h1 className="mt-4 font-display text-2xl font-bold tracking-tight text-ink">{result.verifyEmail ? 'Confirma tu correo' : 'Solicitud enviada'}</h1>
          {result.verifyEmail ? (
            <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-600">
              Registramos <strong className="text-ink">{result.name}</strong>. Te enviamos un código de 6 dígitos a <strong className="text-ink">{result.verifyEmail}</strong>:
              inicia sesión con tu correo y contraseña y escríbelo para entrar a tu panel.
            </p>
          ) : (
            <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-600">
              Recibimos la solicitud de <strong className="text-ink">{result.name}</strong>. SIRID la revisará y te llamará al teléfono que registraste.
              Inicia sesión más tarde para ver si ya fue aprobada.
            </p>
          )}
          {result.existingAccount && (
            <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-600">
              Usamos tu cuenta de GymGo existente: entra con el mismo correo y contraseña.
            </p>
          )}
          <Link className={`${primaryButton} mt-8 min-h-[44px] px-6`} to="/login">
            Ir a iniciar sesión
          </Link>
        </div>
      ) : (
        <>
          <h1 className="font-display text-2xl font-bold tracking-tight text-ink">Registra tu gimnasio</h1>
          <p className="mt-1.5 text-sm leading-6 text-slate-500">
            SIRID revisa cada solicitud antes de activarla. ¿Ya usas GymGo? Usa el mismo correo y contraseña de tu cuenta.
          </p>

          <form className="mt-6 space-y-8" onSubmit={handleSubmit}>
            <fieldset className="grid gap-4 sm:grid-cols-2">
              <Legend icon={UserRound} step={1}>Propietario</Legend>
              <Field id="name" label="Nombre">
                <input className={fieldClass} id="name" autoComplete="given-name" value={form.name} onChange={update('name')} minLength={2} maxLength={100} required />
              </Field>
              <Field id="lastName" label="Apellidos">
                <input className={fieldClass} id="lastName" autoComplete="family-name" value={form.lastName} onChange={update('lastName')} maxLength={50} />
              </Field>
              <Field id="email" label="Correo electrónico">
                <input className={fieldClass} id="email" type="email" autoComplete="email" value={form.email} onChange={update('email')} maxLength={254} required />
              </Field>
              <Field id="phone" label="Teléfono" hint="10 dígitos. SIRID te llamará a este número.">
                <input className={fieldClass} id="phone" type="tel" autoComplete="tel" inputMode="tel" value={form.phone} onChange={update('phone')} required />
              </Field>
              <div className="sm:col-span-2">
                <Field id="password" label="Contraseña" hint="Mínimo 10 caracteres. Si ya tienes cuenta, escribe tu contraseña actual.">
                  <input className={fieldClass} id="password" type="password" autoComplete="new-password" value={form.password} onChange={update('password')} minLength={10} maxLength={72} required />
                </Field>
              </div>
            </fieldset>

            <fieldset className="grid gap-4 sm:grid-cols-2">
              <Legend icon={Building2} step={2}>Negocio</Legend>
              <div className="sm:col-span-2">
                <Field id="organizationName" label="Nombre comercial">
                  <input className={fieldClass} id="organizationName" placeholder="Ej. Fuerza Total" value={form.organizationName} onChange={update('organizationName')} minLength={2} maxLength={120} required />
                </Field>
              </div>
              <Field id="legalName" label="Razón social (opcional)">
                <input className={fieldClass} id="legalName" value={form.legalName} onChange={update('legalName')} maxLength={200} />
              </Field>
              <Field id="rfc" label="RFC (opcional)">
                <input className={`${fieldClass} uppercase`} id="rfc" value={form.rfc} onChange={update('rfc')} maxLength={13} />
              </Field>
            </fieldset>

            <fieldset className="grid gap-4 sm:grid-cols-2">
              <Legend icon={MapPin} step={3}>Primera sucursal</Legend>
              <Field id="gymName" label="Nombre de la sucursal">
                <input className={fieldClass} id="gymName" placeholder="Ej. Centro" value={form.gymName} onChange={update('gymName')} minLength={2} maxLength={120} required />
              </Field>
              <Field id="gymAddress" label="Dirección (opcional)">
                <input className={fieldClass} id="gymAddress" autoComplete="street-address" value={form.gymAddress} onChange={update('gymAddress')} maxLength={200} />
              </Field>
            </fieldset>

            {error && <p className={errorAlert} role="alert">{error}</p>}

            <div className="flex flex-col-reverse gap-4 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-center text-sm text-slate-500">
                ¿Ya tienes acceso? <Link className="font-semibold text-brand-text hover:underline" to="/login">Inicia sesión</Link>
              </p>
              <button className={`${primaryButton} min-h-[44px] px-6`} type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Enviando…' : 'Enviar solicitud'}
              </button>
            </div>
          </form>
        </>
      )}
    </AuthShell>
  )
}

export default Signup
