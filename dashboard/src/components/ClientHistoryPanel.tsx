import { useEffect, useState } from 'react'
import { Eye, EyeOff, History, Send, ShieldCheck, X } from 'lucide-react'
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

const STATUS_COPY: Record<HistoryShareStatus, { label: string; tone: string }> = {
  pending: { label: 'Esperando respuesta del cliente', tone: 'bg-amber-50 text-amber-800 border-amber-200' },
  approved: { label: 'Compartido', tone: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  rejected: { label: 'Rechazado por el cliente', tone: 'bg-slate-100 text-slate-700 border-slate-200' },
  revoked: { label: 'Revocado por el cliente', tone: 'bg-red-50 text-red-800 border-red-200' },
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
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/50" role="dialog" aria-modal="true" aria-labelledby="history-title">
      <div className="flex h-full w-full max-w-3xl flex-col overflow-y-auto bg-[#F8FAFC] shadow-xl">
        <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-6 py-5">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">Historial compartido</p>
            <h2 className="mt-1 text-2xl font-semibold text-slate-900" id="history-title">{client.name}</h2>
            <p className="mt-1 text-sm text-slate-500">Entrenamientos y rutinas de todos los gimnasios del cliente, solo mientras él lo autorice.</p>
          </div>
          <button className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900" type="button" aria-label="Cerrar" onClick={onClose}>
            <X size={20} />
          </button>
        </header>

        <div className="space-y-6 px-6 py-6">
          {error && <p className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{error}</p>}

          <section className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
            <h3 className="font-semibold text-slate-900">Solicitudes</h3>
            {isLoading ? (
              <div className="mt-4 h-16 animate-pulse rounded-lg bg-slate-100" />
            ) : shares.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">Aún no le has pedido su historial a este cliente.</p>
            ) : (
              <ul className="mt-4 divide-y divide-slate-100">
                {shares.map((share) => (
                  <li className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between" key={share.id}>
                    <div className="text-sm">
                      <p className="font-medium text-slate-900">{share.gym.name ?? 'Sucursal'}</p>
                      <p className="text-slate-500">
                        Solicitado el {formatDate(share.requestedAt)}{share.requestedBy?.name ? ` por ${share.requestedBy.name}` : ''}
                        {share.status === 'approved' && (share.includeSensitive ? ' · incluye datos sensibles' : ' · sin datos sensibles')}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`rounded-full border px-3 py-0.5 text-xs font-medium ${STATUS_COPY[share.status].tone}`}>{STATUS_COPY[share.status].label}</span>
                      {share.status === 'approved' && (
                        <button
                          className="inline-flex items-center gap-2 rounded-lg bg-[#0F172A] px-3 py-1.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50"
                          type="button"
                          onClick={() => void openHistory(share)}
                          disabled={isOpening}
                        >
                          <Eye size={15} aria-hidden="true" /> {isOpening ? 'Abriendo...' : 'Ver historial'}
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {!isLoading && (
              <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-end">
                <div className="sm:w-64">
                  <GymSelect id="history-gym" label="Sucursal que solicita" value={gymId} onChange={setGymId} />
                </div>
                <button
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  type="button"
                  onClick={() => void handleRequest()}
                  disabled={isRequesting || !canRequest}
                  title={canRequest ? undefined : 'Esta sucursal ya tiene una solicitud pendiente o aprobada.'}
                >
                  <Send size={15} aria-hidden="true" /> {isRequesting ? 'Enviando...' : 'Solicitar historial'}
                </button>
                <p className="text-xs text-slate-500 sm:ml-2">El cliente decide en su app si lo comparte.</p>
              </div>
            )}
          </section>

          {history ? (
            <>
              {history.sensitive ? (
                <section className="rounded-xl border border-amber-200 bg-amber-50 p-5">
                  <h3 className="flex items-center gap-2 font-semibold text-amber-900"><ShieldCheck size={18} aria-hidden="true" /> Datos sensibles</h3>
                  <dl className="mt-3 grid gap-4 text-sm sm:grid-cols-3">
                    <div><dt className="text-amber-800">Peso</dt><dd className="font-semibold text-slate-900">{history.sensitive.weightKg ? `${history.sensitive.weightKg} kg` : '—'}</dd></div>
                    <div><dt className="text-amber-800">Estatura</dt><dd className="font-semibold text-slate-900">{history.sensitive.heightCm ? `${history.sensitive.heightCm} cm` : '—'}</dd></div>
                    <div className="sm:col-span-3"><dt className="text-amber-800">Lesiones o restricciones</dt><dd className="text-slate-900">{history.sensitive.restrictions || 'Sin registrar'}</dd></div>
                  </dl>
                </section>
              ) : (
                <p className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-4 text-sm text-slate-500">
                  <EyeOff size={16} aria-hidden="true" /> El cliente no comparte sus medidas ni lesiones.
                </p>
              )}

              <section className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
                <h3 className="font-semibold text-slate-900">Entrenamientos ({history.workouts.length})</h3>
                {history.workouts.length === 0 ? (
                  <p className="mt-2 text-sm text-slate-500">Sin entrenamientos registrados.</p>
                ) : (
                  <div className="mt-4 overflow-x-auto">
                    <table className="min-w-full text-left text-sm">
                      <thead className="border-b border-slate-100 text-xs uppercase tracking-wider text-slate-500">
                        <tr>
                          <th className="py-2 pr-4 font-medium">Fecha</th>
                          <th className="py-2 pr-4 font-medium">Rutina</th>
                          <th className="py-2 pr-4 font-medium">Gimnasio</th>
                          <th className="py-2 pr-4 font-medium">Duración</th>
                          <th className="py-2 font-medium">Volumen</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-700">
                        {history.workouts.map((workout) => (
                          <tr key={workout._id}>
                            <td className="whitespace-nowrap py-2 pr-4">{formatDate(workout.completedAt)}</td>
                            <td className="py-2 pr-4 font-medium text-slate-900">{workout.routineTitle}</td>
                            <td className="py-2 pr-4 text-slate-500">{origin(workout)}</td>
                            <td className="whitespace-nowrap py-2 pr-4">{workout.durationMinutes} min</td>
                            <td className="whitespace-nowrap py-2">{Math.round(workout.totalVolumeKg)} kg</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <section className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
                <h3 className="font-semibold text-slate-900">Rutinas ({history.routines.length})</h3>
                {history.routines.length === 0 ? (
                  <p className="mt-2 text-sm text-slate-500">Sin rutinas asignadas.</p>
                ) : (
                  <ul className="mt-3 divide-y divide-slate-100 text-sm">
                    {history.routines.map((routine, index) => (
                      <li className="flex flex-col gap-1 py-2 sm:flex-row sm:justify-between" key={routine.id ?? routine._id ?? index}>
                        <span className="font-medium text-slate-900">{routine.title}{routine.goal ? <span className="font-normal text-slate-500"> · {routine.goal}</span> : null}</span>
                        <span className="text-slate-500">{origin(routine)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          ) : approved && !isLoading ? (
            <p className="rounded-xl border border-dashed border-slate-200 bg-white px-5 py-6 text-center text-sm text-slate-500">
              Abrir el historial queda registrado en la bitácora que el cliente puede consultar.
            </p>
          ) : null}

          {canSeeLogs && (
            <section className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
              <h3 className="flex items-center gap-2 font-semibold text-slate-900"><History size={18} aria-hidden="true" /> Bitácora de consultas</h3>
              {logs.length === 0 ? (
                <p className="mt-2 text-sm text-slate-500">Nadie ha consultado el historial compartido de este cliente.</p>
              ) : (
                <ul className="mt-3 divide-y divide-slate-100 text-sm">
                  {logs.map((log) => (
                    <li className="flex flex-col gap-1 py-2 sm:flex-row sm:justify-between" key={log.id}>
                      <span><span className="font-medium text-slate-900">{log.viewer.name ?? 'Personal'}</span> <span className="text-slate-500">· {log.gym.name} · {log.sections.map((section) => SECTION_LABELS[section]).join(', ')}</span></span>
                      <span className="text-slate-500">{formatDate(log.createdAt, true)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  )
}

export default ClientHistoryPanel
