import { useEffect, useState, type FormEvent } from 'react'
import { Building2, Check, ChevronDown, Pause, Phone, Play, Search, X } from 'lucide-react'
import {
  getPlatformOrganization,
  getPlatformOrganizations,
  updateOrganizationGymLimit,
  updateOrganizationStatus,
  type OrganizationStatus,
  type PlatformOrganization,
} from '../services/api'

const STATUS_TABS: { value: OrganizationStatus | ''; label: string }[] = [
  { value: 'pending', label: 'Pendientes' },
  { value: 'active', label: 'Activas' },
  { value: 'suspended', label: 'Suspendidas' },
  { value: 'rejected', label: 'Rechazadas' },
  { value: '', label: 'Todas' },
]

const STATUS_BADGE: Record<OrganizationStatus, { label: string; tone: string }> = {
  pending: { label: 'En revisión', tone: 'bg-amber-50 text-amber-800 border-amber-200' },
  active: { label: 'Activa', tone: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  suspended: { label: 'Suspendida', tone: 'bg-red-50 text-red-800 border-red-200' },
  rejected: { label: 'Rechazada', tone: 'bg-slate-100 text-slate-700 border-slate-200' },
}

type StatusAction = Exclude<OrganizationStatus, 'pending'>

// Wording of each action, by the status it moves the organization to (and where it comes from).
function actionCopy(target: StatusAction, from: OrganizationStatus) {
  if (target === 'active') return from === 'suspended'
    ? { label: 'Reactivar', icon: Play, confirm: 'El equipo y los clientes podrán volver a entrar.' }
    : { label: 'Aprobar', icon: Check, confirm: 'El propietario podrá entrar y crear su gimnasio de inmediato.' }
  if (target === 'rejected') return { label: 'Rechazar', icon: X, confirm: 'El propietario verá el motivo al iniciar sesión y podrá enviar la solicitud de nuevo.' }
  return { label: 'Suspender', icon: Pause, confirm: 'Nadie de la organización podrá entrar, incluidos sus torniquetes, hasta que la reactives.' }
}

function formatDate(value: string | null) {
  return value ? new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' }).format(new Date(value)) : '—'
}

interface PendingAction {
  organization: PlatformOrganization
  target: StatusAction
}

interface StatusDialogProps {
  action: PendingAction
  onClose: () => void
  onDone: (organization: PlatformOrganization) => void
}

function StatusDialog({ action, onClose, onDone }: StatusDialogProps) {
  const { organization, target } = action
  const copy = actionCopy(target, organization.status)
  const needsReason = target !== 'active'
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setIsSubmitting(true)
    try {
      const response = await updateOrganizationStatus(organization.id, { status: target, ...(needsReason ? { reason: reason.trim() } : {}) })
      onDone(response.organization)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No se pudo actualizar la organización.')
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/50 px-4" role="dialog" aria-modal="true" aria-labelledby="status-dialog-title">
      <form className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl" onSubmit={handleSubmit}>
        <h2 className="text-xl font-semibold text-slate-900" id="status-dialog-title">{copy.label} {organization.name}</h2>
        <p className="mt-2 text-sm text-slate-500">{copy.confirm}</p>
        {needsReason && (
          <div className="mt-5">
            <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="status-reason">Motivo (lo verá el propietario)</label>
            <textarea
              className="w-full rounded-lg border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-100"
              id="status-reason"
              rows={3}
              maxLength={500}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              required
            />
          </div>
        )}
        {error && <p className="mt-3 text-sm text-red-600" role="alert">{error}</p>}
        <div className="mt-6 flex justify-end gap-3">
          <button className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100" type="button" onClick={onClose}>Cancelar</button>
          <button
            className={`rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${target === 'active' ? 'bg-[#0F172A] hover:bg-slate-800' : 'bg-red-600 hover:bg-red-700'}`}
            type="submit"
            disabled={isSubmitting || (needsReason && !reason.trim())}
          >
            {isSubmitting ? 'Guardando...' : copy.label}
          </button>
        </div>
      </form>
    </div>
  )
}

interface OrganizationCardProps {
  organization: PlatformOrganization
  onAction: (action: PendingAction) => void
  onChange: (organization: PlatformOrganization) => void
}

function OrganizationCard({ organization, onAction, onChange }: OrganizationCardProps) {
  const badge = STATUS_BADGE[organization.status]
  const [gyms, setGyms] = useState<NonNullable<PlatformOrganization['gyms']> | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [gymLimit, setGymLimit] = useState(String(organization.gymLimit))
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  async function toggleGyms() {
    setIsOpen((current) => !current)
    if (gyms) return
    try {
      setGyms((await getPlatformOrganization(organization.id)).organization.gyms ?? [])
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No se pudieron cargar las sucursales.')
    }
  }

  async function saveLimit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setIsSaving(true)
    try {
      onChange((await updateOrganizationGymLimit(organization.id, Number(gymLimit))).organization)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No se pudo cambiar el límite.')
    } finally {
      setIsSaving(false)
    }
  }

  const counts = [
    { label: 'Sucursales', value: `${organization.counts.gyms} / ${organization.gymLimit}` },
    { label: 'Personal', value: organization.counts.staff },
    { label: 'Clientes', value: organization.counts.clients },
    { label: 'Membresías activas', value: organization.counts.activeMemberships },
  ]

  return (
    <article className="rounded-xl border border-slate-100 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-xl font-semibold text-slate-900">{organization.name}</h2>
            <span className={`rounded-full border px-3 py-0.5 text-xs font-medium ${badge.tone}`}>{badge.label}</span>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {[organization.legalName, organization.rfc].filter(Boolean).join(' · ') || 'Sin datos fiscales'} · Solicitud del {formatDate(organization.createdAt)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {organization.allowedTransitions.map((target) => {
            const copy = actionCopy(target as StatusAction, organization.status)
            const Icon = copy.icon
            return (
              <button
                key={target}
                className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${target === 'active' ? 'bg-[#0F172A] text-white hover:bg-slate-800' : 'border border-slate-200 bg-white text-slate-700 hover:border-red-300 hover:text-red-700'}`}
                type="button"
                onClick={() => onAction({ organization, target: target as StatusAction })}
              >
                <Icon size={16} aria-hidden="true" /> {copy.label}
              </button>
            )
          })}
        </div>
      </div>

      {organization.statusReason && (
        <p className="mt-4 rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-700"><span className="font-medium">Motivo:</span> {organization.statusReason}</p>
      )}

      <div className="mt-5 grid gap-4 border-t border-slate-100 pt-5 md:grid-cols-[1fr_auto]">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">Propietario</p>
          {organization.owner ? (
            <div className="mt-2 text-sm text-slate-700">
              <p className="font-medium text-slate-900">{organization.owner.name} {organization.owner.lastName}</p>
              <p className="break-all">{organization.owner.email}</p>
              {organization.owner.phone && (
                <a className="mt-1 inline-flex items-center gap-1 font-medium text-emerald-700 hover:underline" href={`tel:${organization.owner.phone}`}>
                  <Phone size={14} aria-hidden="true" /> {organization.owner.phone}
                </a>
              )}
            </div>
          ) : <p className="mt-2 text-sm text-slate-500">Sin propietario registrado.</p>}
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
          {counts.map((item) => (
            <div key={item.label}>
              <dt className="text-xs text-slate-500">{item.label}</dt>
              <dd className="text-lg font-semibold text-slate-900">{item.value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="mt-5 flex flex-col gap-4 border-t border-slate-100 pt-5 sm:flex-row sm:items-end sm:justify-between">
        <form className="flex items-end gap-3" onSubmit={saveLimit}>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500" htmlFor={`limit-${organization.id}`}>Límite de sucursales</label>
            <input
              className="w-24 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100"
              id={`limit-${organization.id}`}
              type="number"
              min={1}
              max={100}
              value={gymLimit}
              onChange={(event) => setGymLimit(event.target.value)}
              required
            />
          </div>
          <button
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
            type="submit"
            disabled={isSaving || Number(gymLimit) === organization.gymLimit}
          >
            {isSaving ? 'Guardando...' : 'Guardar'}
          </button>
        </form>
        <button className="inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900" type="button" onClick={() => void toggleGyms()} aria-expanded={isOpen}>
          Ver sucursales <ChevronDown size={16} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>
      </div>

      {error && <p className="mt-3 text-sm text-red-600" role="alert">{error}</p>}

      {isOpen && (
        <ul className="mt-4 divide-y divide-slate-100 rounded-lg border border-slate-100">
          {gyms === null
            ? <li className="px-4 py-3 text-sm text-slate-500">Cargando...</li>
            : gyms.length === 0
              ? <li className="px-4 py-3 text-sm text-slate-500">Sin sucursales.</li>
              : gyms.map((gym) => (
                <li className="flex flex-col gap-1 px-4 py-3 text-sm sm:flex-row sm:justify-between" key={gym.id}>
                  <span className="font-medium text-slate-900">{gym.name}{!gym.isActive && <span className="ml-2 text-xs text-slate-500">(inactiva)</span>}</span>
                  <span className="text-slate-500">{gym.address || 'Sin dirección'}</span>
                </li>
              ))}
        </ul>
      )}
    </article>
  )
}

// SIRID's master panel: approves owners' requests and manages organizations. It shows counts, never people.
function Platform() {
  const [status, setStatus] = useState<OrganizationStatus | ''>('pending')
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [organizations, setOrganizations] = useState<PlatformOrganization[]>([])
  const [statusCounts, setStatusCounts] = useState<Partial<Record<OrganizationStatus, number>>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null)

  // Bumped after approving, rejecting or suspending, since the organization may leave the current tab.
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let isMounted = true
    getPlatformOrganizations({ status: status || undefined, search: query || undefined })
      .then((response) => {
        if (!isMounted) return
        setError(null)
        setOrganizations(response.organizations)
        setStatusCounts(response.statusCounts)
      })
      .catch((requestError: unknown) => {
        if (isMounted) setError(requestError instanceof Error ? requestError.message : 'No se pudieron cargar las organizaciones.')
      })
      .finally(() => { if (isMounted) setIsLoading(false) })
    return () => { isMounted = false }
  }, [status, query, reloadKey])

  // Changing the tab or the search shows the skeleton until the new list arrives.
  function changeStatus(value: OrganizationStatus | '') {
    if (value === status) return
    setIsLoading(true)
    setStatus(value)
  }

  function changeQuery(value: string) {
    if (value === query) return
    setIsLoading(true)
    setQuery(value)
  }

  function replace(organization: PlatformOrganization) {
    setOrganizations((current) => current.map((item) => item.id === organization.id ? organization : item))
  }

  const totalCount = Object.values(statusCounts).reduce((sum, count) => sum + (count ?? 0), 0)

  return (
    <section className="min-h-screen bg-[#F8FAFC] px-4 py-10 sm:px-8">
      <p className="text-sm font-medium uppercase tracking-[0.25em] text-slate-500">SIRID</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-900">Organizaciones</h1>
      <p className="mt-3 text-slate-500">Aprueba las solicitudes de nuevos gimnasios y administra su estado. Por privacidad solo ves conteos y el contacto del propietario.</p>

      <div className="mt-8 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Estado">
          {STATUS_TABS.map((tab) => {
            const count = tab.value ? statusCounts[tab.value] : totalCount
            return (
              <button
                key={tab.label}
                className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition ${status === tab.value ? 'bg-[#0F172A] text-white' : 'bg-white text-slate-600 hover:bg-slate-100'}`}
                type="button"
                role="tab"
                aria-selected={status === tab.value}
                onClick={() => changeStatus(tab.value)}
              >
                {tab.label}{count !== undefined ? ` (${count})` : ''}
              </button>
            )
          })}
        </div>
        <form className="relative w-full lg:w-72" onSubmit={(event) => { event.preventDefault(); changeQuery(search.trim()) }}>
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} aria-hidden="true" />
          <input
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100"
            type="search"
            placeholder="Nombre, razón social o RFC"
            aria-label="Buscar organización"
            value={search}
            onChange={(event) => { setSearch(event.target.value); if (!event.target.value) changeQuery('') }}
          />
        </form>
      </div>

      {error && <div className="mt-6 rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{error}</div>}

      <div className="mt-6 space-y-4">
        {isLoading
          ? Array.from({ length: 2 }).map((_, index) => <div className="h-48 animate-pulse rounded-xl bg-slate-200" key={index} />)
          : organizations.length
            ? organizations.map((organization) => (
              <OrganizationCard key={organization.id} organization={organization} onAction={setPendingAction} onChange={replace} />
            ))
            : (
              <div className="flex flex-col items-center rounded-xl border border-dashed border-slate-200 bg-white px-6 py-12 text-center">
                <Building2 className="text-slate-300" size={32} aria-hidden="true" />
                <p className="mt-3 text-sm text-slate-500">No hay organizaciones en esta vista.</p>
              </div>
            )}
      </div>

      {pendingAction && (
        <StatusDialog
          action={pendingAction}
          onClose={() => setPendingAction(null)}
          onDone={() => { setPendingAction(null); setReloadKey((key) => key + 1) }}
        />
      )}
    </section>
  )
}

export default Platform
