import { useEffect, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import OrganizationStatusCard from '../components/OrganizationStatusCard'
import {
  blockedOrganization,
  emailNotVerified,
  login,
  resendVerificationCode,
  verifyEmail,
  type LoginResponse,
  type OrganizationNotice,
} from '../services/api'
import { clearOrganizationNotice, readOrganizationNotice } from '../store/organizationNotice'
import { useAuth } from '../store/useAuth'
import { canUseDashboard } from '../utils/access'

const inputClass = 'w-full border border-slate-200 px-4 py-3 text-slate-900 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100'
const RESEND_SECONDS = 60

function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  // Set when the account's organization is pending, rejected or suspended (also after a session is cut).
  const [notice, setNotice] = useState<OrganizationNotice | null>(readOrganizationNotice)
  // The email waiting for its verification code (the API emailed it when the sign-in was refused).
  const [verifying, setVerifying] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [info, setInfo] = useState('')
  const [resendIn, setResendIn] = useState(0)

  useEffect(() => {
    if (resendIn <= 0) return
    const timer = setTimeout(() => setResendIn((value) => value - 1), 1000)
    return () => clearTimeout(timer)
  }, [resendIn])

  function enter(response: LoginResponse) {
    if (!canUseDashboard(response)) {
      // A client of another gym who applied as owner sees their request instead.
      const application = response.organizationApplications?.[0]
      if (application) setNotice(application)
      else setError('Las cuentas de cliente usan la app móvil de GymGo. Si un gimnasio te invitó a su staff, acepta la invitación en la app.')
      return
    }
    clearOrganizationNotice()
    signIn(response.token, response)
    const from = (location.state as { from?: string } | null)?.from || '/'
    navigate(from, { replace: true })
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setIsSubmitting(true)

    try {
      enter(await login({ email, password }))
    } catch (requestError) {
      const blocked = blockedOrganization(requestError)
      if (blocked) {
        setNotice(blocked)
        return
      }
      const unverified = emailNotVerified(requestError)
      if (unverified !== null) {
        setVerifying(unverified || email.trim().toLowerCase())
        setCode('')
        setInfo('')
        setResendIn(RESEND_SECONDS)
        return
      }
      setError(requestError instanceof Error ? requestError.message : 'No se pudo iniciar sesión.')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleVerify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!verifying) return
    setError('')
    setInfo('')
    if (!/^\d{6}$/.test(code)) {
      setError('Escribe los 6 dígitos del código.')
      return
    }
    setIsSubmitting(true)
    try {
      enter(await verifyEmail(verifying, code))
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No se pudo confirmar el código.')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleResend() {
    if (!verifying) return
    setError('')
    setInfo('')
    try {
      await resendVerificationCode(verifying)
      setInfo('Te enviamos un código nuevo.')
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No se pudo reenviar el código.')
    } finally {
      setResendIn(RESEND_SECONDS)
    }
  }

  const errorBox = error && (
    <p className="border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
      {error}
    </p>
  )

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-6 py-12">
      <section className="w-full max-w-md border border-slate-100 bg-white p-8 shadow-xl shadow-slate-200/60 sm:p-10">
        {notice ? (
          <OrganizationStatusCard notice={notice} onBack={() => { clearOrganizationNotice(); setNotice(null); setPassword('') }} />
        ) : verifying !== null ? (
          <>
            <div className="mb-8">
              <p className="text-xl font-semibold tracking-tight text-ink">GymGo</p>
              <h1 className="mt-8 text-3xl font-semibold tracking-tight text-slate-900">Confirma tu correo</h1>
              <p className="mt-2 text-sm text-slate-500">
                Te enviamos un código de 6 dígitos a <strong className="text-slate-700">{verifying}</strong>. Revisa también la carpeta de spam.
              </p>
            </div>
            <form className="space-y-5" onSubmit={handleVerify} noValidate>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="verifyCode">Código de verificación</label>
                <input
                  className={`${inputClass} text-center font-mono text-2xl tracking-[0.5em]`}
                  id="verifyCode"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="000000"
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                  autoFocus
                  required
                />
              </div>
              {errorBox}
              {info && <p className="border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-800" role="status">{info}</p>}
              <button
                className="w-full bg-brand px-4 py-3 font-semibold text-ink transition hover:bg-brand-hover active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
                type="submit"
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Confirmando...' : 'Confirmar y entrar'}
              </button>
            </form>
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-sm">
              <button className="font-medium text-emerald-700 hover:underline disabled:text-slate-400 disabled:no-underline" type="button" onClick={() => void handleResend()} disabled={resendIn > 0}>
                {resendIn > 0 ? `Reenviar código (${resendIn} s)` : 'Reenviar código'}
              </button>
              <button className="text-slate-500 hover:underline" type="button" onClick={() => { setVerifying(null); setError(''); setInfo('') }}>
                Usar otra cuenta
              </button>
            </div>
          </>
        ) : (
        <>
        <div className="mb-8">
          <p className="text-xl font-semibold tracking-tight text-ink">GymGo</p>
          <p className="mt-1 text-xs font-medium uppercase tracking-[0.25em] text-emerald-700">
            Panel administrativo
          </p>
          <h1 className="mt-8 text-3xl font-semibold tracking-tight text-slate-900">Bienvenido</h1>
          <p className="mt-2 text-sm text-slate-500">Accede como administrador o coach.</p>
        </div>

        <form className="space-y-5" onSubmit={handleSubmit}>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="email">
              Correo electrónico
            </label>
            <input
              className={inputClass}
              id="email"
              type="email"
              autoComplete="email"
              placeholder="admin@gymgo.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="password">
              Contraseña
            </label>
            <input
              className={inputClass}
              id="password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>

          {errorBox}

          <button
            className="w-full bg-brand px-4 py-3 font-semibold text-ink transition hover:bg-brand-hover active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
            type="submit"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Validando...' : 'Acceder al Panel'}
          </button>
        </form>

        <p className="mt-8 text-center text-sm text-slate-500">
          ¿Tienes un gimnasio?{' '}
          <Link className="font-medium text-emerald-700 hover:underline" to="/signup">Regístralo en GymGo</Link>
        </p>
        </>
        )}
      </section>
    </main>
  )
}

export default Login
