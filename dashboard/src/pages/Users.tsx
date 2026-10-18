import { useEffect, useState } from 'react'
import { Pencil } from 'lucide-react'
import { createUser, getPlans, getUsers, updateUser } from '../services/api'
import type { UserPayload } from '../services/api'
import type { Plan, User, UserReference } from '../types'

type UsersResponse = User[] | { data?: unknown; users?: unknown }
type PlansResponse = Plan[] | { data?: unknown; plans?: unknown; planes?: unknown }

const trainingDays = [
  { label: 'L', value: 1 },
  { label: 'M', value: 2 },
  { label: 'X', value: 3 },
  { label: 'J', value: 4 },
  { label: 'V', value: 5 },
  { label: 'S', value: 6 },
  { label: 'D', value: 0 },
]

interface UserFormState {
  firstName: string
  lastName: string
  email: string
  password: string
  role: 'Admin' | 'Coach' | 'Cliente'
  phone: string
  goal: string
  experienceLevel: string
  availableTrainingDays: number[]
  assignedCoach: string
  planId: string
  observations: string
}

const emptyUserForm: UserFormState = {
  firstName: '',
  lastName: '',
  email: '',
  password: '',
  role: 'Cliente',
  phone: '',
  goal: '',
  experienceLevel: '',
  availableTrainingDays: [],
  assignedCoach: '',
  planId: '',
  observations: '',
}

function UserSkeleton() {
  return (
    <div className="space-y-4 p-6" aria-label="Cargando usuarios" aria-busy="true">
      {Array.from({ length: 5 }).map((_, index) => (
        <div className="grid grid-cols-4 gap-6" key={index}>
          <div className="h-4 animate-pulse rounded bg-slate-200" />
          <div className="h-4 animate-pulse rounded bg-slate-200" />
          <div className="h-4 animate-pulse rounded bg-slate-200" />
          <div className="h-4 animate-pulse rounded bg-slate-200" />
        </div>
      ))}
    </div>
  )
}

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

