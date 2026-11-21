import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, CircleCheck, Download, Eye, FileText, FolderOpen, ScrollText, Search, ShieldAlert, Trash2, Upload, X } from 'lucide-react'
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
import PageHeader from '../components/ui/PageHeader'
import Panel from '../components/ui/Panel'
import Modal from '../components/ui/Modal'
import Badge, { type BadgeTone } from '../components/ui/Badge'
import EmptyState from '../components/ui/EmptyState'
import Segmented from '../components/ui/Segmented'
import { dangerButton, errorAlert, fieldClass, hintClass, iconButton, labelClass, primaryButton, secondaryButton, successAlert, tableHeadClass, tdClass, thClass } from '../components/ui/styles'

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

const STATUS_STYLES: Record<DocumentStatus, { label: string; tone: BadgeTone }> = {
  pending: { label: 'Pendiente', tone: 'warning' },
  verified: { label: 'Verificado', tone: 'success' },
  rejected: { label: 'Rechazado', tone: 'danger' },
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

const ACTION_TONES: Partial<Record<DocumentAction, BadgeTone>> = { verify: 'success', reject: 'danger', delete: 'danger', purge: 'danger', upload: 'info' }

const MAX_FILE_SIZE = 10 * 1024 * 1024
const ACCEPTED_FILES = 'application/pdf,image/jpeg,image/png'

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
  return <span title={document.rejectionReason || undefined}><Badge tone={style.tone}>{style.label}</Badge></span>
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
    <Modal eyebrow={CATEGORY_LABELS[document.category]} title={isVerify ? 'Verificar documento' : 'Rechazar documento'} onClose={() => { if (!isSubmitting) onClose() }}>
      <form className="space-y-4" onSubmit={handleSubmit}>
        <div className="flex items-center gap-3 rounded-xl bg-slate-50 px-4 py-3">
          <FileText className="shrink-0 text-slate-400" size={20} aria-hidden />
          <div className="min-w-0 text-sm">
            <p className="font-medium text-ink">{personName(document.owner)}</p>
            <p className="truncate text-slate-500" title={document.originalName}>{document.originalName}</p>
          </div>
        </div>
        {isVerify ? (
          <div>
            <label className={labelClass} htmlFor="review-valid-until">Vigente hasta (opcional)</label>
            <input className={fieldClass} id="review-valid-until" type="date" value={validUntil} onChange={(event) => setValidUntil(event.target.value)} />
            <p className={hintClass}>Por ejemplo, el fin del ciclo escolar en una credencial. Después de esa fecha deja de desbloquear promociones.</p>
          </div>
        ) : (
          <div>
            <label className={labelClass} htmlFor="review-reason">Motivo</label>
            <textarea
              className={fieldClass}
              id="review-reason"
              rows={3}
              maxLength={300}
              placeholder="Ej. La foto está borrosa o el documento está vencido."
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              required
            />
            <p className={hintClass}>El titular verá este motivo para volver a subirlo.</p>
          </div>
        )}
        {error && <p className={errorAlert} role="alert">{error}</p>}
        <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
          <button className={secondaryButton} type="button" onClick={onClose} disabled={isSubmitting}>Cancelar</button>
          <button className={isVerify ? primaryButton : dangerButton} type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Guardando...' : isVerify ? 'Verificar' : 'Rechazar'}
          </button>
        </div>
      </form>
    </Modal>
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

  const pill = 'inline-flex min-h-[32px] items-center gap-1 rounded-lg px-2.5 text-xs font-semibold transition'
  return (
    <div className="flex flex-wrap items-center justify-end gap-1">
      <button className={iconButton} type="button" aria-label={`Ver ${document.originalName}`} title="Ver" onClick={() => void handleOpen(false)}>
        <Eye size={17} aria-hidden />
      </button>
      <button className={iconButton} type="button" aria-label={`Descargar ${document.originalName}`} title="Descargar" onClick={() => void handleOpen(true)}>
        <Download size={17} aria-hidden />
      </button>
      {canDelete && (
        <button className={`${iconButton} hover:bg-red-50 hover:text-red-600`} type="button" aria-label={`Eliminar ${document.originalName}`} title="Eliminar" onClick={() => void handleDelete()}>
          <Trash2 size={17} aria-hidden />
        </button>
      )}
      {canReview && document.status !== 'verified' && (
        <button className={`${pill} bg-brand-soft text-brand-text hover:bg-brand/30`} type="button" onClick={() => onReview(document, 'verified')}>
          <Check size={14} aria-hidden /> Verificar
        </button>
      )}
      {canReview && document.status !== 'rejected' && (
        <button className={`${pill} bg-red-50 text-red-700 hover:bg-red-100`} type="button" onClick={() => onReview(document, 'rejected')}>
          <X size={14} aria-hidden /> Rechazar
        </button>
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
    <Modal eyebrow="Solicitud del titular" title="Destruir documentos" onClose={() => { if (!isSubmitting) onClose() }}>
      <form className="space-y-4" onSubmit={handleSubmit}>
        <p className="flex gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <ShieldAlert className="mt-0.5 shrink-0" size={18} aria-hidden />
          Se borran para siempre todos los archivos de la persona en esta organización, incluidos los que ya se habían eliminado de la vista. No se puede deshacer. La bitácora conserva quién lo hizo y cuándo.
        </p>
        <div>
          <label className={labelClass} htmlFor="purge-person">Cliente</label>
          <select className={fieldClass} id="purge-person" value={selectedId} onChange={(event) => { setSelectedId(event.target.value); setConfirmation('') }} disabled={isLoading} required>
            <option value="">{isLoading ? 'Cargando...' : 'Selecciona un cliente'}</option>
            {people.map((person) => (
              <option key={person.id} value={person.id}>{personName(person)}{person.email ? ` · ${person.email}` : ''}</option>
            ))}
          </select>
        </div>
        {selected && (
          <div>
            <label className={labelClass} htmlFor="purge-confirmation">
              Escribe <span className="font-mono font-semibold">{PURGE_CONFIRMATION}</span> para confirmar
            </label>
            <input className={fieldClass} id="purge-confirmation" autoComplete="off" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
          </div>
        )}
        {error && <p className={errorAlert} role="alert">{error}</p>}
        <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
          <button className={secondaryButton} type="button" onClick={onClose} disabled={isSubmitting}>Cancelar</button>
          <button className={dangerButton} type="submit" disabled={!selected || confirmation.trim() !== PURGE_CONFIRMATION || isSubmitting}>
            {isSubmitting ? 'Destruyendo...' : 'Destruir documentos'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

const CLIENT_FILTERS = [['pending', 'Por revisar'], ['verified', 'Verificados'], ['rejected', 'Rechazados'], ['all', 'Todos']] as const
type ClientFilter = (typeof CLIENT_FILTERS)[number][0]

// Reception and managers check what clients upload from the app; a verified document unlocks its promotions.
function ClientDocuments({ canDelete, canPurge }: { canDelete: boolean; canPurge: boolean }) {
  const [filter, setFilter] = useState<ClientFilter>('pending')
  const [documents, setDocuments] = useState<GymDocument[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reviewTarget, setReviewTarget] = useState<ReviewTarget | null>(null)
  const [isPurgeOpen, setIsPurgeOpen] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const status: DocumentStatus | '' = filter === 'all' ? '' : filter

  const refresh = useCallback(() => {
    getDocuments({ kind: 'client', ...(status ? { status } : {}) })
      .then((response) => setDocuments(response.documents))
      .catch((requestError: unknown) => setError(errorMessage(requestError, 'No se pudieron cargar los documentos.')))
      .finally(() => setIsLoading(false))
  }, [status])

  useEffect(refresh, [refresh])
  useDocumentEvents(refresh)

  const actions = (document: GymDocument) => (
    <DocumentActions
      document={document}
      canReview
      canDelete={canDelete}
      onReview={(target, decision) => setReviewTarget({ document: target, decision })}
      onDeleted={refresh}
      onError={setError}
    />
  )
  const validity = (document: GymDocument) => document.status === 'verified' ? (document.validUntil ? `Vigente hasta ${formatDate(document.validUntil)}` : 'Sin vencimiento') : null

  return (
    <Panel
      title="Documentos de clientes"
      icon={FolderOpen}
      description="Credenciales y comprobantes que los clientes suben desde la app."
      actions={canPurge && (
        <button className={`${secondaryButton} border-red-200 text-red-700 hover:border-red-300 hover:bg-red-50`} type="button" onClick={() => { setNotice(null); setIsPurgeOpen(true) }}>
          <Trash2 size={16} aria-hidden /> Destruir documentos
        </button>
      )}
    >
      <div className="-mx-1 overflow-x-auto px-1 pb-1">
        <Segmented label="Estado" value={filter} options={CLIENT_FILTERS} onChange={(next) => { setIsLoading(true); setFilter(next) }} />
      </div>

      {notice && <p className={`${successAlert} mt-4`} role="status">{notice}</p>}
      {error && <p className={`${errorAlert} mt-4`} role="alert">{error}</p>}

      <div className="mt-4">
        {isLoading ? (
          <div className="space-y-3" aria-busy="true" aria-label="Cargando documentos">
            {Array.from({ length: 4 }).map((_, index) => <div className="skeleton h-14 w-full" key={index} />)}
          </div>
        ) : documents.length === 0 ? (
          <EmptyState icon={filter === 'pending' ? CircleCheck : FolderOpen} title={filter === 'pending' ? 'Todo revisado' : 'Sin documentos'}>
            {filter === 'pending' ? 'Cuando un cliente suba un documento desde la app aparecerá aquí para revisarlo.' : 'No hay documentos con este estado.'}
          </EmptyState>
        ) : (
          <>
            <ul className="space-y-3 md:hidden">
              {documents.map((document) => (
                <li className="rounded-xl border border-slate-200 p-4" key={document.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-ink">{personName(document.owner)}</p>
                      <p className="text-sm text-slate-600">{CATEGORY_LABELS[document.category]}</p>
                      <p className="truncate text-xs text-slate-500">{document.originalName} · {formatDate(document.createdAt)}</p>
                    </div>
                    <StatusBadge document={document} />
                  </div>
                  {document.status === 'rejected' && document.rejectionReason && <p className="mt-2 text-xs text-slate-500">Motivo: {document.rejectionReason}</p>}
                  {validity(document) && <p className="mt-2 text-xs text-slate-500">{validity(document)}</p>}
                  <div className="mt-3 border-t border-slate-100 pt-3">{actions(document)}</div>
                </li>
              ))}
            </ul>

            <div className="-mx-5 hidden overflow-x-auto sm:-mx-6 md:block">
              <table className="min-w-full text-left text-sm">
                <thead className={tableHeadClass}>
                  <tr>
                    <th className={thClass}>Cliente</th>
                    <th className={thClass}>Documento</th>
                    <th className={thClass}>Subido</th>
                    <th className={thClass}>Estado</th>
                    <th className={thClass}><span className="sr-only">Acciones</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {documents.map((document) => (
                    <tr className="align-top transition-colors hover:bg-slate-50/70" key={document.id}>
                      <td className={`${tdClass} whitespace-nowrap`}>
                        <p className="font-semibold text-ink">{personName(document.owner)}</p>
                        {typeof document.owner === 'object' && document.owner?.email && <p className="text-xs text-slate-500">{document.owner.email}</p>}
                      </td>
                      <td className={tdClass}>
                        <p className="text-ink">{CATEGORY_LABELS[document.category]}</p>
                        <p className="max-w-56 truncate text-xs text-slate-500" title={document.originalName}>{document.originalName}</p>
                      </td>
                      <td className={`${tdClass} whitespace-nowrap text-slate-500`}>{formatDate(document.createdAt)}</td>
                      <td className={tdClass}>
                        <StatusBadge document={document} />
                        {document.status === 'rejected' && document.rejectionReason && <p className="mt-1 max-w-48 text-xs text-slate-500">{document.rejectionReason}</p>}
                        {validity(document) && <p className="mt-1 text-xs text-slate-500">{validity(document)}</p>}
                      </td>
                      <td className={tdClass}>{actions(document)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
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
    </Panel>
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
    <label className={`${secondaryButton} min-h-[36px] shrink-0 cursor-pointer px-3 py-1.5 ${isUploading ? 'pointer-events-none opacity-50' : ''}`} htmlFor={inputId}>
      <Upload size={15} aria-hidden /> {isUploading ? 'Subiendo...' : 'Subir'}
      <input className="sr-only" id={inputId} type="file" accept={ACCEPTED_FILES} onChange={(event) => void handleChange(event)} disabled={isUploading} />
    </label>
  )
}

function ProgressBar({ value, max }: { value: number; max: number }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-slate-200/70" aria-hidden="true">
      <div className={`h-full rounded-full ${value >= max ? 'bg-brand-press' : 'bg-amber-400'}`} style={{ width: `${max ? (value / max) * 100 : 0}%` }} />
    </div>
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
    return <div className="skeleton h-64 w-full rounded-card" aria-label="Cargando expedientes" aria-busy="true" />
  }

  return (
    <div className="space-y-4">
      {error && <p className={errorAlert} role="alert">{error}</p>}
      {staff.length === 0 ? (
        <Panel title="Expediente del personal" icon={FolderOpen}>
          <EmptyState icon={FolderOpen} title="Sin personal">Agrega trabajadores en Usuarios para armar su expediente.</EmptyState>
        </Panel>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
          {/* Phones pick the employee from a list box; wider screens get the full roster with progress. */}
          <div className="lg:hidden">
            <label className={labelClass} htmlFor="staff-member">Empleado</label>
            <select className={fieldClass} id="staff-member" value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
              {staff.map((user) => (
                <option key={userId(user)} value={userId(user)}>{userName(user)} · {progress(userId(user))}/{STAFF_CATEGORIES.length}</option>
              ))}
            </select>
          </div>
          <Panel className="hidden h-fit lg:block" title="Personal" description={`${staff.length} empleado${staff.length === 1 ? '' : 's'}`}>
            <ul className="-mx-2 space-y-1">
              {staff.map((user) => {
                const id = userId(user)
                const done = progress(id)
                const isActive = id === selectedId
                return (
                  <li key={id}>
                    <button
                      className={`w-full rounded-xl px-3 py-2.5 text-left transition ${isActive ? 'bg-slate-100' : 'hover:bg-slate-50'}`}
                      type="button"
                      aria-pressed={isActive}
                      onClick={() => setSelectedId(id)}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className={`truncate text-sm ${isActive ? 'font-semibold text-ink' : 'text-slate-700'}`}>{userName(user)}</span>
                        <span className="shrink-0 text-xs text-slate-500 tabular">{done}/{STAFF_CATEGORIES.length}</span>
                      </span>
                      <span className="mt-1.5 block"><ProgressBar value={done} max={STAFF_CATEGORIES.length} /></span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </Panel>

          {selected && (
            <Panel
              title={userName(selected)}
              description={selected.email}
              actions={<Badge tone={progress(selectedId) >= STAFF_CATEGORIES.length ? 'success' : 'warning'}>{progress(selectedId)} de {STAFF_CATEGORIES.length} verificados</Badge>}
            >
              <ul className="-my-3 divide-y divide-slate-100">
                {[...STAFF_CATEGORIES, 'other' as const].map((category) => {
                  const files = selectedDocuments.filter((document) => document.category === category)
                  const isVerified = files.some((document) => document.status === 'verified')
                  return (
                    <li className="py-4" key={category}>
                      <div className="flex items-center justify-between gap-4">
                        <p className="flex items-center gap-2.5 font-medium text-ink">
                          <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full ${isVerified ? 'bg-brand text-brand-ink' : 'border border-dashed border-slate-300 text-transparent'}`} aria-hidden="true">
                            <Check size={14} />
                          </span>
                          {CATEGORY_LABELS[category]}
                          {category === 'other' && <span className="text-xs font-normal text-slate-400">opcional</span>}
                        </p>
                        <UploadButton ownerId={selectedId} category={category} onUploaded={refresh} onError={setError} />
                      </div>
                      {files.length > 0 ? (
                        <ul className="mt-3 space-y-2 pl-8">
                          {files.map((document) => (
                            <li className="flex flex-col gap-2 rounded-xl bg-slate-50 px-4 py-3 lg:flex-row lg:items-center lg:justify-between" key={document.id}>
                              <div className="min-w-0">
                                <p className="truncate text-sm text-ink" title={document.originalName}>{document.originalName}</p>
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
                        category !== 'other' && <p className="mt-1 pl-8 text-sm text-slate-400">Falta este documento.</p>
                      )}
                    </li>
                  )
                })}
              </ul>
            </Panel>
          )}
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
    <Panel title="Bitácora de documentos" icon={ScrollText} description="Quién consultó, descargó, revisó o eliminó cada documento. Los registros no se pueden editar.">
      <div className="flex flex-col gap-3 sm:flex-row">
        <label className="relative block w-full sm:max-w-xs">
          <span className="sr-only">Buscar</span>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} aria-hidden />
          <input className={`${fieldClass} pl-10`} type="search" placeholder="Buscar persona o archivo" value={search} onChange={(event) => setSearch(event.target.value)} />
        </label>
        <label className="sr-only" htmlFor="log-action">Acción</label>
        <select className={`${fieldClass} sm:w-52`} id="log-action" value={action} onChange={(event) => setAction(event.target.value as DocumentAction | '')}>
          <option value="">Todas las acciones</option>
          {Object.entries(ACTION_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>

      {error && <p className={`${errorAlert} mt-4`} role="alert">{error}</p>}

      <div className="mt-4">
        {isLoading ? (
          <div className="space-y-3" aria-busy="true" aria-label="Cargando bitácora">
            {Array.from({ length: 5 }).map((_, index) => <div className="skeleton h-12 w-full" key={index} />)}
          </div>
        ) : visibleLogs.length === 0 ? (
          <EmptyState icon={ScrollText} title="Sin movimientos">No hay movimientos con estos filtros.</EmptyState>
        ) : (
          <div className="-mx-5 overflow-x-auto sm:-mx-6">
            <table className="min-w-full text-left text-sm">
              <thead className={tableHeadClass}>
                <tr>
                  <th className={thClass}>Fecha</th>
                  <th className={thClass}>Persona</th>
                  <th className={thClass}>Acción</th>
                  <th className={thClass}>Documento</th>
                  <th className={thClass}>Titular</th>
                  <th className={thClass}>IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {visibleLogs.map((log) => (
                  <tr className="transition-colors hover:bg-slate-50/70" key={log.id}>
                    <td className={`${tdClass} whitespace-nowrap text-slate-500 tabular`}>{formatDate(log.createdAt, true)}</td>
                    <td className={`${tdClass} whitespace-nowrap font-semibold text-ink`}>{personName(log.actor)}</td>
                    <td className={tdClass}><Badge tone={ACTION_TONES[log.action] ?? 'neutral'}>{ACTION_LABELS[log.action]}</Badge></td>
                    <td className={tdClass}>
                      {log.document ? (
                        <>
                          <p className="text-ink">{CATEGORY_LABELS[log.document.category]}</p>
                          <p className="max-w-56 truncate text-xs text-slate-500" title={log.document.originalName}>{log.document.originalName}</p>
                        </>
                      ) : '—'}
                    </td>
                    <td className={`${tdClass} whitespace-nowrap`}>{personName(log.owner)}</td>
                    <td className={`${tdClass} whitespace-nowrap font-mono text-xs text-slate-500`}>{log.ip || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {logs.length >= 500 && <p className={hintClass}>Se muestran los 500 movimientos más recientes.</p>}
    </Panel>
  )
}

type Tab = 'clientes' | 'personal' | 'bitacora'

function Documents() {
  const { session, organizationGyms } = useAuth()
  const isAdmin = useStaffRoles().has('Admin')
  // The log and hiring files of other managers are for the owner; platform admins act as owners.
  const isOwner = Boolean(session?.user.isPlatformAdmin) || organizationGyms.some((gym) => gym.roles.includes('Propietario'))
  const tabs: Array<readonly [Tab, string]> = [
    ['clientes', 'Clientes'],
    ...(isAdmin ? [['personal', 'Expediente del personal'] as const] : []),
    ...(isOwner ? [['bitacora', 'Bitácora'] as const] : []),
  ]
  const [activeTab, setActiveTab] = useState<Tab>('clientes')

  return (
    <section className="min-h-screen bg-canvas px-4 py-8 sm:px-8 sm:py-10">
      <PageHeader
        eyebrow="Operación"
        title="Documentos"
        description="Revisa lo que suben los clientes, arma el expediente del personal y consulta quién accedió a cada archivo."
      />

      {tabs.length > 1 && (
        <div className="mt-6 overflow-x-auto pb-1">
          <Segmented label="Sección" value={activeTab} options={tabs} onChange={setActiveTab} />
        </div>
      )}

      <div className="mt-4">
        {activeTab === 'clientes' && <ClientDocuments canDelete={isAdmin} canPurge={isOwner} />}
        {activeTab === 'personal' && isAdmin && <StaffDocuments />}
        {activeTab === 'bitacora' && isOwner && <AccessLog />}
      </div>
    </section>
  )
}

export default Documents
