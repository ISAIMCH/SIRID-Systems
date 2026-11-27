import { useEffect, useState, type FormEvent } from 'react'
import { ArrowRight, MailCheck } from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import AuthShell from '../components/AuthShell'
import OrganizationStatusCard from '../components/OrganizationStatusCard'
import { errorAlert, fieldClass, labelClass, primaryButton, successAlert } from '../components/ui/styles'
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

  const errorBox = error && <p className={errorAlert} role="alert">{error}</p>

  return (
    <AuthShell eyebrow="Panel administrativo">
      {notice ? (
        <OrganizationStatusCard notice={notice} onBack={() => { clearOrganizationNotice(); setNotice(null); setPassword('') }} />
      ) : verifying !== null ? (
        <>
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-soft text-brand-text" aria-hidden="true">
            <MailCheck size={22} />
          </span>
          <h1 className="mt-4 font-display text-2xl font-bold tracking-tight text-ink">Confirma tu correo</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Te enviamos un código de 6 dígitos a <strong className="text-slate-700">{verifying}</strong>. Revisa también la carpeta de spam.
          </p>
          <form className="mt-6 space-y-5" onSubmit={handleVerify} noValidate>
            <div>
              <label className={labelClass} htmlFor="verifyCode">Código de verificación</label>
              <input
                className={`${fieldClass} py-3 text-center font-mono text-2xl tracking-[0.5em]`}
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
            {info && <p className={successAlert} role="status">{info}</p>}
            <button className={`${primaryButton} w-full min-h-[44px]`} type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Confirmando…' : 'Confirmar y entrar'}
            </button>
          </form>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-5 text-sm">
            <button className="font-semibold text-brand-text hover:underline disabled:font-medium disabled:text-slate-400 disabled:no-underline" type="button" onClick={() => void handleResend()} disabled={resendIn > 0}>
              {resendIn > 0 ? <>Reenviar código (<span className="tabular">{resendIn}</span> s)</> : 'Reenviar código'}
            </button>
            <button className="text-slate-500 hover:text-ink hover:underline" type="button" onClick={() => { setVerifying(null); setError(''); setInfo('') }}>
              Usar otra cuenta
            </button>
          </div>
        </>
      ) : (
        <>
          <h1 className="font-display text-2xl font-bold tracking-tight text-ink">Bienvenido de vuelta</h1>
          <p className="mt-1.5 text-sm text-slate-500">Entra como propietario, gerente, recepción o coach.</p>

          <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
            <div>
              <label className={labelClass} htmlFor="email">Correo electrónico</label>
              <input
                className={fieldClass}
                id="email"
                type="email"
                autoComplete="email"
                placeholder="tu@gimnasio.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>

            <div>
              <div className="flex items-baseline justify-between gap-3">
                <label className={labelClass} htmlFor="password">Contraseña</label>
                <Link className="text-sm font-semibold text-brand-text hover:underline" to="/forgot-password" state={{ email }}>¿La olvidaste?</Link>
              </div>
              <input
                className={fieldClass}
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

            <button className={`${primaryButton} w-full min-h-[44px]`} type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Validando…' : <>Entrar al panel <ArrowRight size={16} aria-hidden /></>}
            </button>
          </form>

          <p className="mt-6 border-t border-slate-100 pt-5 text-center text-sm text-slate-500">
            ¿Tienes un gimnasio?{' '}
            <Link className="font-semibold text-brand-text hover:underline" to="/signup">Regístralo en GymGo</Link>
          </p>
        </>
      )}
    </AuthShell>
  )
}

export default Login
