import { useEffect, useState } from 'react'
import { Pencil } from 'lucide-react'
import { createUser, getUsers, updateUser } from '../services/api'
import type { User } from '../types'

type UsersResponse = User[] | { data?: unknown; users?: unknown }

interface UserFormState {
  firstName: string
  lastName: string
  email: string
  password: string
  role: 'Admin' | 'Coach' | 'Cliente'
}

const emptyUserForm: UserFormState = {
  firstName: '',
  lastName: '',
  email: '',
  password: '',
  role: 'Cliente',
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

async function fetchUsers() {
  const response = await getUsers<UsersResponse>()
  const usersCandidate = Array.isArray(response)
    ? response
    : response?.data || response?.users || []

  return Array.isArray(usersCandidate) ? usersCandidate as User[] : []
}

function Users() {
  const [users, setUsers] = useState<User[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [form, setForm] = useState<UserFormState>(emptyUserForm)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [modalError, setModalError] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true

    async function loadUsers() {
      try {
        const usersArray = await fetchUsers()

        if (isMounted) {
          setUsers(usersArray)
          setError(null)
        }
      } catch (requestError) {
        if (isMounted) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : 'No se pudo cargar el directorio de usuarios.',
          )
        }
      } finally {
        if (isMounted) setIsLoading(false)
      }
    }

    loadUsers()
    return () => {
      isMounted = false
    }
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
    const [firstName = '', ...lastNameParts] = (user.name || '').trim().split(/\s+/)
    setEditingUser(user)
    setForm({
      firstName,
      lastName: lastNameParts.join(' '),
      email: user.email || '',
      password: '',
      role: user.role || 'Cliente',
    })
    setModalError(null)
    setIsModalOpen(true)
  }

  async function handleSubmitUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setModalError(null)
    setIsSubmitting(true)

    try {
      const fullName = `${form.firstName}${form.lastName}`.trim()
      const payload: Record<string, string> = {
        name: fullName,
        email: form.email.trim(),
        role: form.role,
      }

      if (!editingUser) {
        payload.password = form.password
        await createUser(payload)
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
                {users && users.length > 0 ? (
                  users.map((user, index) => {
                    const userId = user?.id || user?._id || user?.email || `user-${index}`
                    const role = user?.role || 'Cliente'
                    const isStaff = role === 'Admin' || role === 'Coach'
                    const isActive = user?.isActive === true

                    return (
                      <tr className="transition-colors hover:bg-slate-50" key={userId}>
                        <td className="whitespace-nowrap px-6 py-4 font-medium text-slate-900">
                          {user?.name || 'Sin nombre'}
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
                      No hay usuarios encontrados o formato incorrecto.
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
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
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