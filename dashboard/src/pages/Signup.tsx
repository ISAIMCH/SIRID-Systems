import { useState, type FormEvent, type ReactNode } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ApiError, signupOwner, type OwnerSignupPayload } from '../services/api'

const inputClass = 'w-full border border-slate-200 px-4 py-3 text-slate-900 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100'

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
      <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor={id}>{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
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
  const [result, setResult] = useState<{ name: string; existingAccount: boolean } | null>(null)

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
      setResult({ name: response.organization.name, existingAccount: response.existingAccount })
    } catch (requestError) {
      setError(signupErrorMessage(requestError))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F8FAFC] px-4 py-12 sm:px-6">
      <section className="w-full max-w-2xl border border-slate-100 bg-white p-6 shadow-xl shadow-slate-200/60 sm:p-10">
        <p className="text-xl font-semibold tracking-tight text-[#0F172A]">GymGo</p>
        <p className="mt-1 text-xs font-medium uppercase tracking-[0.25em] text-emerald-700">Registro de gimnasios</p>

        {result ? (
          <div className="mt-8">
            <CheckCircle2 className="text-emerald-600" size={40} aria-hidden="true" />
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900">Solicitud enviada</h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Recibimos la solicitud de <strong>{result.name}</strong>. SIRID la revisará y te llamará al teléfono que registraste.
              Inicia sesión más tarde para ver si ya fue aprobada.
            </p>
            {result.existingAccount && (
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Usamos tu cuenta de GymGo existente: entra con el mismo correo y contraseña.
              </p>
            )}
            <Link className="mt-8 inline-block bg-[#9BFF63] px-6 py-3 font-semibold text-[#0F172A] transition hover:bg-[#abff7c]" to="/login">
              Ir a iniciar sesión
            </Link>
          </div>
        ) : (
          <>
            <h1 className="mt-8 text-3xl font-semibold tracking-tight text-slate-900">Registra tu gimnasio</h1>
            <p className="mt-2 text-sm text-slate-500">
              SIRID revisa cada solicitud antes de activarla. ¿Ya usas GymGo? Usa el mismo correo y contraseña de tu cuenta.
            </p>

            <form className="mt-8 space-y-8" onSubmit={handleSubmit}>
              <fieldset className="grid gap-5 sm:grid-cols-2">
                <legend className="mb-4 text-xs font-medium uppercase tracking-[0.2em] text-slate-500">Propietario</legend>
                <Field id="name" label="Nombre">
                  <input className={inputClass} id="name" autoComplete="given-name" value={form.name} onChange={update('name')} minLength={2} maxLength={100} required />
                </Field>
                <Field id="lastName" label="Apellidos">
                  <input className={inputClass} id="lastName" autoComplete="family-name" value={form.lastName} onChange={update('lastName')} maxLength={50} />
                </Field>
                <Field id="email" label="Correo electrónico">
                  <input className={inputClass} id="email" type="email" autoComplete="email" value={form.email} onChange={update('email')} maxLength={254} required />
                </Field>
                <Field id="phone" label="Teléfono" hint="10 dígitos. SIRID te llamará a este número.">
                  <input className={inputClass} id="phone" type="tel" autoComplete="tel" inputMode="tel" value={form.phone} onChange={update('phone')} required />
                </Field>
                <div className="sm:col-span-2">
                  <Field id="password" label="Contraseña" hint="Mínimo 10 caracteres. Si ya tienes cuenta, escribe tu contraseña actual.">
                    <input className={inputClass} id="password" type="password" autoComplete="new-password" value={form.password} onChange={update('password')} minLength={10} maxLength={72} required />
                  </Field>
                </div>
              </fieldset>

              <fieldset className="grid gap-5 sm:grid-cols-2">
                <legend className="mb-4 text-xs font-medium uppercase tracking-[0.2em] text-slate-500">Negocio</legend>
                <div className="sm:col-span-2">
                  <Field id="organizationName" label="Nombre comercial">
                    <input className={inputClass} id="organizationName" placeholder="Ej. Fuerza Total" value={form.organizationName} onChange={update('organizationName')} minLength={2} maxLength={120} required />
                  </Field>
                </div>
                <Field id="legalName" label="Razón social (opcional)">
                  <input className={inputClass} id="legalName" value={form.legalName} onChange={update('legalName')} maxLength={200} />
                </Field>
                <Field id="rfc" label="RFC (opcional)">
                  <input className={`${inputClass} uppercase`} id="rfc" value={form.rfc} onChange={update('rfc')} maxLength={13} />
                </Field>
              </fieldset>

              <fieldset className="grid gap-5 sm:grid-cols-2">
                <legend className="mb-4 text-xs font-medium uppercase tracking-[0.2em] text-slate-500">Primera sucursal</legend>
                <Field id="gymName" label="Nombre de la sucursal">
                  <input className={inputClass} id="gymName" placeholder="Ej. Centro" value={form.gymName} onChange={update('gymName')} minLength={2} maxLength={120} required />
                </Field>
                <Field id="gymAddress" label="Dirección (opcional)">
                  <input className={inputClass} id="gymAddress" autoComplete="street-address" value={form.gymAddress} onChange={update('gymAddress')} maxLength={200} />
                </Field>
              </fieldset>

              {error && (
                <p className="border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{error}</p>
              )}

              <div className="flex flex-col-reverse gap-4 sm:flex-row sm:items-center sm:justify-between">
                <Link className="text-center text-sm font-medium text-slate-500 hover:text-slate-800" to="/login">Ya tengo acceso</Link>
                <button
                  className="bg-[#9BFF63] px-6 py-3 font-semibold text-[#0F172A] transition hover:bg-[#abff7c] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
                  type="submit"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Enviando...' : 'Enviar solicitud'}
                </button>
              </div>
            </form>
          </>
        )}
      </section>
    </main>
  )
}

export default Signup
