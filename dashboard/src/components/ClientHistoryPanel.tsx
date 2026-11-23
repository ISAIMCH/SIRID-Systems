import { useEffect, useState } from 'react'
import { Dumbbell, Eye, EyeOff, History, ListChecks, Send, ShieldCheck, Share2 } from 'lucide-react'
import GymSelect from './GymSelect'
import {
  getHistoryAccessLogs,
  getHistoryShares,
  getSharedHistory,
  requestHistoryShare,
  type HistoryAccessLogEntry,
  type HistoryShare,
  type HistoryShareStatus,
  type SharedHistory,
} from '../services/api'
import { socket } from '../services/socket'
import { useAuth } from '../store/useAuth'
import { targetGymField } from '../utils/targetGym'
import Drawer from './ui/Drawer'
import Panel from './ui/Panel'
import Badge, { type BadgeTone } from './ui/Badge'
import EmptyState from './ui/EmptyState'
import { errorAlert, primaryButton, secondaryButton, tableHeadClass, tdClass, thClass } from './ui/styles'

const STATUS_COPY: Record<HistoryShareStatus, { label: string; tone: BadgeTone }> = {
  pending: { label: 'Esperando respuesta', tone: 'warning' },
  approved: { label: 'Compartido', tone: 'success' },
  rejected: { label: 'Rechazado por el cliente', tone: 'neutral' },
  revoked: { label: 'Revocado por el cliente', tone: 'danger' },
}

const SECTION_LABELS = { workouts: 'entrenamientos', routines: 'rutinas', sensitive: 'datos sensibles' } as const

function formatDate(value: string | null, withTime = false) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('es-MX', withTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' }).format(new Date(value))
}

const origin = (item: { organization: { name: string | null }; gym: { name: string | null } | null }) =>
  [item.organization.name, item.gym?.name].filter(Boolean).join(' · ') || 'Gimnasio desconocido'

interface ClientHistoryPanelProps {
  client: { id: string; name: string }
  // Owners and managers also see who opened the history.
  canSeeLogs: boolean
  onClose: () => void
}