function Users() {
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

  useEffect(() => {
    let isMounted = true

    async function loadFormData() {
      const [usersResult, plansResult] = await Promise.allSettled([fetchUsers(), fetchPlans()])
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
  }, [])

  useEffect(() => {
    const loadCoaches = async () => {
      try {
        const users = await getUsers() as User[]
        const coachList = users.filter((u: any) => u.role === 'Coach' || u.role === 'coach')
        setCoaches(coachList)
      } catch (error) {
        console.error('Failed to load coaches', error)
      }
    }

    loadCoaches()
  }, [])

  function openModal() {
    setEditingUser(null)
    setForm(emptyUserForm)
    setModalError(null)
    setIsModalOpen(true)
  }

  function closeModal() {
    if (isSubmitting) return
    setEditingUser(null)
    setForm(emptyUserForm)
    setModalError(null)
    setIsModalOpen(false)
  }

  function openEditModal(user: User) {
    const [fallbackFirstName = '', ...fallbackLastNameParts] = (user.name || '').trim().split(/\s+/)
    setEditingUser(user)
    setForm({
      firstName: user.firstName || fallbackFirstName,
      lastName: user.lastName || fallbackLastNameParts.join(' '),
      email: user.email || '',
      password: '',
      role: user.role || 'Cliente',
      phone: user.phone || '',
      goal: user.goal || '',
      experienceLevel: user.experienceLevel || '',
      availableTrainingDays: user.availableTrainingDays ?? [],
      assignedCoach: recordId(user.assignedCoach),
      planId: recordId(user.planId),
      observations: user.observations || '',
    })
    setModalError(null)
    setIsModalOpen(true)
  }

  async function handleSubmitUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setModalError(null)
    setIsSubmitting(true)

    try {
      const payload: UserPayload = {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim(),
        role: form.role,
        ...(form.role === 'Cliente' && {
          phone: form.phone.trim(),
          goal: form.goal,
          experienceLevel: form.experienceLevel,
          availableTrainingDays: form.availableTrainingDays,
          assignedCoach: form.assignedCoach,
          planId: form.planId,
          observations: form.observations.trim(),
        }),
      }

      if (!editingUser) {
        await createUser({ ...payload, password: form.password })
      } else {
        const userId = editingUser._id || editingUser.id
        if (!userId) throw new Error('El usuario no tiene un identificador válido.')
        await updateUser(userId, payload)
      }

      setUsers(await fetchUsers())
      setError(null)
      setForm(emptyUserForm)
      setEditingUser(null)
      setIsModalOpen(false)
    } catch (requestError) {
      setModalError(
        requestError instanceof Error ? requestError.message : 'No se pudo guardar el usuario.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  const filteredUsers = users.filter((user) =>
    `${userDisplayName(user)} ${user.email || ''}`.toLocaleLowerCase().includes(searchTerm.trim().toLocaleLowerCase()),
  )

  return (
    <section className="min-h-screen bg-[#F8FAFC] px-8 py-10">
      <p className="text-sm font-medium uppercase tracking-[0.25em] text-slate-500">Comunidad</p>
      <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight text-slate-900">Usuarios</h1>
          <p className="mt-3 text-slate-500">Consulta y gestiona los usuarios de la plataforma.</p>
        </div>
        <button
          className="rounded-lg bg-[#9BFF63] px-4 py-2 font-medium text-[#0F172A] transition hover:bg-[#abff7c]"
          type="button"
          onClick={openModal}
        >
          + Nuevo Usuario
        </button>
      </div>

      <div className="mt-8 overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
        {error && (
          <div className="border-b border-red-100 bg-red-50 px-6 py-4 text-sm text-red-700" role="alert">
            {error}
          </div>
        )}

        <div className="border-b border-slate-100 p-4">
          <input
            className="w-full max-w-sm rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-green-500 focus:ring-2 focus:ring-green-100"
            type="search"
            placeholder="Buscar..."
            aria-label="Buscar usuarios"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
        </div>

        {isLoading ? (
          <UserSkeleton />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-100 bg-slate-50/80 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-6 py-4 font-medium">Nombre</th>
                  <th className="px-6 py-4 font-medium">Email</th>
                  <th className="px-6 py-4 font-medium">Rol</th>
                  <th className="px-6 py-4 font-medium">Estado</th>
                  <th className="px-6 py-4 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredUsers.length > 0 ? (
                  filteredUsers.map((user, index) => {
                    const userId = user?.id || user?._id || user?.email || `user-${index}`
                    const role = user?.role || 'Cliente'
                    const isStaff = role === 'Admin' || role === 'Coach'
                    const isActive = user?.isActive === true

                    return (
                      <tr className="transition-colors hover:bg-slate-50" key={userId}>
                        <td className="whitespace-nowrap px-6 py-4 font-medium text-slate-900">
                          {userDisplayName(user) || 'Sin nombre'}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-slate-500">
                          {user?.email || 'Sin correo'}
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${
                              isStaff ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {role}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${
                              isActive ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {isActive ? 'Activo' : 'Inactivo'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button
                            className="cursor-pointer text-slate-400 transition hover:text-green-600"
                            type="button"
                            aria-label={`Editar ${user?.name || 'usuario'}`}
                            title="Editar"
                            onClick={() => openEditModal(user)}
                          >
                            <Pencil className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </td>
                      </tr>
                    )
                  })
                ) : (
                  <tr>
                    <td className="px-6 py-10 text-center text-sm text-slate-500" colSpan={5}>
                      {searchTerm ? 'No hay usuarios que coincidan con la búsqueda.' : 'No hay usuarios encontrados o formato incorrecto.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.2em] text-emerald-700">Comunidad</p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-900">
                  {editingUser ? 'Editar Usuario' : 'Nuevo usuario'}
                </h2>
              </div>
              <button
                className="text-2xl leading-none text-slate-400 transition hover:text-slate-700"
                type="button"
                aria-label="Cerrar modal"
                onClick={closeModal}
              >
                ×
              </button>
            </div>

            <form className="mt-6 space-y-5" onSubmit={handleSubmitUser}>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="user-first-name">
                  Nombre
                </label>
                <input
                  className="w-full rounded-lg border border-slate-200 px-4 py-3 text-slate-900 outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-100"
                  id="user-first-name"
                  type="text"
                  value={form.firstName}
                  onChange={(event) => setForm({ ...form, firstName: event.target.value })}
                  required
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="user-last-name">
                  Apellidos
                </label>
                <input
                  className="w-full rounded-lg border border-slate-200 px-4 py-3 text-slate-900 outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-100"
                  id="user-last-name"
                  type="text"
                  value={form.lastName}
                  onChange={(event) => setForm({ ...form, lastName: event.target.value })}
                  required
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="user-email">
                  Correo Electrónico
                </label>
                <input
                  className="w-full rounded-lg border border-slate-200 px-4 py-3 text-slate-900 outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-100"
                  id="user-email"
                  type="email"
                  autoComplete="email"
                  value={form.email}
                  onChange={(event) => setForm({ ...form, email: event.target.value })}
                  required
                />
              </div>

              {!editingUser && (
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="user-password">
                    Contraseña
                  </label>
                  <input
                    className="w-full rounded-lg border border-slate-200 px-4 py-3 text-slate-900 outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-100"
                    id="user-password"
                    type="password"
                    autoComplete="new-password"
                    value={form.password}
                    onChange={(event) => setForm({ ...form, password: event.target.value })}
                    required
                  />
                </div>
              )}

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="user-role">
                  Rol
                </label>
                <select
                  className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-100"
                  id="user-role"
                  value={form.role}
                  onChange={(event) => setForm({ ...form, role: event.target.value as UserFormState['role'] })}
                >
                  <option value="Cliente">Cliente</option>
                  <option value="Admin">Admin</option>
                  <option value="Coach">Coach</option>
                </select>
              </div>

              {form.role === 'Cliente' && (
                <section className="space-y-5 rounded-xl border border-slate-200 bg-slate-50 p-5">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">Perfil Deportivo y Membresía</h3>
                    <p className="mt-1 text-sm text-slate-500">Información de entrenamiento y asignación del cliente.</p>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="user-phone">
                      Teléfono
                    </label>
                    <input
                      className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-100"
                      id="user-phone"
                      type="tel"
                      value={form.phone}
                      onChange={(event) => setForm({ ...form, phone: event.target.value })}
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="user-goal">
                        Objetivo deportivo
                      </label>
                      <input
                        className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-100"
                        id="user-goal"
                        type="text"
                        placeholder="Ej. Ganar masa, dormir mejor..."
                        value={form.goal}
                        onChange={(event) => setForm({ ...form, goal: event.target.value })}
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="user-experience">
                        Nivel de experiencia
                      </label>
                      <select
                        className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-100"
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
                    <legend className="mb-2 block text-sm font-medium text-slate-700">Días disponibles</legend>
                    <div className="flex flex-wrap gap-3">
                      {trainingDays.map(({ label, value }) => (
                        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700" key={value}>
                          <input
                            className="accent-green-600"
                            type="checkbox"
                            checked={form.availableTrainingDays?.includes(value) ?? false}
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
                      ))}
                    </div>
                  </fieldset>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="user-plan">
                        Plan de membresía
                      </label>
                      <select
                        className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-100"
                        id="user-plan"
                        value={form.planId}
                        onChange={(event) => setForm({ ...form, planId: event.target.value })}
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
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="user-coach">
                        Coach asignado
                      </label>
                      <select
                        className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-100"
                        id="user-coach"
                        value={form.assignedCoach || ''}
                        onChange={(event) => setForm({ ...form, assignedCoach: event.target.value })}
                      >
                        <option value="">Sin coach asignado</option>
                        {coaches.map((coach: any) => (
                          <option key={coach._id} value={coach._id}>
                            {coach.name} {coach.lastName || ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="user-observations">
                      Observaciones médicas o técnicas
                    </label>
                    <textarea
                      className="min-h-24 w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-100"
                      id="user-observations"
                      value={form.observations}
                      onChange={(event) => setForm({ ...form, observations: event.target.value })}
                      rows={3}
                    />
                  </div>
                </section>
              )}

              {modalError && (
                <p className="border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
                  {modalError}
                </p>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  className="rounded-lg px-4 py-2 font-medium text-slate-600 transition hover:bg-slate-100 disabled:opacity-50"
                  type="button"
                  onClick={closeModal}
                  disabled={isSubmitting}
                >
                  Cancelar
                </button>
                <button
                  className="rounded-lg bg-[#9BFF63] px-4 py-2 font-medium text-[#0F172A] transition hover:bg-[#abff7c] disabled:cursor-not-allowed disabled:opacity-60"
                  type="submit"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Guardando...' : editingUser ? 'Actualizar' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  )
}

export default Users