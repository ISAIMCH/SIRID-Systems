import { useEffect, useState, type FormEvent } from 'react'
import { Building2, Check, ChevronDown, Gem, Hourglass, Layers, MapPin, Pause, Phone, Play, Search, ShieldOff, X } from 'lucide-react'
import {
  getPlatformOrganization,
  getPlatformOrganizations,
  getSaasPlans,
  updateOrganizationGymLimit,
  updateOrganizationStatus,
  type OrganizationStatus,
  type PlatformOrganization,
  type SaasPlan,
} from '../services/api'
import OrganizationPlanDialog from '../components/OrganizationPlanDialog'
import { METHOD_LABELS, STATUS_LABELS } from '../utils/planFeatures'
import PageHeader from '../components/ui/PageHeader'
import Panel from '../components/ui/Panel'
import Modal from '../components/ui/Modal'
import Badge, { type BadgeTone } from '../components/ui/Badge'
import EmptyState from '../components/ui/EmptyState'
import KpiCard from '../components/ui/KpiCard'
import Segmented from '../components/ui/Segmented'
import { dangerButton, errorAlert, fieldClass, labelClass, primaryButton, secondaryButton } from '../components/ui/styles'

const STATUS_TABS = [
  ['pending', 'Pendientes'],
  ['active', 'Activas'],
  ['suspended', 'Suspendidas'],
  ['rejected', 'Rechazadas'],
  ['', 'Todas'],
] as const satisfies ReadonlyArray<readonly [OrganizationStatus | '', string]>

const STATUS_BADGE: Record<OrganizationStatus, { label: string; tone: BadgeTone }> = {
  pending: { label: 'En revisión', tone: 'warning' },
  active: { label: 'Activa', tone: 'success' },
  suspended: { label: 'Suspendida', tone: 'danger' },
  rejected: { label: 'Rechazada', tone: 'neutral' },
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

// One line about the organization's GymGo plan: which one, until when, and whether it lapsed.
function PlanSummary({ subscription, plans }: { subscription: PlatformOrganization['subscription']; plans: SaasPlan[] }) {
  if (!subscription.planCode) {
    return <p className="text-sm text-slate-500">Sin plan: creada antes de la facturación, tiene todos los módulos y no vence.</p>
  }
  const planName = plans.find((plan) => plan.code === subscription.planCode)?.name ?? subscription.planCode
  const date = subscription.status === 'trialing'
    ? `Prueba hasta el ${formatDate(subscription.trialEndsAt)}`
    : subscription.status === 'manual'
      ? 'Sin vencimiento'
      : subscription.currentPeriodEnd
        ? `${subscription.renews ? 'Se renueva el' : 'Pagado hasta el'} ${formatDate(subscription.currentPeriodEnd)}`
        : ''
  const tone: BadgeTone = subscription.phase !== 'ok' ? 'danger' : subscription.status === 'trialing' ? 'warning' : 'brand'
  const details = [date, subscription.method ? METHOD_LABELS[subscription.method] : ''].filter(Boolean).join(' · ')
  const lapse = subscription.phase === 'grace'
    ? `En gracia hasta el ${formatDate(subscription.graceEndsAt)}`
    : subscription.phase === 'expired' ? 'Pausada para su equipo' : ''
  return (
    <div className="space-y-1.5">
      <Badge tone={tone} icon={Gem}>{planName} · {subscription.phase === 'ok' ? STATUS_LABELS[subscription.status] : 'Vencido'}</Badge>
      {details && <p className="text-sm text-slate-600">{details}</p>}
      {lapse && <p className="text-sm font-medium text-red-700">{lapse}</p>}
    </div>
  )
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
    <Modal eyebrow="Organizaciones" title={`${copy.label} ${organization.name}`} onClose={() => { if (!isSubmitting) onClose() }} size="md">
      <form className="space-y-5" onSubmit={handleSubmit}>
        <p className="-mt-1 text-sm text-slate-500">{copy.confirm}</p>
        {needsReason && (
          <div>
            <label className={labelClass} htmlFor="status-reason">Motivo <span className="font-normal text-slate-400">(lo verá el propietario)</span></label>
            <textarea
              className={`${fieldClass} min-h-24 resize-y`}
              id="status-reason"
              rows={3}
              maxLength={500}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              required
            />
          </div>
        )}
        {error && <p className={errorAlert} role="alert">{error}</p>}
        <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
          <button className={secondaryButton} type="button" onClick={onClose} disabled={isSubmitting}>Cancelar</button>
          <button
            className={target === 'active' ? primaryButton : dangerButton}
            type="submit"
            disabled={isSubmitting || (needsReason && !reason.trim())}
          >
            {isSubmitting ? 'Guardando...' : copy.label}
          </button>
        </div>
      </form>
    </Modal>
  )
}

interface OrganizationCardProps {
  organization: PlatformOrganization
  plans: SaasPlan[]
  onAction: (action: PendingAction) => void
  onChange: (organization: PlatformOrganization) => void
  onEditPlan: (organization: PlatformOrganization) => void
}

