import { useState } from 'react'
import { ClipboardCheck, MessageSquareWarning, RefreshCw } from 'lucide-react'
import { updateMaintenanceReport } from '../../services/api'
import type { MaintenanceReport, MaintenanceStatus } from '../../services/api'
import { useAuth } from '../../store/useAuth'
import Panel from '../ui/Panel'
import Modal from '../ui/Modal'
import Badge, { type BadgeTone } from '../ui/Badge'
import EmptyState from '../ui/EmptyState'
import Segmented from '../ui/Segmented'
import { errorAlert, fieldClass, labelClass, primaryButton, secondaryButton } from '../ui/styles'

type Filter = MaintenanceStatus | 'all'

const STATUS_LABELS: Record<MaintenanceStatus, string> = { pending: 'Pendiente', in_progress: 'En proceso', resolved: 'Resuelto' }
const STATUS_TONES: Record<MaintenanceStatus, BadgeTone> = { pending: 'warning', in_progress: 'info', resolved: 'success' }

function formatDate(value?: string) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('es-MX', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
}

interface AttendFormState {
  status: 'in_progress' | 'resolved'
  outOfService: boolean
  adminNote: string
}

interface MaintenanceReportsProps {
  reports: MaintenanceReport[]
  isLoading: boolean
  error: string | null
  // Managers follow reports up; coaches only read them, to plan routines around equipment that is failing.
  canAttend: boolean
  onRefresh: () => void
  onReportUpdated: (report: MaintenanceReport) => void
}

// Reports clients send from the app; managers take units out of service while they are repaired.
function MaintenanceReports({ reports, isLoading, error, canAttend, onRefresh, onReportUpdated }: MaintenanceReportsProps) {
  const { isAllGyms, organizationGyms } = useAuth()
  const [filter, setFilter] = useState<Filter>('pending')
  const [attending, setAttending] = useState<MaintenanceReport | null>(null)
  const [form, setForm] = useState<AttendFormState>({ status: 'in_progress', outOfService: false, adminNote: '' })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [modalError, setModalError] = useState<string | null>(null)

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
      onReportUpdated(report)
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
  const filterOptions = ([
    ['pending', 'Pendientes'],
    ['in_progress', 'En proceso'],
    ['resolved', 'Resueltos'],
    ['all', 'Todos'],
  ] as const).map(([value, label]) => [value, `${label} ${countFor(value)}`] as const)

  return (
    <Panel
      title="Reportes de mantenimiento"
      icon={MessageSquareWarning}
      description={canAttend ? 'Fallas que los clientes reportan desde la app.' : 'Equipos con fallas reportadas; tenlos en cuenta al planear rutinas.'}
      actions={(
        <button className={secondaryButton} type="button" onClick={onRefresh} disabled={isLoading}>
          <RefreshCw size={16} aria-hidden /> Actualizar
        </button>
      )}
    >
      {error && <p className={`${errorAlert} mb-4`} role="alert">{error}</p>}

      <div className="-mx-1 overflow-x-auto px-1 pb-1">
        <Segmented label="Estado del reporte" value={filter} options={filterOptions} onChange={setFilter} />
      </div>

      <div className="mt-4">
        {isLoading ? (
          <div className="space-y-3" aria-busy="true" aria-label="Cargando reportes">
            {Array.from({ length: 3 }).map((_, index) => <div className="skeleton h-20 w-full" key={index} />)}
          </div>
        ) : visibleReports.length === 0 ? (
          <EmptyState icon={ClipboardCheck} title={filter === 'pending' ? 'Nada pendiente' : 'Sin reportes en esta vista'}>
            {filter === 'pending' ? 'Cuando un cliente reporte una falla desde la app aparecerá aquí al momento.' : 'Cambia el filtro para ver otros reportes.'}
          </EmptyState>
        ) : (
          <ul className="space-y-3">
            {visibleReports.map((report) => (
              <li className="rounded-xl border border-slate-200 p-4 transition-colors hover:border-slate-300" key={report._id}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-ink">{report.equipment?.name ?? 'Equipo eliminado'}</p>
                      <Badge tone={STATUS_TONES[report.status]}>{STATUS_LABELS[report.status]}</Badge>
                      {report.equipmentOutOfService && report.status !== 'resolved' && <Badge tone="danger">1 unidad fuera de servicio</Badge>}
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {[report.equipment?.zone, isAllGyms && report.gymId ? gymNames.get(report.gymId) : null, `Reportó ${report.reportedBy?.name ?? 'un cliente'}`, formatDate(report.createdAt)].filter(Boolean).join(' · ')}
                    </p>
                    <p className="mt-2 whitespace-pre-line text-sm text-slate-700">{report.description}</p>
                    {report.adminNote && <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600"><span className="font-semibold">Nota interna:</span> {report.adminNote}</p>}
                    {report.resolvedAt && <p className="mt-2 text-xs text-slate-500">Resuelto el {formatDate(report.resolvedAt)}</p>}
                  </div>
                  {canAttend && report.status !== 'resolved' && (
                    <button className={`${secondaryButton} shrink-0`} type="button" onClick={() => openAttend(report)}>Atender</button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {attending && (
        <Modal eyebrow="Mantenimiento" title={attending.equipment?.name ?? 'Reporte'} onClose={closeAttend}>
          <form className="space-y-5" onSubmit={handleSubmit}>
            <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">{attending.description}</p>

            <fieldset>
              <legend className={labelClass}>Estado</legend>
              <Segmented
                label="Nuevo estado"
                value={form.status}
                options={[['in_progress', 'En proceso'], ['resolved', 'Resuelto']] as const}
                onChange={(status) => setForm({ ...form, status })}
              />
            </fieldset>

            {form.status === 'in_progress' ? (
              <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-3 text-sm text-slate-700">
                <input className="mt-0.5 h-4 w-4 accent-brand-text" type="checkbox" checked={form.outOfService} onChange={(event) => setForm({ ...form, outOfService: event.target.checked })} />
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
              <label className={labelClass} htmlFor="report-note">Nota interna</label>
              <textarea className={fieldClass} id="report-note" rows={3} maxLength={1000} value={form.adminNote} onChange={(event) => setForm({ ...form, adminNote: event.target.value })} placeholder="Ej. Se pidió la refacción al proveedor." />
            </div>

            {modalError && <p className={errorAlert} role="alert">{modalError}</p>}

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button className={secondaryButton} type="button" onClick={closeAttend} disabled={isSubmitting}>Cancelar</button>
              <button className={primaryButton} type="submit" disabled={isSubmitting}>{isSubmitting ? 'Guardando...' : 'Guardar'}</button>
            </div>
          </form>
        </Modal>
      )}
    </Panel>
  )
}

export default MaintenanceReports
