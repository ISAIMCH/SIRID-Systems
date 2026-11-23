import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  BadgeCheck,
  ChartColumn,
  Check,
  Clock3,
  History,
  KeyRound,
  Mail,
  Pencil,
  Search,
  UserPlus,
  UserRoundPlus,
  Users as UsersIcon,
  UserX,
} from 'lucide-react'
import { ApiError, createUser, getPlans, getUsers, regenerateActivationCode, updateUser } from '../services/api'
import { socket } from '../services/socket'
import type { UserPayload } from '../services/api'
import type { AssignableRole, GymRole, MemberRole, Plan, User, UserReference, MembershipState } from '../types'
import GymSelect from '../components/GymSelect'
import ClientHistoryPanel from '../components/ClientHistoryPanel'
import ClientProgressPanel, { type ProgressClient } from '../components/ClientProgressPanel'
import ClientEnrollmentModal, { type EnrollmentOutcome } from '../components/ClientEnrollmentModal'
import StaffInvitationsPanel, { type InvitePrefill } from '../components/StaffInvitationsPanel'
import PageHeader from '../components/ui/PageHeader'
import Panel from '../components/ui/Panel'
import Modal from '../components/ui/Modal'
import Badge from '../components/ui/Badge'
import EmptyState from '../components/ui/EmptyState'
import KpiCard from '../components/ui/KpiCard'
import Segmented from '../components/ui/Segmented'
import {
  errorAlert,
  fieldClass,
  hintClass,
  iconButton,
  labelClass,
  primaryButton,
  secondaryButton,
  tableHeadClass,
  tdClass,
  thClass,
} from '../components/ui/styles'
import { ROLE_LABELS, STAFF_ROLES } from '../utils/roles'
import { useAuth } from '../store/useAuth'
import { targetGymField } from '../utils/targetGym'
import { canAccessPage, useStaffRoles } from '../utils/access'
import { useQuickAction } from '../utils/quickAction'
import { formatMembershipDate, membershipBadge } from '../utils/membership'

type UsersResponse = User[] | { data?: unknown; users?: unknown }
type PlansResponse = Plan[] | { data?: unknown; plans?: unknown; planes?: unknown }
type UsersTab = 'clientes' | 'staff' | 'invitaciones'

const trainingDays = [
  { label: 'L', name: 'Lunes', value: 1 },
  { label: 'M', name: 'Martes', value: 2 },
  { label: 'X', name: 'Miércoles', value: 3 },
  { label: 'J', name: 'Jueves', value: 4 },
  { label: 'V', name: 'Viernes', value: 5 },
  { label: 'S', name: 'Sábado', value: 6 },
  { label: 'D', name: 'Domingo', value: 0 },
]

interface UserFormState {
  name: string
  lastName: string
  email: string
  password: string
  roles: AssignableRole[]
  phone: string
  address: string
  isActive: boolean
  goal: string
  experienceLevel: string
  availableTrainingDays: number[]
  assignedCoach: string
  planId: string
  observations: string
}

const emptyUserForm: UserFormState = {
  name: '',
  lastName: '',
  email: '',
  password: '',
  // The form creates staff; clients are registered with ClientEnrollmentModal.
  roles: [],
  phone: '',
  address: '',
  isActive: true,
  goal: '',
  experienceLevel: '',
  availableTrainingDays: [],
  assignedCoach: '',
  planId: '',
  observations: '',
}

// Same states as the API (utils/membership.js membershipState); 'expiring' ends within 7 days.
const MEMBERSHIP_FILTERS: ReadonlyArray<readonly [MembershipState | 'pendingPayment', string]> = [
  ['active', 'Activa'],
  ['expiring', 'Por vencer (7 días)'],
  ['expired', 'Vencida'],
  ['suspended', 'Suspendida'],
  ['pending', 'Sin activar'],
  ['none', 'Sin membresía'],
  ['pendingPayment', 'Con pago pendiente'],
]

// A selectable pill used for roles; mirrors the product/plan pickers in Promociones.
const chipClass = (isChecked: boolean, isDisabled = false) => `inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand/40 ${
  isChecked ? 'border-brand-text/30 bg-brand-soft font-medium text-brand-ink' : 'border-slate-200 text-slate-600 hover:border-slate-300'
} ${isDisabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`

function extractArray<T>(response: unknown, keys: string[]) {
  if (Array.isArray(response)) return response as T[]
  if (!response || typeof response !== 'object') return []
  const record = response as Record<string, unknown>
  const candidate = keys.map((key) => record[key]).find(Array.isArray)
    ?? Object.values(record).find(Array.isArray)
  return Array.isArray(candidate) ? candidate as T[] : []
}

async function fetchUsers() {
  return extractArray<User>(await getUsers<UsersResponse>(), ['data', 'users'])
}

async function fetchPlans() {
  return extractArray<Plan>(await getPlans<PlansResponse>(), ['data', 'plans', 'planes'])
}