const sectionLabel = 'text-xs font-semibold uppercase tracking-[0.2em] text-slate-500'

function OrganizationCard({ organization, plans, onAction, onChange, onEditPlan }: OrganizationCardProps) {
  // A card that renews by itself is cancelled in Stripe before SIRID changes the plan (the API refuses it).
  const renewsWithCard = organization.subscription.method === 'card' && organization.subscription.renews && organization.subscription.status === 'active'
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
    <article className="overflow-hidden rounded-card border border-slate-200/80 bg-white shadow-card">
      <header className="flex flex-col gap-4 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-6">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-ink text-brand" aria-hidden>
            <Building2 size={20} />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate font-display text-2xl font-bold tracking-tight text-ink">{organization.name}</h2>
              <Badge tone={badge.tone}>{badge.label}</Badge>
            </div>
            <p className="mt-0.5 text-sm text-slate-500">
              {[organization.legalName, organization.rfc].filter(Boolean).join(' · ') || 'Sin datos fiscales'} · Solicitud del {formatDate(organization.createdAt)}
            </p>
          </div>
        </div>
        {organization.allowedTransitions.length > 0 && (
          <div className="flex shrink-0 flex-wrap gap-2">
            {organization.allowedTransitions.map((target) => {
              const copy = actionCopy(target as StatusAction, organization.status)
              const Icon = copy.icon
              return (
                <button
                  key={target}
                  className={target === 'active' ? primaryButton : `${secondaryButton} hover:border-red-200 hover:bg-red-50 hover:text-red-700`}
                  type="button"
                  onClick={() => onAction({ organization, target: target as StatusAction })}
                >
                  <Icon size={16} aria-hidden /> {copy.label}
                </button>
              )
            })}
          </div>
        )}
      </header>

      <div className="space-y-5 p-5 sm:p-6">
        {organization.statusReason && (
          <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700"><span className="font-semibold">Motivo:</span> {organization.statusReason}</p>
        )}

        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {counts.map((item) => (
            <div className="rounded-xl bg-slate-50 px-4 py-3" key={item.label}>
              <dt className="text-xs text-slate-500">{item.label}</dt>
              <dd className="mt-1 font-display text-2xl font-bold leading-none text-ink tabular">{item.value}</dd>
            </div>
          ))}
        </dl>

        <div className="grid gap-5 md:grid-cols-2">
          <div className="min-w-0">
            <p className={sectionLabel}>Plan GymGo</p>
            <div className="mt-2"><PlanSummary subscription={organization.subscription} plans={plans} /></div>
            <button
              className={`${secondaryButton} mt-3`}
              type="button"
              onClick={() => onEditPlan(organization)}
              disabled={renewsWithCard || plans.length === 0}
              title={renewsWithCard ? 'Paga con tarjeta y se renueva sola: cancélala en Stripe antes de cambiar el plan.' : undefined}
            >
              <Gem size={16} aria-hidden /> Cambiar plan
            </button>
          </div>
          <div className="min-w-0">
            <p className={sectionLabel}>Propietario</p>
            {organization.owner ? (
              <div className="mt-2 text-sm text-slate-600">
                <p className="font-semibold text-ink">{organization.owner.name} {organization.owner.lastName}</p>
                <p className="break-all">{organization.owner.email}</p>
                {organization.owner.phone && (
                  <a className="mt-1 inline-flex items-center gap-1.5 font-medium text-brand-text hover:underline" href={`tel:${organization.owner.phone}`}>
                    <Phone size={14} aria-hidden /> {organization.owner.phone}
                  </a>
                )}
              </div>
            ) : <p className="mt-2 text-sm text-slate-500">Sin propietario registrado.</p>}
          </div>
        </div>
      </div>

      <footer className="flex flex-col gap-4 border-t border-slate-100 bg-slate-50/60 px-5 py-4 sm:flex-row sm:items-end sm:justify-between sm:px-6">
        <form className="flex items-end gap-2" onSubmit={saveLimit}>
          <div>
            <label className={labelClass} htmlFor={`limit-${organization.id}`}>Límite de sucursales</label>
            <input
              className={`${fieldClass.replace('w-full ', '')} w-24`}
              id={`limit-${organization.id}`}
              type="number"
              min={1}
              max={100}
              value={gymLimit}
              onChange={(event) => setGymLimit(event.target.value)}
              required
            />
          </div>
          <button className={secondaryButton} type="submit" disabled={isSaving || Number(gymLimit) === organization.gymLimit}>
            {isSaving ? 'Guardando...' : 'Guardar'}
          </button>
        </form>
        <button
          className="inline-flex items-center gap-1.5 self-start rounded-lg px-2 py-1.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-ink sm:self-auto"
          type="button"
          onClick={() => void toggleGyms()}
          aria-expanded={isOpen}
        >
          Ver sucursales <ChevronDown size={16} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} aria-hidden />
        </button>
      </footer>

      {(error || isOpen) && (
        <div className="space-y-3 border-t border-slate-100 px-5 py-4 sm:px-6">
          {error && <p className={errorAlert} role="alert">{error}</p>}
          {isOpen && (
            gyms === null
              ? <div className="skeleton h-12 w-full" aria-label="Cargando sucursales" aria-busy="true" />
              : gyms.length === 0
                ? <p className="text-sm text-slate-500">Sin sucursales.</p>
                : (
                  <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                    {gyms.map((gym) => (
                      <li className="flex flex-col gap-1 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between" key={gym.id}>
                        <span className="flex items-center gap-2 font-medium text-ink">
                          {gym.name}
                          {!gym.isActive && <Badge>Inactiva</Badge>}
                        </span>
                        <span className="inline-flex items-center gap-1.5 text-slate-500"><MapPin size={14} aria-hidden /> {gym.address || 'Sin dirección'}</span>
                      </li>
                    ))}
                  </ul>
                )
          )}
        </div>
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
  const [hasLoaded, setHasLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null)
  const [plans, setPlans] = useState<SaasPlan[]>([])
  const [planTarget, setPlanTarget] = useState<PlatformOrganization | null>(null)

  useEffect(() => {
    getSaasPlans().then((response) => setPlans(response.plans)).catch(() => {})
  }, [])

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
      .finally(() => {
        if (!isMounted) return
        setIsLoading(false)
        setHasLoaded(true)
      })
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
  const countOf = (value: OrganizationStatus) => statusCounts[value] ?? 0
  const tabOptions = STATUS_TABS.map(([value, label]) => {
    const count = value ? statusCounts[value] : totalCount
    return [value, count !== undefined && hasLoaded ? `${label} ${count}` : label] as const
  })
  const tabLabel = STATUS_TABS.find(([value]) => value === status)?.[1] ?? 'Todas'

  return (
    <section className="min-h-screen bg-canvas px-4 py-8 sm:px-8 sm:py-10">
      <PageHeader
        eyebrow="SIRID"
        title="Organizaciones"
        description="Aprueba las solicitudes de nuevos gimnasios y administra su estado. Por privacidad solo ves conteos y el contacto del propietario."
      />

      <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <KpiCard label="Por revisar" value={countOf('pending')} icon={Hourglass} tone={countOf('pending') > 0 ? 'warning' : 'default'} isLoading={!hasLoaded} hint={countOf('pending') > 0 ? 'Esperan tu aprobación' : 'Nada pendiente'} />
        <KpiCard label="Activas" value={countOf('active')} icon={Building2} tone="brand" isLoading={!hasLoaded} hint="Operando con GymGo" />
        <KpiCard label="Suspendidas" value={countOf('suspended')} icon={ShieldOff} isLoading={!hasLoaded} hint="Sin acceso hasta reactivarlas" />
        <KpiCard label="Total" value={totalCount} icon={Layers} isLoading={!hasLoaded} hint={`${countOf('rejected')} rechazada${countOf('rejected') === 1 ? '' : 's'}`} />
      </div>

      <Panel className="mt-6" title={tabLabel === 'Todas' ? 'Todas las organizaciones' : tabLabel} icon={Building2}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="-mx-1 overflow-x-auto px-1 pb-1">
            <Segmented label="Estado" value={status} options={tabOptions} onChange={changeStatus} />
          </div>
          <form className="relative w-full lg:w-72" onSubmit={(event) => { event.preventDefault(); changeQuery(search.trim()) }}>
            <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} aria-hidden />
            <input
              className={`${fieldClass} pl-10`}
              type="search"
              placeholder="Nombre, razón social o RFC"
              aria-label="Buscar organización"
              value={search}
              onChange={(event) => { setSearch(event.target.value); if (!event.target.value) changeQuery('') }}
            />
          </form>
        </div>

        {error && <p className={`${errorAlert} mt-4`} role="alert">{error}</p>}

        <div className="mt-4 space-y-4">
          {isLoading
            ? Array.from({ length: 2 }).map((_, index) => <div className="skeleton h-64 w-full rounded-card" key={index} />)
            : organizations.length
              ? organizations.map((organization) => (
                <OrganizationCard key={organization.id} organization={organization} plans={plans} onAction={setPendingAction} onChange={replace} onEditPlan={setPlanTarget} />
              ))
              : (
                <EmptyState icon={Building2} title={query ? 'Ninguna organización coincide' : 'No hay organizaciones en esta vista'}>
                  {query ? 'Revisa el nombre, la razón social o el RFC.' : status === 'pending' ? 'Cuando un gimnasio se registre aparecerá aquí para que lo apruebes.' : 'Cambia el filtro para ver otras organizaciones.'}
                </EmptyState>
              )}
        </div>
      </Panel>

      {pendingAction && (
        <StatusDialog
          action={pendingAction}
          onClose={() => setPendingAction(null)}
          onDone={() => { setPendingAction(null); setReloadKey((key) => key + 1) }}
        />
      )}

      {planTarget && (
        <OrganizationPlanDialog
          organization={planTarget}
          plans={plans}
          onClose={() => setPlanTarget(null)}
          onDone={(organization) => { setPlanTarget(null); replace(organization) }}
        />
      )}
    </section>
  )
}

export default Platform
