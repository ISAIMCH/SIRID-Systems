import { useEffect, useState, type FormEvent } from 'react'
import { KeyRound } from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import AuthShell from '../components/AuthShell'
import { errorAlert, fieldClass, hintClass, labelClass, primaryButton, successAlert } from '../components/ui/styles'
import { requestPasswordReset, resetPassword } from '../services/api'
import { useAuth } from '../store/useAuth'
import { canUseDashboard } from '../utils/access'

const RESEND_SECONDS = 60
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const message = (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback)

// "¿Olvidaste tu contraseña?": a 6-digit code goes to the email; the code and a new password open the session.
function ForgotPassword() {
  const navigate = useNavigate()
  const location = useLocation()
  const { signIn } = useAuth()
  const [email, setEmail] = useState(((location.state as { email?: string } | null)?.email ?? '').trim())
  // The email the code went to; null while the person is still typing it.
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [resendIn, setResendIn] = useState(0)
  // Set when the new password belongs to a client account, which uses the app instead of the panel.
  const [clientDone, setClientDone] = useState(false)

  useEffect(() => {
    if (resendIn <= 0) return
    const timer = setTimeout(() => setResendIn((value) => value - 1), 1000)
    return () => clearTimeout(timer)
  }, [resendIn])

  async function handleSend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    const typed = email.trim().toLowerCase()
    if (!EMAIL.test(typed)) {
      setError('Escribe un correo válido.')
      return
    }
    setIsSubmitting(true)
    try {
      await requestPasswordReset(typed)
      setSentTo(typed)
      setResendIn(RESEND_SECONDS)
    } catch (requestError) {
      setError(message(requestError, 'No se pudo enviar el código.'))
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleResend() {
    if (!sentTo) return
    setError('')
    setInfo('')
    try {
      await requestPasswordReset(sentTo)
      setInfo('Te enviamos un código nuevo.')
    } catch (requestError) {
      setError(message(requestError, 'No se pudo reenviar el código.'))
    } finally {
      setResendIn(RESEND_SECONDS)
    }
  }

  async function handleReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!sentTo) return
    setError('')
    setInfo('')
    if (!/^\d{6}$/.test(code)) return setError('Escribe los 6 dígitos del código.')
    if (password.length < 10) return setError('La contraseña nueva debe tener al menos 10 caracteres.')
    if (password !== confirmation) return setError('Las contraseñas no coinciden.')
    setIsSubmitting(true)
    try {
      const response = await resetPassword(sentTo, code, password)
      if (!canUseDashboard(response)) {
        setClientDone(true)
        return
      }
      signIn(response.token, response)
      navigate('/', { replace: true })
    } catch (requestError) {
      setError(message(requestError, 'No se pudo cambiar la contraseña.'))
    } finally {
      setIsSubmitting(false)
    }
  }

  const errorBox = error && <p className={errorAlert} role="alert">{error}</p>

  return (
    <AuthShell eyebrow="Panel administrativo">
      <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-soft text-brand-text" aria-hidden="true">
        <KeyRound size={22} />
      </span>
      {clientDone ? (
        <>
          <h1 className="mt-4 font-display text-2xl font-bold tracking-tight text-ink">Contraseña actualizada</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Ya puedes entrar con tu contraseña nueva. Las cuentas de cliente usan la app móvil de GymGo.
          </p>
          <Link className={`${primaryButton} mt-6 w-full min-h-[44px]`} to="/login">Volver al inicio de sesión</Link>
        </>
      ) : sentTo ? (
        <>
          <h1 className="mt-4 font-display text-2xl font-bold tracking-tight text-ink">Crea tu contraseña nueva</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Si <strong className="text-slate-700">{sentTo}</strong> tiene cuenta en GymGo, le enviamos un código de 6 dígitos. Revisa también la carpeta de spam.
          </p>
          <form className="mt-6 space-y-5" onSubmit={handleReset} noValidate>
            <div>
              <label className={labelClass} htmlFor="resetCode">Código del correo</label>
              <input
                className={`${fieldClass} py-3 text-center font-mono text-2xl tracking-[0.5em]`}
                id="resetCode"
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
            <div>
              <label className={labelClass} htmlFor="newPassword">Contraseña nueva</label>
              <input className={fieldClass} id="newPassword" type="password" autoComplete="new-password" maxLength={72} value={password} onChange={(event) => setPassword(event.target.value)} required />
              <p className={hintClass}>Mínimo 10 caracteres. Se cerrará tu sesión en los demás dispositivos.</p>
            </div>
            <div>
              <label className={labelClass} htmlFor="confirmPassword">Repite la contraseña</label>
              <input className={fieldClass} id="confirmPassword" type="password" autoComplete="new-password" maxLength={72} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required />
            </div>
            {errorBox}
            {info && <p className={successAlert} role="status">{info}</p>}
            <button className={`${primaryButton} w-full min-h-[44px]`} type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Guardando…' : 'Guardar y entrar'}
            </button>
          </form>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-5 text-sm">
            <button className="font-semibold text-brand-text hover:underline disabled:font-medium disabled:text-slate-400 disabled:no-underline" type="button" onClick={() => void handleResend()} disabled={resendIn > 0}>
              {resendIn > 0 ? <>Reenviar código (<span className="tabular">{resendIn}</span> s)</> : 'Reenviar código'}
            </button>
            <button className="text-slate-500 hover:text-ink hover:underline" type="button" onClick={() => { setSentTo(null); setError(''); setInfo('') }}>
              Usar otro correo
            </button>
          </div>
        </>
      ) : (
        <>
          <h1 className="mt-4 font-display text-2xl font-bold tracking-tight text-ink">¿Olvidaste tu contraseña?</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">Escribe el correo de tu cuenta y te enviaremos un código para crear una contraseña nueva.</p>
          <form className="mt-6 space-y-5" onSubmit={handleSend} noValidate>
            <div>
              <label className={labelClass} htmlFor="email">Correo electrónico</label>
              <input className={fieldClass} id="email" type="email" autoComplete="email" placeholder="tu@gimnasio.com" value={email} onChange={(event) => setEmail(event.target.value)} autoFocus required />
            </div>
            {errorBox}
            <button className={`${primaryButton} w-full min-h-[44px]`} type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Enviando…' : 'Enviar código'}
            </button>
          </form>
          <p className="mt-6 border-t border-slate-100 pt-5 text-center text-sm text-slate-500">
            <Link className="font-semibold text-brand-text hover:underline" to="/login">Volver al inicio de sesión</Link>
          </p>
        </>
      )}
    </AuthShell>
  )
}

export default ForgotPassword
