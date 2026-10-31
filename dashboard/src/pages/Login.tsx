import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import OrganizationStatusCard from '../components/OrganizationStatusCard'
import { blockedOrganization, login, type OrganizationNotice } from '../services/api'
import { clearOrganizationNotice, readOrganizationNotice } from '../store/organizationNotice'
import { useAuth } from '../store/useAuth'

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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setIsSubmitting(true)

    try {
      const response = await login({ email, password })
      if (response.user.role === 'Cliente') {
        // A client of another gym who applied as owner sees their request instead.
        const application = response.organizationApplications?.[0]
        if (application) setNotice(application)
        else setError('Las cuentas de cliente usan la app móvil de GymGo.')
        return
      }
      clearOrganizationNotice()
      signIn(response.token, response)
      const from = (location.state as { from?: string } | null)?.from || '/'
      navigate(from, { replace: true })
    } catch (requestError) {
      const blocked = blockedOrganization(requestError)
      if (blocked) {
        setNotice(blocked)
        return
      }
      setError(requestError instanceof Error ? requestError.message : 'No se pudo iniciar sesión.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F8FAFC] px-6 py-12">
      <section className="w-full max-w-md border border-slate-100 bg-white p-8 shadow-xl shadow-slate-200/60 sm:p-10">
        {notice ? (
          <OrganizationStatusCard notice={notice} onBack={() => { clearOrganizationNotice(); setNotice(null); setPassword('') }} />
        ) : (
        <>
        <div className="mb-8">
          <p className="text-xl font-semibold tracking-tight text-[#0F172A]">GymGo</p>
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
              className="w-full border border-slate-200 px-4 py-3 text-slate-900 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
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
              className="w-full border border-slate-200 px-4 py-3 text-slate-900 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
              id="password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>

          {error && (
            <p className="border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
              {error}
            </p>
          )}

          <button
            className="w-full bg-[#9BFF63] px-4 py-3 font-semibold text-[#0F172A] transition hover:bg-[#abff7c] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
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