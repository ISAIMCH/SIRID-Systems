import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { getMaintenanceReports, updateMaintenanceReport } from '../services/api'
import type { MaintenanceReport, MaintenanceStatus } from '../services/api'
import { useAuth } from '../store/useAuth'

type Filter = MaintenanceStatus | 'all'

const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: 'pending', label: 'Pendientes' },
  { value: 'in_progress', label: 'En proceso' },
  { value: 'resolved', label: 'Resueltos' },
  { value: 'all', label: 'Todos' },
]

const STATUS_LABELS: Record<MaintenanceStatus, string> = { pending: 'Pendiente', in_progress: 'En proceso', resolved: 'Resuelto' }
const STATUS_CLASSES: Record<MaintenanceStatus, string> = {
  pending: 'bg-amber-100 text-amber-800',
  in_progress: 'bg-sky-100 text-sky-800',
  resolved: 'bg-green-100 text-green-800',
}

function formatDate(value?: string) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('es-MX', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
}

interface AttendFormState {
  status: 'in_progress' | 'resolved'
  outOfService: boolean
  adminNote: string
}

// Reports clients send from the app; managers follow them up and take units out of service while they are repaired.
function Maintenance() {
  const { isAllGyms, organizationGyms } = useAuth()
  const [reports, setReports] = useState<MaintenanceReport[]>([])
  const [filter, setFilter] = useState<Filter>('pending')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [attending, setAttending] = useState<MaintenanceReport | null>(null)
  const [form, setForm] = useState<AttendFormState>({ status: 'in_progress', outOfService: false, adminNote: '' })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [modalError, setModalError] = useState<string | null>(null)

  async function loadReports() {
    setIsLoading(true)
    try {
      setReports((await getMaintenanceReports()).reports)
      setError(null)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No se pudieron cargar los reportes.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    let isMounted = true
    getMaintenanceReports()
      .then(({ reports: loaded }) => { if (isMounted) { setReports(loaded); setError(null) } })
      .catch((requestError: unknown) => {
        if (isMounted) setError(requestError instanceof Error ? requestError.message : 'No se pudieron cargar los reportes.')
      })
      .finally(() => { if (isMounted) setIsLoading(false) })
    return () => { isMounted = false }
  }, [])

  function openAttend(report: MaintenanceReport) {
    setAttending(report)
    setForm({ status: 'in_progress', outOfService: Boolean(report.equipmentOutOfService), adminNote: report.adminNote ?? '' })
    setModalError(null)
  }

  function closeAttend() {
    if (isSubmitting) return
    setAttending(null)
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!attending) return
    setModalError(null)
    setIsSubmitting(true)
    try {
      const { report } = await updateMaintenanceReport(attending._id, {
        status: form.status,
        ...(form.status === 'in_progress' && { equipmentStatus: form.outOfService ? 'out_of_service' : 'available' }),
        ...(form.adminNote.trim() && { adminNote: form.adminNote.trim() }),
      })
      setReports((current) => current.map((item) => item._id === report._id ? report : item))
      setAttending(null)
    } catch (requestError) {
      setModalError(requestError instanceof Error ? requestError.message : 'No se pudo actualizar el reporte.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const gymNames = new Map(organizationGyms.map((gym) => [gym.id, gym.name]))
  const visibleReports = filter === 'all' ? reports : reports.filter((report) => report.status === filter)
  const countFor = (value: Filter) => value === 'all' ? reports.length : reports.filter((report) => report.status === value).length

  return (
    <section className="min-h-screen bg-[#F8FAFC] px-4 py-10 sm:px-8">
      <p className="text-sm font-medium uppercase tracking-[0.25em] text-slate-500">Operación</p>
      <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight text-slate-900">Mantenimiento</h1>
          <p className="mt-3 text-slate-500">Reportes de equipo dañado que envían los clientes desde la app.</p>
        </div>
        <button
          className="inline-flex items-center gap-2 self-start rounded-lg border border-slate-200 bg-white px-4 py-2 font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 sm:self-auto"
          type="button"
          onClick={() => void loadReports()}
          disabled={isLoading}
        >
          <RefreshCw size={16} aria-hidden="true" /> Actualizar
        </button>
      </div>

      <div className="mt-8 overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
        {error && <div className="border-b border-red-100 bg-red-50 px-6 py-4 text-sm text-red-700" role="alert">{error}</div>}

        <div className="flex overflow-x-auto border-b border-gray-200 px-6 pt-4">
          {FILTERS.map(({ value, label }) => (
            <button
              className={`whitespace-nowrap px-4 py-2 ${filter === value ? 'border-b-2 border-green-500 font-semibold text-green-700' : 'text-gray-500'}`}
              type="button"
              key={value}
              onClick={() => setFilter(value)}
            >
              {label} {countFor(value)}
            </button>
          ))}
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-100 bg-slate-50/80 text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-6 py-4 font-medium">Equipo</th>
                <th className="px-6 py-4 font-medium">Reporte</th>
                <th className="px-6 py-4 font-medium">Reportó</th>
                <th className="px-6 py-4 font-medium">Fecha</th>
                <th className="px-6 py-4 font-medium">Estado</th>
                <th className="px-6 py-4 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {isLoading ? (
                <tr><td className="px-6 py-10 text-center text-sm text-slate-500" colSpan={6}>Cargando reportes...</td></tr>
              ) : visibleReports.length ? visibleReports.map((report) => (
                <tr className="align-top transition-colors hover:bg-slate-50" key={report._id}>
                  <td className="px-6 py-4">
                    <p className="font-medium text-slate-900">{report.equipment?.name ?? 'Equipo eliminado'}</p>
                    <p className="text-xs text-slate-500">
                      {[report.equipment?.zone, isAllGyms && report.gymId ? gymNames.get(report.gymId) : null].filter(Boolean).join(' · ')}
                    </p>
                  </td>
                  <td className="min-w-64 max-w-md px-6 py-4">
                    <p className="whitespace-pre-line">{report.description}</p>
                    {report.adminNote && <p className="mt-2 text-xs text-slate-500">Nota: {report.adminNote}</p>}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-slate-500">{report.reportedBy?.name ?? 'Cliente'}</td>
                  <td className="whitespace-nowrap px-6 py-4 text-slate-500">
                    {formatDate(report.createdAt)}
                    {report.resolvedAt && <p className="text-xs">Resuelto {formatDate(report.resolvedAt)}</p>}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-1.5">
                      <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${STATUS_CLASSES[report.status]}`}>
                        {STATUS_LABELS[report.status]}
                      </span>
                      {report.equipmentOutOfService && report.status !== 'resolved' && (
                        <span className="inline-flex rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-700">1 unidad fuera de servicio</span>
                      )}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-right">
                    {report.status !== 'resolved' && (
                      <button
                        className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:border-green-400 hover:text-green-700"
                        type="button"
                        onClick={() => openAttend(report)}
                      >
                        Atender
                      </button>
                    )}
                  </td>
                </tr>
              )) : (
                <tr><td className="px-6 py-10 text-center text-sm text-slate-500" colSpan={6}>No hay reportes en esta vista.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {attending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.2em] text-emerald-700">Mantenimiento</p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-900">{attending.equipment?.name ?? 'Reporte'}</h2>
              </div>
              <button className="text-2xl leading-none text-slate-400 transition hover:text-slate-700" type="button" aria-label="Cerrar" onClick={closeAttend}>×</button>
            </div>

            <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
              <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">{attending.description}</p>

              <fieldset>
                <legend className="mb-2 block text-sm font-medium text-slate-700">Estado</legend>
                <div className="flex flex-wrap gap-3">
                  {(['in_progress', 'resolved'] as const).map((status) => (
                    <label
                      className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${
                        form.status === status ? 'border-green-500 bg-green-50 text-green-800' : 'border-slate-200 bg-white text-slate-700'
                      }`}
                      key={status}
                    >
                      <input type="radio" name="report-status" checked={form.status === status} onChange={() => setForm({ ...form, status })} />
                      {STATUS_LABELS[status]}
                    </label>
                  ))}
                </div>
              </fieldset>

              {form.status === 'in_progress' ? (
                <label className="flex items-start gap-3 text-sm text-slate-700">
                  <input className="mt-1" type="checkbox" checked={form.outOfService} onChange={(event) => setForm({ ...form, outOfService: event.target.checked })} />
                  <span>
                    Sacar una unidad de servicio mientras se repara
                    <span className="block text-xs text-slate-500">Se descuenta de las unidades disponibles del equipo.</span>
                  </span>
                </label>
              ) : (
                <p className="text-sm text-slate-500">
                  {attending.equipmentOutOfService ? 'Al resolver, la unidad vuelve a estar disponible.' : 'El reporte se cierra y ya no se puede editar.'}
                </p>
              )}

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="report-note">Nota interna</label>
                <textarea
                  className="w-full rounded-lg border border-slate-200 px-4 py-3 text-slate-900 outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-100"
                  id="report-note"
                  rows={3}
                  maxLength={1000}
                  value={form.adminNote}
                  onChange={(event) => setForm({ ...form, adminNote: event.target.value })}
                  placeholder="Ej. Se pidió la refacción al proveedor."
                />
              </div>

              {modalError && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{modalError}</p>}

              <div className="flex justify-end gap-3">
                <button className="rounded-lg border border-slate-200 bg-white px-4 py-2 font-medium text-slate-700 transition hover:bg-slate-50" type="button" onClick={closeAttend} disabled={isSubmitting}>
                  Cancelar
                </button>
                <button className="rounded-lg bg-[#9BFF63] px-4 py-2 font-medium text-[#0F172A] transition hover:bg-[#abff7c] disabled:opacity-50" type="submit" disabled={isSubmitting}>
                  {isSubmitting ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  )
}

export default Maintenance
