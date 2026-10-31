import { useCallback, useEffect, useMemo, useState } from 'react'
import { Download, Eye, Trash2, Upload } from 'lucide-react'
import {
  deleteDocument,
  getDocumentLogs,
  getDocuments,
  getDocumentUrl,
  getUsers,
  purgeUserDocuments,
  reviewDocument,
  uploadDocument,
} from '../services/api'
import type { DocumentAction, DocumentCategory, DocumentLog, DocumentPerson, DocumentStatus, GymDocument } from '../services/api'
import { socket } from '../services/socket'
import type { User } from '../types'
import { useAuth } from '../store/useAuth'
import { useStaffRoles } from '../utils/access'

const CATEGORY_LABELS: Record<DocumentCategory, string> = {
  cv: 'Currículum',
  identification: 'Identificación oficial',
  fiscal: 'Constancia fiscal',
  certification: 'Certificaciones',
  availability: 'Disponibilidad de horario',
  evaluation: 'Evaluación',
  student_id: 'Credencial de estudiante',
  other: 'Otro',
}

// The hiring file asks for one of each; 'other' is optional.
const STAFF_CATEGORIES: DocumentCategory[] = ['cv', 'identification', 'fiscal', 'certification', 'availability', 'evaluation']

const STATUS_STYLES: Record<DocumentStatus, { label: string; className: string }> = {
  pending: { label: 'Pendiente', className: 'bg-yellow-100 text-yellow-800' },
  verified: { label: 'Verificado', className: 'bg-green-100 text-green-800' },
  rejected: { label: 'Rechazado', className: 'bg-red-100 text-red-800' },
}

const ACTION_LABELS: Record<DocumentAction, string> = {
  upload: 'Subió',
  view: 'Consultó',
  download: 'Descargó',
  verify: 'Verificó',
  reject: 'Rechazó',
  delete: 'Eliminó',
  purge: 'Destruyó',
}

const MAX_FILE_SIZE = 10 * 1024 * 1024
const ACCEPTED_FILES = 'application/pdf,image/jpeg,image/png'

const inputClass = 'w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-100'

function personName(person: DocumentPerson | string | null) {
  if (!person || typeof person === 'string') return '—'
  return [person.name, person.lastName].filter(Boolean).join(' ')
}

function personId(person: DocumentPerson | string | null) {
  if (!person) return ''
  return typeof person === 'string' ? person : person.id
}

function formatDate(value: string | null, withTime = false) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('es-MX', withTime ? { dateStyle: 'short', timeStyle: 'short' } : { dateStyle: 'medium' }).format(new Date(value))
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

// The tab opens before the request so the browser doesn't treat it as a popup.
async function openDocument(document: GymDocument, download = false) {
  const tab = window.open('', '_blank')
  try {
    const { url } = await getDocumentUrl(document.id, download)
    if (tab) {
      tab.opener = null
      tab.location.href = url
    } else {
      window.location.href = url
    }
  } catch (error) {
    tab?.close()
    throw error
  }
}