// The history a client shares with the gym, from every organization. It disappears the moment the client revokes it.
function ClientHistoryPanel({ client, canSeeLogs, onClose }: ClientHistoryPanelProps) {
  const { isAllGyms } = useAuth()
  const [shares, setShares] = useState<HistoryShare[]>([])
  const [logs, setLogs] = useState<HistoryAccessLogEntry[]>([])
  const [history, setHistory] = useState<SharedHistory | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isOpening, setIsOpening] = useState(false)
  const [isRequesting, setIsRequesting] = useState(false)
  const [gymId, setGymId] = useState('')
  const [error, setError] = useState<string | null>(null)
  // Bumped by live updates and by this panel's own actions to reload the requests and the log.
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let isMounted = true
    Promise.all([getHistoryShares(client.id), canSeeLogs ? getHistoryAccessLogs(client.id) : Promise.resolve({ logs: [] })])
      .then(([sharesResponse, logsResponse]) => {
        if (!isMounted) return
        setShares(sharesResponse.shares)
        setLogs(logsResponse.logs)
      })
      .catch((requestError: unknown) => {
        if (isMounted) setError(requestError instanceof Error ? requestError.message : 'No se pudo cargar el historial compartido.')
      })
      .finally(() => { if (isMounted) setIsLoading(false) })
    return () => { isMounted = false }
  }, [client.id, canSeeLogs, reloadKey])

  // The client answered or revoked from the app: a history that is no longer shared is hidden at once.
  useEffect(() => {
    function handleUpdate(payload: { id: string; clientId: string; status: HistoryShareStatus; includeSensitive: boolean }) {
      if (payload.clientId !== client.id) return
      setHistory((current) => {
        if (!current || current.share.id !== payload.id) return current
        if (payload.status !== 'approved') return null
        return payload.includeSensitive ? current : { ...current, sensitive: null, share: { ...current.share, includeSensitive: false } }
      })
      setReloadKey((key) => key + 1)
    }
    socket.on('history-share:updated', handleUpdate)
    return () => { socket.off('history-share:updated', handleUpdate) }
  }, [client.id])

  const approved = shares.find((share) => share.status === 'approved')
  // A gym with a pending or approved request cannot ask again; in the all-gyms view that depends on the gym picked.
  const blockedGymIds = new Set(shares.filter((share) => share.status === 'pending' || share.status === 'approved').map((share) => share.gym.id))
  const canRequest = isAllGyms ? !gymId || !blockedGymIds.has(gymId) : blockedGymIds.size === 0

  async function openHistory(share: HistoryShare) {
    setError(null)
    setIsOpening(true)
    try {
      setHistory(await getSharedHistory(share.id))
      setReloadKey((key) => key + 1)
    } catch (requestError) {
      setHistory(null)
      setError(requestError instanceof Error ? requestError.message : 'No se pudo abrir el historial.')
      setReloadKey((key) => key + 1)
    } finally {
      setIsOpening(false)
    }
  }

  async function handleRequest() {
    setError(null)
    setIsRequesting(true)
    try {
      await requestHistoryShare({ clientId: client.id, ...targetGymField(isAllGyms, gymId) })
      setReloadKey((key) => key + 1)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No se pudo enviar la solicitud.')
    } finally {
      setIsRequesting(false)
    }
  }

  return (
    <Drawer
      eyebrow="Historial compartido"
      title={client.name}
      description="Entrenamientos y rutinas de todos los gimnasios del cliente, solo mientras él lo autorice."
      onClose={onClose}
    >
      {error && <p className={errorAlert} role="alert">{error}</p>}

      <Panel title="Solicitudes" icon={Share2}>
        {isLoading ? (
          <div className="skeleton h-16 w-full" />
        ) : shares.length === 0 ? (
          <p className="text-sm text-slate-500">Aún no le has pedido su historial a este cliente.</p>
        ) : (
          <ul className="-my-3 divide-y divide-slate-100">
            {shares.map((share) => (
              <li className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between" key={share.id}>
                <div className="min-w-0 text-sm">
                  <p className="font-medium text-ink">{share.gym.name ?? 'Sucursal'}</p>
                  <p className="text-slate-500">
                    Solicitado el {formatDate(share.requestedAt)}{share.requestedBy?.name ? ` por ${share.requestedBy.name}` : ''}
                    {share.status === 'approved' && (share.includeSensitive ? ' · incluye datos sensibles' : ' · sin datos sensibles')}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <Badge tone={STATUS_COPY[share.status].tone}>{STATUS_COPY[share.status].label}</Badge>
                  {share.status === 'approved' && (
                    <button className={`${primaryButton} min-h-[36px] px-3 py-1.5`} type="button" onClick={() => void openHistory(share)} disabled={isOpening}>
                      <Eye size={15} aria-hidden /> {isOpening ? 'Abriendo...' : 'Ver historial'}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        {!isLoading && (
          <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-end">
            {isAllGyms && (
              <div className="sm:w-64">
                <GymSelect id="history-gym" label="Sucursal que solicita" value={gymId} onChange={setGymId} />
              </div>
            )}
            <button
              className={secondaryButton}
              type="button"
              onClick={() => void handleRequest()}
              disabled={isRequesting || !canRequest}
              title={canRequest ? undefined : 'Esta sucursal ya tiene una solicitud pendiente o aprobada.'}
            >
              <Send size={15} aria-hidden /> {isRequesting ? 'Enviando...' : 'Solicitar historial'}
            </button>
            <p className="text-xs text-slate-500 sm:ml-1 sm:self-center">El cliente decide en su app si lo comparte.</p>
          </div>
        )}
      </Panel>

      {history ? (
        <>
          {history.sensitive ? (
            <section className="rounded-card border border-amber-200 bg-amber-50 p-5 sm:p-6">
              <h3 className="flex items-center gap-2 text-base font-semibold text-amber-900"><ShieldCheck size={18} aria-hidden /> Datos sensibles</h3>
              <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-3">
                <div><dt className="text-amber-800">Peso</dt><dd className="mt-0.5 font-display text-2xl font-bold text-ink tabular">{history.sensitive.weightKg ? `${history.sensitive.weightKg} kg` : '—'}</dd></div>
                <div><dt className="text-amber-800">Estatura</dt><dd className="mt-0.5 font-display text-2xl font-bold text-ink tabular">{history.sensitive.heightCm ? `${history.sensitive.heightCm} cm` : '—'}</dd></div>
                <div className="sm:col-span-3"><dt className="text-amber-800">Lesiones o restricciones</dt><dd className="mt-0.5 text-ink">{history.sensitive.restrictions || 'Sin registrar'}</dd></div>
              </dl>
            </section>
          ) : (
            <p className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-4 text-sm text-slate-500">
              <EyeOff size={16} aria-hidden /> El cliente no comparte sus medidas ni lesiones.
            </p>
          )}

          <Panel title="Entrenamientos" icon={Dumbbell} description={`${history.workouts.length} registrado${history.workouts.length === 1 ? '' : 's'}`}>
            {history.workouts.length === 0 ? (
              <EmptyState icon={Dumbbell} title="Sin entrenamientos registrados" />
            ) : (
              <div className="-mx-5 overflow-x-auto sm:-mx-6">
                <table className="min-w-full text-left text-sm">
                  <thead className={tableHeadClass}>
                    <tr>
                      <th className={thClass}>Fecha</th>
                      <th className={thClass}>Rutina</th>
                      <th className={thClass}>Gimnasio</th>
                      <th className={`${thClass} text-right`}>Duración</th>
                      <th className={`${thClass} text-right`}>Volumen</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {history.workouts.map((workout) => (
                      <tr key={workout._id}>
                        <td className={`${tdClass} whitespace-nowrap tabular`}>{formatDate(workout.completedAt)}</td>
                        <td className={`${tdClass} font-medium text-ink`}>{workout.routineTitle}</td>
                        <td className={`${tdClass} text-slate-500`}>{origin(workout)}</td>
                        <td className={`${tdClass} whitespace-nowrap text-right tabular`}>{workout.durationMinutes} min</td>
                        <td className={`${tdClass} whitespace-nowrap text-right tabular`}>{Math.round(workout.totalVolumeKg).toLocaleString('es-MX')} kg</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <Panel title="Rutinas" icon={ListChecks} description={`${history.routines.length} asignada${history.routines.length === 1 ? '' : 's'}`}>
            {history.routines.length === 0 ? (
              <EmptyState icon={ListChecks} title="Sin rutinas asignadas" />
            ) : (
              <ul className="-my-2 divide-y divide-slate-100 text-sm">
                {history.routines.map((routine, index) => (
                  <li className="flex flex-col gap-1 py-2.5 sm:flex-row sm:justify-between" key={routine.id ?? routine._id ?? index}>
                    <span className="font-medium text-ink">{routine.title}{routine.goal ? <span className="font-normal text-slate-500"> · {routine.goal}</span> : null}</span>
                    <span className="text-slate-500">{origin(routine)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </>
      ) : approved && !isLoading ? (
        <p className="rounded-xl border border-dashed border-slate-200 bg-white px-5 py-6 text-center text-sm text-slate-500">
          Abrir el historial queda registrado en la bitácora que el cliente puede consultar.
        </p>
      ) : null}

      {canSeeLogs && (
        <Panel title="Bitácora de consultas" icon={History}>
          {logs.length === 0 ? (
            <p className="text-sm text-slate-500">Nadie ha consultado el historial compartido de este cliente.</p>
          ) : (
            <ul className="-my-2 divide-y divide-slate-100 text-sm">
              {logs.map((log) => (
                <li className="flex flex-col gap-1 py-2.5 sm:flex-row sm:justify-between" key={log.id}>
                  <span><span className="font-medium text-ink">{log.viewer.name ?? 'Personal'}</span> <span className="text-slate-500">· {log.gym.name} · {log.sections.map((section) => SECTION_LABELS[section]).join(', ')}</span></span>
                  <span className="whitespace-nowrap text-slate-500 tabular">{formatDate(log.createdAt, true)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}
    </Drawer>
  )
}

export default ClientHistoryPanel