function recordId(value: string | UserReference | undefined) {
  if (typeof value === 'string') return value
  return value?.id || value?._id || ''
}

function userDisplayName(user: User) {
  return user.name
    || [user.firstName, user.lastName].filter(Boolean).join(' ')
    || user.email
}

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toLocaleUpperCase()).join('') || '?'

// Responses from an API without `roles` only carry the legacy role.
function userRoles(user: User): MemberRole[] {
  if (user.roles?.length) return user.roles
  return user.role === 'Admin' ? ['Gerente'] : [user.role || 'Cliente']
}

function isClientUser(user: User) {
  return userRoles(user).includes('Cliente')
}

// The roles the form edits: Cliente, or the staff roles the user holds in that gym.
function assignableRoles(user: User, gymId: string): AssignableRole[] {
  if (isClientUser(user)) return ['Cliente']
  return user.gymRoles?.find((assignment) => assignment.gymId === gymId)?.roles ?? []
}

function sameRoles(first: AssignableRole[], second: AssignableRole[]) {
  return first.length === second.length && first.every((role) => second.includes(role))
}

function Users() {
  const { isAllGyms, activeGymId, session, organizationGyms } = useAuth()
  const roles = useStaffRoles()
  // The API only lists staff and allows creating or editing users to Admin; Coach and Recepcion see clients read-only
  // (Recepcion registers new clients through ClientEnrollmentModal).
  // Plans follow the Suscripciones page.
  const isAdmin = roles.has('Admin')
  // Only the owner grants Gerente or edits other managers; a Gerente handles the rest of the staff.
  const isOwner = Boolean(session?.user.isPlatformAdmin) || organizationGyms.some((gym) => gym.roles.includes('Propietario'))
  const canSeePlans = canAccessPage(roles, '/subscriptions')
  // Shared histories are for owners, managers and Coaches; reception never sees them.
  const canSeeHistory = isAdmin || roles.has('Coach')
  // Managers and Coaches follow a client's progress and edit their notes; a Coach only sees assigned clients.
  const canFollowUp = isAdmin || roles.has('Coach')
  // Reception registers clients who have no app yet and hands out their activation codes.
  const canEnroll = isAdmin || roles.has('Recepcion')
  // null: closed; 'form': new client; an outcome: the code view.
  const [enrollment, setEnrollment] = useState<'form' | EnrollmentOutcome | null>(null)
  useQuickAction('registrar', () => setEnrollment('form'), canEnroll)
  const [regeneratingId, setRegeneratingId] = useState('')
  const [historyClient, setHistoryClient] = useState<{ id: string; name: string } | null>(null)
  const [progressClient, setProgressClient] = useState<ProgressClient | null>(null)
  const [gymId, setGymId] = useState('')
  const [users, setUsers] = useState<User[]>([])
  const [plans, setPlans] = useState<Plan[]>([])
  const [coaches, setCoaches] = useState<User[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [form, setForm] = useState<UserFormState>(emptyUserForm)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [modalError, setModalError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  // '' shows every client; 'pendingPayment' those waiting with a PIN request.
  const [membershipFilter, setMembershipFilter] = useState<MembershipState | 'pendingPayment' | ''>('')
  const [activeTab, setActiveTab] = useState<UsersTab>('clientes')
  // Opens the invite form; set from the header or when "Agregar trabajador" finds the email already has an account.
  const [invitePrefill, setInvitePrefill] = useState<InvitePrefill | null>(null)
  const [existingAccount, setExistingAccount] = useState<InvitePrefill | null>(null)

  useEffect(() => {
    let isMounted = true

    async function loadFormData() {
      const [usersResult, plansResult] = await Promise.allSettled([fetchUsers(), canSeePlans ? fetchPlans() : []])
      if (!isMounted) return

      const errors: string[] = []
      if (usersResult.status === 'fulfilled') {
        setUsers(usersResult.value)
      } else {
        errors.push(usersResult.reason instanceof Error ? usersResult.reason.message : 'No se pudo cargar el directorio de usuarios.')
      }

      if (plansResult.status === 'fulfilled') {
        setPlans(plansResult.value.filter((plan) => plan.isActive !== false))
      } else {
        errors.push(plansResult.reason instanceof Error ? plansResult.reason.message : 'No se pudieron cargar los planes.')
      }
      setError(errors.length ? errors.join(' ') : null)
      setIsLoading(false)
    }

    loadFormData()
    return () => {
      isMounted = false
    }
  }, [canSeePlans])

  // Enrollments, activations, coach and membership changes made elsewhere (another session, the app) arrive live.
  useEffect(() => {
    function refreshFromEvent() {
      fetchUsers().then(setUsers).catch(() => undefined)
    }
    const events = ['directory-updated', 'payment-updated']
    events.forEach((eventName) => socket.on(eventName, refreshFromEvent))
    return () => { events.forEach((eventName) => socket.off(eventName, refreshFromEvent)) }
  }, [])

  useEffect(() => {
    if (!isAdmin) return
    // The API lists everyone who coaches in the request's gyms, whatever their other roles.
    getUsers<User[]>({ role: 'Coach' })
      .then(setCoaches)
      .catch((requestError: unknown) => console.error('Error al cargar entrenadores:', requestError))
  }, [isAdmin])

  // Staff roles are edited in the active gym, or in the gym picked in the all-gyms view.
  const roleGymId = isAllGyms ? gymId : activeGymId ?? ''
  const isClientForm = form.roles.includes('Cliente')
  const isOwnerRow = Boolean(editingUser && userRoles(editingUser).includes('Propietario'))
  const canEditRoles = !isOwnerRow && (isOwner || !(editingUser && userRoles(editingUser).includes('Gerente')))
  const rolesChanged = !editingUser || !sameRoles(form.roles, assignableRoles(editingUser, roleGymId))
  // Accounts other organizations also use keep the email and password their holder chose.
  const credentialsLocked = editingUser?.canEditCredentials === false

  function canEditUser(user: User) {
    const isManager = userRoles(user).some((role) => role === 'Propietario' || role === 'Gerente')
    return isOwner || !isManager || recordId(user.id ?? user._id) === session?.user.id
  }

  // Cliente stands alone; staff roles combine.
  function toggleRole(role: AssignableRole, checked: boolean) {
    setForm((currentForm) => {
      if (role === 'Cliente') return { ...currentForm, roles: checked ? ['Cliente'] : [] }
      const selected = currentForm.roles.filter((item) => item !== 'Cliente' && item !== role)
      const next = checked ? [...selected, role] : selected
      return { ...currentForm, roles: STAFF_ROLES.filter((staffRole) => next.includes(staffRole)) }
    })
  }

  function changeRoleGym(nextGymId: string) {
    setGymId(nextGymId)
    if (editingUser && !isClientUser(editingUser)) {
      setForm((currentForm) => ({ ...currentForm, roles: assignableRoles(editingUser, nextGymId) }))
    }
  }

  function openModal() {
    setEditingUser(null)
    setForm(emptyUserForm)
    setModalError(null)
    setExistingAccount(null)
    setIsModalOpen(true)
  }

  function closeModal() {
    if (isSubmitting) return
    setEditingUser(null)
    setForm(emptyUserForm)
    setModalError(null)
    setExistingAccount(null)
    setIsModalOpen(false)
  }

  function openInvite(prefill: InvitePrefill) {
    setActiveTab('invitaciones')
    setInvitePrefill(prefill)
  }

  function openEditModal(user: User) {
    const [fallbackFirstName = '', ...fallbackLastNameParts] = (user.name || '').trim().split(/\s+/)
    let coachId = ''
    let currentPlanId = ''
    if (user.assignedCoach) {
      coachId = typeof user.assignedCoach === 'object'
        ? String(user.assignedCoach._id || user.assignedCoach.id || '')
        : String(user.assignedCoach)
    }
    if (user.planId) {
      currentPlanId = recordId(user.planId)
    } else if (user.membership?.planId) {
      currentPlanId = recordId(user.membership.planId)
    } else if (user.membership?.planName) {
      const matchedPlan = plans.find((plan) => plan.name === user.membership?.planName)
      currentPlanId = matchedPlan?.id || matchedPlan?._id || ''
    }

    setEditingUser(user)
    setGymId('')
    setForm({
      name: user.name || user.firstName || fallbackFirstName,
      lastName: user.lastName || fallbackLastNameParts.join(' '),
      email: user.email || '',
      password: '',
      roles: assignableRoles(user, isAllGyms ? '' : activeGymId ?? ''),
      phone: user.phone || '',
      address: user.address || '',
      isActive: user.isActive ?? true,
      goal: user.goal || '',
      experienceLevel: user.experienceLevel || '',
      availableTrainingDays: user.availableTrainingDays ?? [],
      assignedCoach: coachId,
      planId: currentPlanId,
      observations: user.observations || '',
    })
    setModalError(null)
    setIsModalOpen(true)
  }

  async function handleSubmitUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setModalError(null)
    setExistingAccount(null)
    setIsSubmitting(true)

    try {
      // Roles go only when they change, so editing other fields never touches them.
      const sendRoles = canEditRoles && rolesChanged
      if (sendRoles && form.roles.length === 0) throw new Error('Selecciona al menos un rol.')
      const payload: UserPayload = {
        name: form.name.trim(),
        lastName: form.lastName,
        email: form.email.trim(),
        ...(sendRoles && { roles: form.roles }),
        ...(isClientForm && {
          phone: form.phone.trim(),
          goal: form.goal,
          experienceLevel: form.experienceLevel,
          availableTrainingDays: form.availableTrainingDays,
          assignedCoach: form.assignedCoach,
          observations: form.observations.trim(),
        }),
        // The plan of an existing client changes by registering a payment.
        ...(isClientForm && !editingUser && { planId: form.planId }),
        ...(!isClientForm && {
          phone: form.phone.trim(),
          address: form.address.trim(),
          isActive: form.isActive,
        }),
        ...(editingUser && form.password.trim() && { password: form.password }),
      }

      if (!editingUser) {
        await createUser({ ...payload, password: form.password, ...targetGymField(isAllGyms, gymId) })
      } else {
        const userId = editingUser._id || editingUser.id
        if (!userId) throw new Error('El usuario no tiene un identificador válido.')
        await updateUser(userId, { ...payload, ...(sendRoles && targetGymField(isAllGyms, gymId)) })
      }

      setUsers(await fetchUsers())
      setError(null)
      setForm(emptyUserForm)
      setEditingUser(null)
      setIsModalOpen(false)
    } catch (requestError) {
      // Someone who already uses GymGo joins the staff by invitation instead of a second account.
      const emailTaken = requestError instanceof ApiError && requestError.status === 409 && !editingUser
      if (emailTaken && !isClientForm) {
        setExistingAccount({ email: form.email.trim(), roles: form.roles.filter((role): role is GymRole => role !== 'Cliente') })
      }
      setModalError(emailTaken && isClientForm
        ? 'Ese correo ya tiene una cuenta GymGo. Usa «Registrar cliente» para vincularla a este gimnasio, o el cliente puede unirse con el código del gimnasio desde la app.'
        : requestError instanceof Error ? requestError.message : 'No se pudo guardar el usuario.')
    } finally {
      setIsSubmitting(false)
    }
  }

  function handleEnrolled(user: User) {
    const enrolledId = recordId(user.id ?? user._id)
    setUsers((current) => [user, ...current.filter((item) => recordId(item.id ?? item._id) !== enrolledId)])
  }

  async function handleNewActivationCode(user: User) {
    const userId = recordId(user.id ?? user._id)
    const name = userDisplayName(user) || 'Cliente'
    if (!window.confirm(`Se generará un código nuevo para ${name} y el anterior dejará de funcionar. ¿Continuar?`)) return
    setRegeneratingId(userId)
    try {
      const { activation } = await regenerateActivationCode(userId)
      setEnrollment({ client: { id: userId, name, email: user.email }, activation, linkedExisting: false })
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No se pudo generar el código.')
    } finally {
      setRegeneratingId('')
    }
  }

  function openProgress(user: User) {
    const coach = user.assignedCoach
    setProgressClient({
      id: recordId(user.id ?? user._id),
      name: userDisplayName(user) || 'Cliente',
      email: user.email,
      goal: user.goal,
      experienceLevel: user.experienceLevel,
      coachName: typeof coach === 'object' ? coach?.name : undefined,
      membership: user.membership,
      observations: user.observations || '',
    })
  }

  function handleObservationsSaved(clientId: string, observations: string) {
    setUsers((current) => current.map((user) => (recordId(user.id ?? user._id) === clientId ? { ...user, observations } : user)))
  }

  const matchesSearch = (user: User) =>
    `${userDisplayName(user)} ${user.email || ''}`.toLocaleLowerCase().includes(searchTerm.trim().toLocaleLowerCase())
  const matchesMembership = (user: User) => !membershipFilter
    || (membershipFilter === 'pendingPayment' ? user.hasPendingPayment === true : user.membershipState === membershipFilter)
  const allClients = users.filter(isClientUser)
  const clients = allClients.filter((user) => matchesSearch(user) && matchesMembership(user))
  const allStaff = users.filter((user) => !isClientUser(user))
  const staff = allStaff.filter(matchesSearch)
  const countClients = (predicate: (user: User) => boolean) => allClients.filter(predicate).length

  // Coach and Recepcion only see clients, so the tabs show only for managers.
  const tab: UsersTab = isAdmin ? activeTab : 'clientes'
  const showingClients = tab === 'clientes'
  const tabOptions = [
    ['clientes', `Clientes ${allClients.length}`],
    ['staff', `Staff ${allStaff.length}`],
    ['invitaciones', 'Invitaciones'],
  ] as const
  const rows = showingClients ? clients : staff
  const isFiltered = Boolean(searchTerm.trim()) || (showingClients && Boolean(membershipFilter))

  function rowActions(user: User, isStaff: boolean, isPendingActivation: boolean) {
    const userId = recordId(user.id ?? user._id)
    const name = userDisplayName(user) || (isStaff ? 'usuario' : 'cliente')
    return (
      <div className="flex justify-end gap-0.5">
        {canEnroll && isPendingActivation && userId && (
          <button
            className={`${iconButton} hover:text-brand-text`}
            type="button"
            aria-label={`Código de activación nuevo para ${name}`}
            title="Código de activación nuevo"
            onClick={() => void handleNewActivationCode(user)}
            disabled={regeneratingId === userId}
          >
            <KeyRound size={17} aria-hidden />
          </button>
        )}
        {canFollowUp && !isStaff && userId && (
          <button className={`${iconButton} hover:text-brand-text`} type="button" aria-label={`Seguimiento de ${name}`} title="Progreso y observaciones" onClick={() => openProgress(user)}>
            <ChartColumn size={17} aria-hidden />
          </button>
        )}
        {canSeeHistory && !isStaff && userId && (
          <button
            className={`${iconButton} hover:text-brand-text`}
            type="button"
            aria-label={`Historial de ${name}`}
            title="Historial compartido"
            onClick={() => setHistoryClient({ id: userId, name: userDisplayName(user) || 'Cliente' })}
          >
            <History size={17} aria-hidden />
          </button>
        )}
        {isAdmin && canEditUser(user) && (
          <button className={`${iconButton} hover:text-brand-text`} type="button" aria-label={`Editar ${name}`} title="Editar" onClick={() => openEditModal(user)}>
            <Pencil size={17} aria-hidden />
          </button>
        )}
      </div>
    )
  }

  function renderUsersTable() {
    if (rows.length === 0) {
      return (
        <EmptyState icon={showingClients ? UsersIcon : BadgeCheck} title={isFiltered ? 'Nadie coincide con la búsqueda' : showingClients ? 'Aún no hay clientes' : 'Aún no hay staff'}>
          {isFiltered
            ? 'Cambia la búsqueda o el filtro de membresía.'
            : showingClients
              ? (canEnroll ? 'Registra al primero con «Registrar cliente», o comparte el código del gimnasio para que se unan desde la app.' : 'Cuando recepción registre clientes aparecerán aquí.')
              : 'Agrega un trabajador o invita a alguien que ya use GymGo.'}
        </EmptyState>
      )
    }

    return (
      <div className="-mx-5 overflow-x-auto sm:-mx-6">
        <table className="min-w-full text-left text-sm">
          <thead className={tableHeadClass}>
            <tr>
              <th className={thClass}>{showingClients ? 'Cliente' : 'Nombre'}</th>
              {!showingClients && <th className={thClass}>Roles</th>}
              <th className={thClass}>Estado</th>
              {showingClients && <th className={thClass}>Membresía</th>}
              {showingClients && <th className={thClass}>Vence</th>}
              <th className={thClass}><span className="sr-only">Acciones</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {rows.map((user, index) => {
              const userId = user?.id || user?._id || user?.email || `user-${index}`
              const rowRoles = userRoles(user)
              const isStaff = !rowRoles.includes('Cliente')
              const isActive = user?.isActive === true
              const isPendingActivation = !isStaff && user.pendingActivation === true
              const badge = membershipBadge(user.membership)
              const name = userDisplayName(user) || 'Sin nombre'

              return (
                <tr className="transition-colors hover:bg-slate-50" key={userId}>
                  <td className={tdClass}>
                    <div className="flex min-w-[14rem] items-center gap-3">
                      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-semibold ${isStaff ? 'bg-ink text-brand' : 'bg-slate-100 text-slate-600'}`} aria-hidden>
                        {initials(name)}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-medium text-ink">{name}</p>
                        <p className="truncate text-xs text-slate-500">{user?.email || 'Sin correo'}</p>
                      </div>
                    </div>
                  </td>
                  {!showingClients && (
                    <td className={tdClass}>
                      <div className="flex flex-wrap gap-1.5">
                        {rowRoles.map((role) => <Badge tone={role === 'Propietario' || role === 'Gerente' ? 'brand' : 'neutral'} key={role}>{ROLE_LABELS[role] ?? role}</Badge>)}
                      </div>
                    </td>
                  )}
                  <td className={tdClass}>
                    <div className="flex flex-wrap gap-1.5">
                      {isPendingActivation
                        ? <span title="Registrado en recepción; aún no activa su cuenta en la app."><Badge tone="warning" icon={Clock3}>Sin activar</Badge></span>
                        : isActive ? <Badge tone="success">Activo</Badge> : <Badge>Inactivo</Badge>}
                    </div>
                  </td>
                  {showingClients && (
                    <td className={tdClass}>
                      <p className="whitespace-nowrap font-medium text-ink">{user.membership?.planName || 'Sin plan'}</p>
                      <div className="mt-1"><Badge tone={badge.tone}>{badge.label}</Badge></div>
                    </td>
                  )}
                  {showingClients && (
                    <td className={`${tdClass} whitespace-nowrap text-slate-500 tabular`}>{formatMembershipDate(user.membership?.expiresAt)}</td>
                  )}
                  <td className={`${tdClass} whitespace-nowrap`}>{rowActions(user, isStaff, isPendingActivation)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <section className="min-h-screen bg-canvas px-4 py-8 sm:px-8 sm:py-10">
      <PageHeader
        eyebrow="Operación"
        title="Usuarios"
        description={isAdmin ? 'Los clientes de tu gimnasio, su membresía y el equipo que trabaja contigo.' : 'Los clientes de tu gimnasio y el estado de su membresía.'}
        actions={canEnroll && (
          <>
            {/* Clients: «Registrar cliente». Staff: a new account, or an invitation for someone who already uses GymGo. */}
            {isAdmin && (
              <>
                <button className={secondaryButton} type="button" onClick={() => openInvite({ email: '', roles: [] })}>
                  <Mail size={17} aria-hidden /> Invitar existente
                </button>
                <button className={secondaryButton} type="button" onClick={openModal}>
                  <UserRoundPlus size={17} aria-hidden /> Agregar trabajador
                </button>
              </>
            )}
            <button className={primaryButton} type="button" onClick={() => setEnrollment('form')}>
              <UserPlus size={18} aria-hidden /> Registrar cliente
            </button>
          </>
        )}
      />

      <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <KpiCard label="Clientes" value={allClients.length} icon={UsersIcon} isLoading={isLoading} hint={isAdmin ? `${allStaff.length} en el staff` : 'En tu gimnasio'} />
        <KpiCard label="Membresía activa" value={countClients((user) => user.membershipState === 'active' || user.membershipState === 'expiring')} icon={BadgeCheck} tone="brand" isLoading={isLoading} hint="Incluye las que vencen pronto" />
        <KpiCard
          label="Por vencer (7 días)"
          value={countClients((user) => user.membershipState === 'expiring')}
          icon={Clock3}
          tone={countClients((user) => user.membershipState === 'expiring') > 0 ? 'warning' : 'default'}
          isLoading={isLoading}
          hint="Conviene recordarles"
        />
        <KpiCard label="Sin activar" value={countClients((user) => user.pendingActivation === true)} icon={UserX} isLoading={isLoading} hint="Registrados sin entrar a la app" />
      </div>

      <Panel
        className="mt-6"
        title={tab === 'invitaciones' ? 'Invitaciones al staff' : showingClients ? 'Clientes' : 'Staff'}
        icon={tab === 'invitaciones' ? Mail : showingClients ? UsersIcon : BadgeCheck}
        description={tab === 'invitaciones'
          ? 'Para quien ya tiene cuenta GymGo. Se une al staff cuando acepta.'
          : isLoading ? undefined : isFiltered ? `${rows.length} de ${showingClients ? allClients.length : allStaff.length}` : undefined}
        actions={isAdmin && (
          <div className="-mx-1 max-w-full overflow-x-auto px-1">
            <Segmented label="Grupo" value={tab} options={tabOptions} onChange={setActiveTab} />
          </div>
        )}
      >
        {error && <p className={`${errorAlert} mb-4`} role="alert">{error}</p>}

        {tab === 'invitaciones' ? (
          <StaffInvitationsPanel isOwner={isOwner} invitePrefill={invitePrefill} onCloseInvite={() => setInvitePrefill(null)} />
        ) : (
          <>
            <div className="flex flex-col gap-2 sm:flex-row">
              <label className="relative block sm:w-72">
                <span className="sr-only">Buscar usuarios</span>
                <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} aria-hidden />
                <input className={`${fieldClass} pl-10`} type="search" placeholder="Buscar por nombre o correo" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} />
              </label>
              {showingClients && (
                <select
                  className={`${fieldClass} sm:w-60`}
                  aria-label="Filtrar por membresía"
                  value={membershipFilter}
                  onChange={(event) => setMembershipFilter(event.target.value as MembershipState | 'pendingPayment' | '')}
                >
                  <option value="">Todas las membresías</option>
                  {MEMBERSHIP_FILTERS.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label} ({countClients((user) => (value === 'pendingPayment' ? user.hasPendingPayment === true : user.membershipState === value))})
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="mt-4">
              {isLoading ? (
                <div className="space-y-3" aria-label="Cargando usuarios" aria-busy="true">
                  {Array.from({ length: 5 }).map((_, index) => <div className="skeleton h-14 w-full" key={index} />)}
                </div>
              ) : renderUsersTable()}
            </div>
          </>
        )}
      </Panel>

      {enrollment && (
        <ClientEnrollmentModal
          initialOutcome={enrollment === 'form' ? null : enrollment}
          coaches={coaches}
          onEnrolled={handleEnrolled}
          onClose={() => setEnrollment(null)}
        />
      )}

      {historyClient && (
        <ClientHistoryPanel client={historyClient} canSeeLogs={isAdmin} onClose={() => setHistoryClient(null)} />
      )}

      {progressClient && (
        <ClientProgressPanel
          client={progressClient}
          onObservationsSaved={handleObservationsSaved}
          onClose={() => setProgressClient(null)}
        />
      )}

      {isModalOpen && (
        <Modal eyebrow={editingUser ? 'Usuarios' : 'Staff'} title={editingUser ? 'Editar usuario' : 'Agregar trabajador'} onClose={closeModal} size="xl">
          <form className="space-y-5" onSubmit={handleSubmitUser}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass} htmlFor="user-name">Nombre</label>
                <input
                  className={fieldClass}
                  id="user-name"
                  type="text"
                  value={form.name || ''}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                  required
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="user-last-name">Apellidos</label>
                <input
                  className={fieldClass}
                  id="user-last-name"
                  type="text"
                  value={form.lastName || ''}
                  onChange={(event) => setForm({ ...form, lastName: event.target.value })}
                  required
                />
              </div>
            </div>

            <div className={editingUser ? '' : 'grid gap-4 sm:grid-cols-2'}>
              <div>
                <label className={labelClass} htmlFor="user-email">Correo electrónico</label>
                <input
                  className={fieldClass}
                  id="user-email"
                  type="email"
                  autoComplete="email"
                  value={form.email}
                  onChange={(event) => setForm({ ...form, email: event.target.value })}
                  disabled={credentialsLocked}
                  aria-describedby={credentialsLocked ? 'user-credentials-hint' : undefined}
                  required
                />
                {credentialsLocked && (
                  <p className={hintClass} id="user-credentials-hint">
                    Esta cuenta también se usa en otro gimnasio: solo su titular puede cambiar el correo o la contraseña desde su cuenta.
                  </p>
                )}
              </div>

              {!editingUser && (
                <div>
                  <label className={labelClass} htmlFor="user-password">Contraseña</label>
                  <input
                    className={fieldClass}
                    id="user-password"
                    type="password"
                    autoComplete="new-password"
                    value={form.password}
                    onChange={(event) => setForm({ ...form, password: event.target.value })}
                    required
                  />
                </div>
              )}
            </div>

            <fieldset>
              <legend className={labelClass}>Roles</legend>
              {isOwnerRow ? (
                <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  Propietario de la organización. Su rol no se cambia desde aquí.
                </p>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2">
                    {/* New clients go through «Registrar cliente»; Cliente stays here to change an existing account. */}
                    {((editingUser ? ['Cliente', ...STAFF_ROLES] : STAFF_ROLES) as AssignableRole[]).map((role) => {
                      const isChecked = form.roles.includes(role)
                      const isDisabled = !canEditRoles || (role === 'Gerente' && !isOwner)
                      return (
                        <label className={chipClass(isChecked, isDisabled)} key={role}>
                          <input
                            className="sr-only"
                            type="checkbox"
                            checked={isChecked}
                            disabled={isDisabled}
                            onChange={(event) => toggleRole(role, event.target.checked)}
                          />
                          {isChecked && <Check size={13} aria-hidden />}
                          {ROLE_LABELS[role]}
                        </label>
                      )
                    })}
                  </div>
                  <p className={hintClass}>
                    {editingUser ? 'Cliente es un rol único. ' : ''}Gerente, Coach y Recepción se combinan y aplican a la sucursal {isAllGyms ? 'seleccionada' : 'activa'}.
                    {!isOwner && ' Solo el propietario asigna el rol Gerente.'}
                  </p>
                </>
              )}
            </fieldset>

            {!editingUser && (
              <GymSelect
                id="user-gym"
                label={isClientForm ? 'Sucursal base' : 'Sucursal donde trabaja'}
                value={gymId}
                onChange={setGymId}
              />
            )}

            {/* Editing staff in the all-gyms view needs the gym whose roles change. */}
            {editingUser && canEditRoles && (!isClientUser(editingUser) || rolesChanged) && (
              <GymSelect
                id="user-role-gym"
                label="Sucursal de los roles"
                value={gymId}
                onChange={changeRoleGym}
              />
            )}

            {isClientForm && (
              <fieldset className="space-y-4 rounded-xl border border-slate-200 p-4">
                <legend className="px-1 text-sm font-semibold text-ink">Perfil deportivo y membresía</legend>

                <div>
                  <label className={labelClass} htmlFor="user-phone">Teléfono</label>
                  <input
                    className={fieldClass}
                    id="user-phone"
                    type="tel"
                    value={form.phone}
                    onChange={(event) => setForm({ ...form, phone: event.target.value })}
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className={labelClass} htmlFor="user-goal">Objetivo deportivo</label>
                    <input
                      className={fieldClass}
                      id="user-goal"
                      type="text"
                      placeholder="Ej. Ganar masa, dormir mejor..."
                      value={form.goal}
                      onChange={(event) => setForm({ ...form, goal: event.target.value })}
                    />
                  </div>
                  <div>
                    <label className={labelClass} htmlFor="user-experience">Nivel de experiencia</label>
                    <select
                      className={fieldClass}
                      id="user-experience"
                      value={form.experienceLevel}
                      onChange={(event) => setForm({ ...form, experienceLevel: event.target.value })}
                    >
                      <option value="">Selecciona un nivel</option>
                      <option value="principiante">Principiante</option>
                      <option value="intermedio">Intermedio</option>
                      <option value="avanzado">Avanzado</option>
                    </select>
                  </div>
                </div>

                <fieldset>
                  <legend className={labelClass}>Días disponibles</legend>
                  <div className="flex flex-wrap gap-2">
                    {trainingDays.map(({ label, name, value }) => {
                      const isChecked = form.availableTrainingDays?.includes(value) ?? false
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
                            onChange={(event) => {
                              setForm((currentForm) => {
                                const selectedDays = currentForm.availableTrainingDays || []
                                return {
                                  ...currentForm,
                                  availableTrainingDays: event.target.checked
                                    ? selectedDays.includes(value) ? selectedDays : [...selectedDays, value]
                                    : selectedDays.filter((selectedDay) => selectedDay !== value),
                                }
                              })
                            }}
                          />
                          {label}
                        </label>
                      )
                    })}
                  </div>
                </fieldset>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className={labelClass} htmlFor="user-plan">Plan de membresía</label>
                    <select
                      className={fieldClass}
                      id="user-plan"
                      value={form.planId}
                      onChange={(event) => setForm({ ...form, planId: event.target.value })}
                      disabled={Boolean(editingUser)}
                      aria-describedby={editingUser ? 'user-plan-hint' : undefined}
                    >
                      <option value="">Sin plan asignado</option>
                      {plans.map((plan, index) => {
                        const planId = plan.id || plan._id
                        return (
                          <option key={planId || `plan-${index}`} value={planId || ''}>
                            {plan.name || plan.nombre || 'Plan sin nombre'}
                          </option>
                        )
                      })}
                    </select>
                    {editingUser && <p className={hintClass} id="user-plan-hint">Para cambiar el plan cobra la membresía en Caja.</p>}
                  </div>
                  <div>
                    <label className={labelClass} htmlFor="user-coach">Coach asignado</label>
                    <select
                      className={fieldClass}
                      id="user-coach"
                      value={form.assignedCoach || ''}
                      onChange={(event) => setForm({ ...form, assignedCoach: event.target.value })}
                    >
                      <option value="">Sin coach asignado</option>
                      {coaches.map((coach) => (
                        <option key={recordId(coach.id ?? coach._id)} value={recordId(coach.id ?? coach._id)}>
                          {coach.name} {coach.lastName || ''}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className={labelClass} htmlFor="user-observations">Observaciones médicas o técnicas</label>
                  <textarea
                    className={`${fieldClass} min-h-24 resize-y`}
                    id="user-observations"
                    value={form.observations}
                    onChange={(event) => setForm({ ...form, observations: event.target.value })}
                    rows={3}
                  />
                </div>
              </fieldset>
            )}

            {!isClientForm && (
              <fieldset className="space-y-4 rounded-xl border border-slate-200 p-4">
                <legend className="px-1 text-sm font-semibold text-ink">Datos del empleado</legend>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className={labelClass} htmlFor="staff-phone">Teléfono (10 dígitos)</label>
                    <input
                      className={fieldClass}
                      id="staff-phone"
                      type="tel"
                      inputMode="numeric"
                      maxLength={10}
                      value={form.phone}
                      onChange={(event) => setForm({ ...form, phone: event.target.value })}
                    />
                  </div>
                  <div>
                    <label className={labelClass} htmlFor="staff-status">Estado</label>
                    <select
                      className={fieldClass}
                      id="staff-status"
                      value={String(form.isActive)}
                      onChange={(event) => setForm({ ...form, isActive: event.target.value === 'true' })}
                    >
                      <option value="true">Activo</option>
                      <option value="false">Inactivo</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className={labelClass} htmlFor="staff-address">Dirección</label>
                  <input
                    className={fieldClass}
                    id="staff-address"
                    type="text"
                    value={form.address}
                    onChange={(event) => setForm({ ...form, address: event.target.value })}
                  />
                </div>

                {editingUser && (
                  <div>
                    <label className={labelClass} htmlFor="staff-password-reset">Nueva contraseña</label>
                    <input
                      className={fieldClass}
                      id="staff-password-reset"
                      type="password"
                      autoComplete="new-password"
                      placeholder={credentialsLocked ? 'Solo su titular puede cambiarla' : 'Déjala en blanco para conservar la actual'}
                      value={form.password}
                      onChange={(event) => setForm({ ...form, password: event.target.value })}
                      disabled={credentialsLocked}
                      aria-describedby={credentialsLocked ? 'user-credentials-hint' : undefined}
                    />
                  </div>
                )}

                <p className="text-xs text-slate-500">
                  Los documentos del empleado (CV, identificación, certificaciones…) se suben y verifican en{' '}
                  <Link className="font-medium text-brand-text hover:underline" to="/documents">Documentos › Expediente del personal</Link>.
                </p>
              </fieldset>
            )}

            {modalError && (
              <div className={errorAlert} role="alert">
                <p>{modalError}</p>
                {existingAccount && (
                  <button
                    className="mt-2 font-semibold text-red-800 underline underline-offset-2 hover:text-red-900"
                    type="button"
                    onClick={() => {
                      const prefill = existingAccount
                      closeModal()
                      openInvite(prefill)
                    }}
                  >
                    Invitar esa cuenta a tu staff
                  </button>
                )}
              </div>
            )}

            <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
              <button className={secondaryButton} type="button" onClick={closeModal} disabled={isSubmitting}>Cancelar</button>
              <button className={primaryButton} type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Guardando...' : editingUser ? 'Guardar cambios' : 'Agregar trabajador'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  )
}

export default Users