function StatusBadge({ document }: { document: GymDocument }) {
  const style = STATUS_STYLES[document.status]
  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${style.className}`} title={document.rejectionReason || undefined}>
      {style.label}
    </span>
  )
}

interface ReviewModalProps {
  document: GymDocument
  decision: 'verified' | 'rejected'
  onClose: () => void
  onDone: () => void
}

function ReviewModal({ document, decision, onClose, onDone }: ReviewModalProps) {
  const [validUntil, setValidUntil] = useState('')
  const [reason, setReason] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isVerify = decision === 'verified'

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(null); setIsSubmitting(true)
    try {
      await reviewDocument(document.id, isVerify
        ? { status: 'verified', ...(validUntil ? { validUntil } : {}) }
        : { status: 'rejected', rejectionReason: reason.trim() })
      onDone()
    } catch (requestError) {
      setError(errorMessage(requestError, 'No se pudo guardar la revisión.'))
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/50 px-4 py-8 backdrop-blur-sm">
      <form className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl" onSubmit={handleSubmit}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-emerald-700">{CATEGORY_LABELS[document.category]}</p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-900">{isVerify ? 'Verificar documento' : 'Rechazar documento'}</h2>
            <p className="mt-1 truncate text-sm text-slate-500">{personName(document.owner)} · {document.originalName}</p>
          </div>
          <button className="text-2xl leading-none text-slate-400 transition hover:text-slate-700" type="button" aria-label="Cerrar modal" onClick={onClose}>×</button>
        </div>

        <div className="mt-6 space-y-4">
          {isVerify ? (
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="review-valid-until">Vigente hasta (opcional)</label>
              <input className={inputClass} id="review-valid-until" type="date" value={validUntil} onChange={(event) => setValidUntil(event.target.value)} />
              <p className="mt-2 text-xs text-slate-500">Por ejemplo, el fin del ciclo escolar en una credencial. Después de esa fecha deja de desbloquear promociones.</p>
            </div>
          ) : (
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="review-reason">Motivo</label>
              <textarea
                className={inputClass}
                id="review-reason"
                rows={3}
                maxLength={300}
                placeholder="Ej. La foto está borrosa o el documento está vencido."
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                required
              />
              <p className="mt-2 text-xs text-slate-500">El titular verá este motivo para volver a subirlo.</p>
            </div>
          )}
          {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <button className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100" type="button" onClick={onClose}>Cancelar</button>
            <button
              className={`rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${isVerify ? 'bg-[#0F172A]' : 'bg-red-600'}`}
              type="submit"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Guardando...' : isVerify ? 'Verificar' : 'Rechazar'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}

interface DocumentActionsProps {
  document: GymDocument
  canReview: boolean
  canDelete: boolean
  onReview: (document: GymDocument, decision: 'verified' | 'rejected') => void
  onDeleted: () => void
  onError: (message: string | null) => void
}

function DocumentActions({ document, canReview, canDelete, onReview, onDeleted, onError }: DocumentActionsProps) {
  async function handleOpen(download: boolean) {
    onError(null)
    try {
      await openDocument(document, download)
    } catch (requestError) {
      onError(errorMessage(requestError, 'No se pudo abrir el documento.'))
    }
  }

  async function handleDelete() {
    if (!window.confirm(`${document.originalName} dejará de aparecer en el expediente. El registro se conserva en la bitácora. ¿Eliminar?`)) return
    onError(null)
    try {
      await deleteDocument(document.id)
      onDeleted()
    } catch (requestError) {
      onError(errorMessage(requestError, 'No se pudo eliminar el documento.'))
    }
  }

  const linkClass = 'text-sm font-medium transition'
  return (
    <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2">
      <button className={`${linkClass} inline-flex items-center gap-1 text-slate-600 hover:text-slate-900`} type="button" onClick={() => void handleOpen(false)}>
        <Eye size={15} aria-hidden="true" /> Ver
      </button>
      <button className={`${linkClass} inline-flex items-center gap-1 text-slate-600 hover:text-slate-900`} type="button" onClick={() => void handleOpen(true)}>
        <Download size={15} aria-hidden="true" /> Descargar
      </button>
      {canReview && document.status !== 'verified' && (
        <button className={`${linkClass} text-green-700 hover:text-green-900`} type="button" onClick={() => onReview(document, 'verified')}>Verificar</button>
      )}
      {canReview && document.status !== 'rejected' && (
        <button className={`${linkClass} text-red-600 hover:text-red-800`} type="button" onClick={() => onReview(document, 'rejected')}>Rechazar</button>
      )}
      {canDelete && (
        <button className={`${linkClass} text-slate-400 hover:text-red-700`} type="button" onClick={() => void handleDelete()}>Eliminar</button>
      )}
    </div>
  )
}

// Reloads the list whenever a document changes anywhere in the organization.
function useDocumentEvents(refresh: () => void) {
  useEffect(() => {
    socket.on('document-updated', refresh)
    return () => {
      socket.off('document-updated', refresh)
    }
  }, [refresh])
}

interface ReviewTarget {
  document: GymDocument
  decision: 'verified' | 'rejected'
}

const PURGE_CONFIRMATION = 'DESTRUIR'

// A client's request, made at the front desk, to delete their data: every file they have here is destroyed in R2.
// Former clients are listed too, through the documents they left.
function PurgeModal({ onClose, onDone }: { onClose: () => void; onDone: (message: string) => void }) {
  const [people, setPeople] = useState<DocumentPerson[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true
    Promise.all([getUsers<User[]>({ role: 'Cliente' }), getDocuments({ kind: 'client' })])
      .then(([clients, response]) => {
        if (!isMounted) return
        const byId = new Map<string, DocumentPerson>()
        clients.forEach((client) => byId.set(userId(client), { id: userId(client), name: userName(client), email: client.email }))
        response.documents.forEach((document) => {
          if (document.owner && typeof document.owner === 'object' && !byId.has(document.owner.id)) byId.set(document.owner.id, document.owner)
        })
        setPeople([...byId.values()].sort((a, b) => personName(a).localeCompare(personName(b), 'es')))
      })
      .catch((requestError: unknown) => { if (isMounted) setError(errorMessage(requestError, 'No se pudo cargar la lista de clientes.')) })
      .finally(() => { if (isMounted) setIsLoading(false) })
    return () => { isMounted = false }
  }, [])

  const selected = people.find((person) => person.id === selectedId)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selected) return
    setError(null); setIsSubmitting(true)
    try {
      const { purged } = await purgeUserDocuments(selected.id)
      onDone(purged
        ? `Se destruyeron ${purged} ${purged === 1 ? 'documento' : 'documentos'} de ${personName(selected)}.`
        : `${personName(selected)} no tenía documentos por destruir.`)
    } catch (requestError) {
      setError(errorMessage(requestError, 'No se pudieron destruir los documentos.'))
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/50 px-4 py-8 backdrop-blur-sm">
      <form className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl" onSubmit={handleSubmit}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-red-700">Solicitud del titular</p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-900">Destruir documentos</h2>
          </div>
          <button className="text-2xl leading-none text-slate-400 transition hover:text-slate-700" type="button" aria-label="Cerrar modal" onClick={onClose}>×</button>
        </div>

        <div className="mt-6 space-y-4">
          <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            Se borran para siempre todos los archivos de la persona en esta organización, incluidos los que ya se habían eliminado de la vista. No se puede deshacer. La bitácora conserva quién lo hizo y cuándo.
          </p>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="purge-person">Cliente</label>
            <select className={inputClass} id="purge-person" value={selectedId} onChange={(event) => { setSelectedId(event.target.value); setConfirmation('') }} disabled={isLoading} required>
              <option value="">{isLoading ? 'Cargando...' : 'Selecciona un cliente'}</option>
              {people.map((person) => (
                <option key={person.id} value={person.id}>{personName(person)}{person.email ? ` · ${person.email}` : ''}</option>
              ))}
            </select>
          </div>
          {selected && (
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="purge-confirmation">
                Escribe <span className="font-mono font-semibold">{PURGE_CONFIRMATION}</span> para confirmar
              </label>
              <input className={inputClass} id="purge-confirmation" autoComplete="off" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
            </div>
          )}
          {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <button className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100" type="button" onClick={onClose}>Cancelar</button>
            <button
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              type="submit"
              disabled={!selected || confirmation.trim() !== PURGE_CONFIRMATION || isSubmitting}
            >
              {isSubmitting ? 'Destruyendo...' : 'Destruir documentos'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}

// Reception and managers check what clients upload from the app; a verified document unlocks its promotions.
function ClientDocuments({ canDelete, canPurge }: { canDelete: boolean; canPurge: boolean }) {
  const [status, setStatus] = useState<DocumentStatus | ''>('pending')
  const [documents, setDocuments] = useState<GymDocument[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reviewTarget, setReviewTarget] = useState<ReviewTarget | null>(null)
  const [isPurgeOpen, setIsPurgeOpen] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const refresh = useCallback(() => {
    getDocuments({ kind: 'client', ...(status ? { status } : {}) })
      .then((response) => setDocuments(response.documents))
      .catch((requestError: unknown) => setError(errorMessage(requestError, 'No se pudieron cargar los documentos.')))
      .finally(() => setIsLoading(false))
  }, [status])

  useEffect(refresh, [refresh])
  useDocumentEvents(refresh)

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <p className="text-slate-500">Credenciales y comprobantes que los clientes suben desde la app.</p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          {canPurge && (
            <button
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-red-200 bg-white px-4 py-3 text-sm font-medium text-red-700 transition hover:bg-red-50"
              type="button"
              onClick={() => { setNotice(null); setIsPurgeOpen(true) }}
            >
              <Trash2 size={16} aria-hidden="true" /> Destruir documentos
            </button>
          )}
          <div className="sm:w-56">
            <label className="sr-only" htmlFor="client-status">Estado</label>
            <select className={inputClass} id="client-status" value={status} onChange={(event) => { setIsLoading(true); setStatus(event.target.value as DocumentStatus | '') }}>
              <option value="pending">Por revisar</option>
              <option value="verified">Verificados</option>
              <option value="rejected">Rechazados</option>
              <option value="">Todos</option>
            </select>
          </div>
        </div>
      </div>

      {notice && <div className="mt-6 rounded-lg border border-green-100 bg-green-50 px-4 py-3 text-sm text-green-800" role="status">{notice}</div>}

      {error && <div className="mt-6 rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{error}</div>}

      <div className="mt-6 overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
        {isLoading ? (
          <div className="space-y-4 p-6" aria-label="Cargando documentos" aria-busy="true">
            {Array.from({ length: 4 }).map((_, index) => <div className="h-4 animate-pulse rounded bg-slate-200" key={index} />)}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-100 bg-slate-50/80 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-6 py-4 font-medium">Cliente</th>
                  <th className="px-6 py-4 font-medium">Documento</th>
                  <th className="px-6 py-4 font-medium">Subido</th>
                  <th className="px-6 py-4 font-medium">Estado</th>
                  <th className="px-6 py-4 font-medium">Vigencia</th>
                  <th className="px-6 py-4" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {documents.length ? documents.map((document) => (
                  <tr className="transition-colors hover:bg-slate-50" key={document.id}>
                    <td className="whitespace-nowrap px-6 py-4">
                      <p className="font-medium text-slate-900">{personName(document.owner)}</p>
                      {typeof document.owner === 'object' && document.owner?.email && <p className="text-xs text-slate-500">{document.owner.email}</p>}
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-slate-900">{CATEGORY_LABELS[document.category]}</p>
                      <p className="max-w-56 truncate text-xs text-slate-500" title={document.originalName}>{document.originalName}</p>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-slate-500">{formatDate(document.createdAt)}</td>
                    <td className="px-6 py-4">
                      <StatusBadge document={document} />
                      {document.status === 'rejected' && document.rejectionReason && <p className="mt-1 max-w-48 text-xs text-slate-500">{document.rejectionReason}</p>}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-slate-500">{document.status === 'verified' ? (document.validUntil ? formatDate(document.validUntil) : 'Sin vencimiento') : '—'}</td>
                    <td className="px-6 py-4">
                      <DocumentActions
                        document={document}
                        canReview
                        canDelete={canDelete}
                        onReview={(target, decision) => setReviewTarget({ document: target, decision })}
                        onDeleted={refresh}
                        onError={setError}
                      />
                    </td>
                  </tr>
                )) : (
                  <tr><td className="px-6 py-10 text-center text-sm text-slate-500" colSpan={6}>{status === 'pending' ? 'No hay documentos por revisar.' : 'No hay documentos.'}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {reviewTarget && (
        <ReviewModal
          document={reviewTarget.document}
          decision={reviewTarget.decision}
          onClose={() => setReviewTarget(null)}
          onDone={() => { setReviewTarget(null); refresh() }}
        />
      )}

      {isPurgeOpen && (
        <PurgeModal
          onClose={() => setIsPurgeOpen(false)}
          onDone={(message) => { setIsPurgeOpen(false); setNotice(message); refresh() }}
        />
      )}
    </div>
  )
}

function userId(user: User) {
  return String(user.id ?? user._id ?? '')
}

function userName(user: User) {
  return [user.name ?? user.firstName, user.lastName].filter(Boolean).join(' ') || user.email
}

interface UploadButtonProps {
  ownerId: string
  category: DocumentCategory
  onUploaded: () => void
  onError: (message: string | null) => void
}

function UploadButton({ ownerId, category, onUploaded, onError }: UploadButtonProps) {
  const [isUploading, setIsUploading] = useState(false)
  const inputId = `upload-${category}`

  async function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (file.size > MAX_FILE_SIZE) {
      onError('El archivo supera los 10 MB.')
      return
    }
    onError(null); setIsUploading(true)
    try {
      await uploadDocument({ file, category, ownerId })
      onUploaded()
    } catch (requestError) {
      onError(errorMessage(requestError, 'No se pudo subir el documento.'))
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <label
      className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:border-green-400 hover:text-green-800 ${isUploading ? 'pointer-events-none opacity-50' : ''}`}
      htmlFor={inputId}
    >
      <Upload size={15} aria-hidden="true" /> {isUploading ? 'Subiendo...' : 'Subir'}
      <input className="sr-only" id={inputId} type="file" accept={ACCEPTED_FILES} onChange={(event) => void handleChange(event)} disabled={isUploading} />
    </label>
  )
}

// Hiring files: owners see every employee, managers only the staff of their gyms (the API filters both).
function StaffDocuments() {
  const { session } = useAuth()
  const [staff, setStaff] = useState<User[]>([])
  const [documents, setDocuments] = useState<GymDocument[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reviewTarget, setReviewTarget] = useState<ReviewTarget | null>(null)

  const refresh = useCallback(() => {
    getDocuments({ kind: 'staff' })
      .then((response) => setDocuments(response.documents))
      .catch((requestError: unknown) => setError(errorMessage(requestError, 'No se pudieron cargar los expedientes.')))
  }, [])

  useEffect(() => {
    let isMounted = true
    Promise.all([getUsers<User[]>(), getDocuments({ kind: 'staff' })])
      .then(([users, response]) => {
        if (!isMounted) return
        const members = users.filter((user) => user.role !== 'Cliente')
        setStaff(members)
        setDocuments(response.documents)
        setSelectedId((current) => current || (members[0] ? userId(members[0]) : ''))
      })
      .catch((requestError: unknown) => { if (isMounted) setError(errorMessage(requestError, 'No se pudieron cargar los expedientes.')) })
      .finally(() => { if (isMounted) setIsLoading(false) })
    return () => { isMounted = false }
  }, [])

  useDocumentEvents(refresh)

  const documentsByOwner = useMemo(() => {
    const groups = new Map<string, GymDocument[]>()
    documents.forEach((document) => {
      const id = personId(document.owner)
      groups.set(id, [...(groups.get(id) ?? []), document])
    })
    return groups
  }, [documents])

  // Categories with at least one verified file, out of the six the file asks for.
  const progress = (id: string) => STAFF_CATEGORIES.filter((category) => (documentsByOwner.get(id) ?? [])
    .some((document) => document.category === category && document.status === 'verified')).length

  const selected = staff.find((user) => userId(user) === selectedId)
  const selectedDocuments = documentsByOwner.get(selectedId) ?? []
  // The API refuses reviews of one's own file; the owner still sees it.
  const isOwnFile = selectedId === session?.user.id

  if (isLoading) {
    return <div className="h-64 animate-pulse rounded-xl bg-slate-200" aria-label="Cargando expedientes" aria-busy="true" />
  }

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <p className="text-slate-500">CV, identificación, datos fiscales, certificaciones, disponibilidad y evaluación de cada empleado.</p>
        <div className="sm:w-72">
          <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="staff-member">Empleado</label>
          <select className={inputClass} id="staff-member" value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
            {staff.length === 0 && <option value="">Sin personal</option>}
            {staff.map((user) => (
              <option key={userId(user)} value={userId(user)}>{userName(user)} · {progress(userId(user))}/{STAFF_CATEGORIES.length}</option>
            ))}
          </select>
        </div>
      </div>

      {error && <div className="mt-6 rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{error}</div>}

      {selected && (
        <div className="mt-6 overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
          <div className="flex flex-col gap-1 border-b border-slate-100 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">{userName(selected)}</h2>
              <p className="text-sm text-slate-500">{selected.email}</p>
            </div>
            <p className="text-sm font-medium text-slate-600">{progress(selectedId)} de {STAFF_CATEGORIES.length} documentos verificados</p>
          </div>
          <ul className="divide-y divide-slate-100">
            {[...STAFF_CATEGORIES, 'other' as const].map((category) => {
              const files = selectedDocuments.filter((document) => document.category === category)
              return (
                <li className="px-6 py-4" key={category}>
                  <div className="flex items-center justify-between gap-4">
                    <p className="font-medium text-slate-900">
                      {CATEGORY_LABELS[category]}
                      {category === 'other' && <span className="ml-2 text-xs font-normal text-slate-400">opcional</span>}
                    </p>
                    <UploadButton ownerId={selectedId} category={category} onUploaded={refresh} onError={setError} />
                  </div>
                  {files.length > 0 ? (
                    <ul className="mt-3 space-y-3">
                      {files.map((document) => (
                        <li className="flex flex-col gap-2 rounded-lg bg-slate-50 px-4 py-3 lg:flex-row lg:items-center lg:justify-between" key={document.id}>
                          <div className="min-w-0">
                            <p className="truncate text-sm text-slate-900" title={document.originalName}>{document.originalName}</p>
                            <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                              <StatusBadge document={document} />
                              <span>Subido {formatDate(document.createdAt)} por {personName(document.uploadedBy)}</span>
                              {document.status === 'rejected' && document.rejectionReason && <span>· {document.rejectionReason}</span>}
                            </p>
                          </div>
                          <DocumentActions
                            document={document}
                            canReview={!isOwnFile}
                            canDelete={!isOwnFile}
                            onReview={(target, decision) => setReviewTarget({ document: target, decision })}
                            onDeleted={refresh}
                            onError={setError}
                          />
                        </li>
                      ))}
                    </ul>
                  ) : (
                    category !== 'other' && <p className="mt-1 text-sm text-slate-400">Falta este documento.</p>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {reviewTarget && (
        <ReviewModal
          document={reviewTarget.document}
          decision={reviewTarget.decision}
          onClose={() => setReviewTarget(null)}
          onDone={() => { setReviewTarget(null); refresh() }}
        />
      )}
    </div>
  )
}

// Every view, download and review of a document, for the owner (LFPDPPP).
function AccessLog() {
  const [logs, setLogs] = useState<DocumentLog[]>([])
  const [action, setAction] = useState<DocumentAction | ''>('')
  const [search, setSearch] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(() => {
    getDocumentLogs({ limit: 500 })
      .then((response) => setLogs(response.logs))
      .catch((requestError: unknown) => setError(errorMessage(requestError, 'No se pudo cargar la bitácora.')))
      .finally(() => setIsLoading(false))
  }, [])

  useEffect(refresh, [refresh])
  useDocumentEvents(refresh)

  const term = search.trim().toLowerCase()
  const visibleLogs = logs.filter((log) => (!action || log.action === action)
    && (!term || [personName(log.actor), personName(log.owner), log.document?.originalName ?? ''].some((text) => text.toLowerCase().includes(term))))

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <p className="text-slate-500">Quién consultó, descargó, revisó o eliminó cada documento. Los registros no se pueden editar.</p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <label className="sr-only" htmlFor="log-search">Buscar</label>
          <input className={`${inputClass} sm:w-56`} id="log-search" placeholder="Buscar persona o archivo" value={search} onChange={(event) => setSearch(event.target.value)} />
          <label className="sr-only" htmlFor="log-action">Acción</label>
          <select className={`${inputClass} sm:w-44`} id="log-action" value={action} onChange={(event) => setAction(event.target.value as DocumentAction | '')}>
            <option value="">Todas las acciones</option>
            {Object.entries(ACTION_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
      </div>

      {error && <div className="mt-6 rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{error}</div>}

      <div className="mt-6 overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
        {isLoading ? (
          <div className="space-y-4 p-6" aria-label="Cargando bitácora" aria-busy="true">
            {Array.from({ length: 5 }).map((_, index) => <div className="h-4 animate-pulse rounded bg-slate-200" key={index} />)}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-100 bg-slate-50/80 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-6 py-4 font-medium">Fecha</th>
                  <th className="px-6 py-4 font-medium">Persona</th>
                  <th className="px-6 py-4 font-medium">Acción</th>
                  <th className="px-6 py-4 font-medium">Documento</th>
                  <th className="px-6 py-4 font-medium">Titular</th>
                  <th className="px-6 py-4 font-medium">IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {visibleLogs.length ? visibleLogs.map((log) => (
                  <tr className="transition-colors hover:bg-slate-50" key={log.id}>
                    <td className="whitespace-nowrap px-6 py-4 text-slate-500">{formatDate(log.createdAt, true)}</td>
                    <td className="whitespace-nowrap px-6 py-4 font-medium text-slate-900">{personName(log.actor)}</td>
                    <td className="whitespace-nowrap px-6 py-4">{ACTION_LABELS[log.action]}</td>
                    <td className="px-6 py-4">
                      {log.document ? (
                        <>
                          <p className="text-slate-900">{CATEGORY_LABELS[log.document.category]}</p>
                          <p className="max-w-56 truncate text-xs text-slate-500" title={log.document.originalName}>{log.document.originalName}</p>
                        </>
                      ) : '—'}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">{personName(log.owner)}</td>
                    <td className="whitespace-nowrap px-6 py-4 font-mono text-xs text-slate-500">{log.ip || '—'}</td>
                  </tr>
                )) : (
                  <tr><td className="px-6 py-10 text-center text-sm text-slate-500" colSpan={6}>No hay movimientos registrados.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {logs.length >= 500 && <p className="mt-3 text-xs text-slate-500">Se muestran los 500 movimientos más recientes.</p>}
    </div>
  )
}

type Tab = 'clientes' | 'personal' | 'bitacora'

function Documents() {
  const { session, organizationGyms } = useAuth()
  const isAdmin = useStaffRoles().has('Admin')
  // The log and hiring files of other managers are for the owner; platform admins act as owners.
  const isOwner = Boolean(session?.user.isPlatformAdmin) || organizationGyms.some((gym) => gym.roles.includes('Propietario'))
  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'clientes', label: 'Clientes' },
    ...(isAdmin ? [{ id: 'personal' as const, label: 'Expediente del personal' }] : []),
    ...(isOwner ? [{ id: 'bitacora' as const, label: 'Bitácora' }] : []),
  ]
  const [activeTab, setActiveTab] = useState<Tab>('clientes')

  return (
    <section className="min-h-screen bg-[#F8FAFC] px-4 py-10 sm:px-8">
      <p className="text-sm font-medium uppercase tracking-[0.25em] text-slate-500">Operación</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-900">Documentos</h1>

      {tabs.length > 1 && (
        <div className="mt-6 flex gap-2 overflow-x-auto border-b border-slate-200" role="tablist">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={`whitespace-nowrap px-4 py-2 text-sm ${activeTab === tab.id ? 'border-b-2 border-green-500 font-semibold text-green-700' : 'text-slate-500 hover:text-slate-800'}`}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      <div className="mt-6">
        {activeTab === 'clientes' && <ClientDocuments canDelete={isAdmin} canPurge={isOwner} />}
        {activeTab === 'personal' && isAdmin && <StaffDocuments />}
        {activeTab === 'bitacora' && isOwner && <AccessLog />}
      </div>
    </section>
  )
}

export default Documents
