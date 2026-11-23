import { useEffect, useState } from 'react'
import { Building2, Check, Clock, Copy, KeyRound, MapPin, Pencil, Plus, Printer, QrCode, RefreshCw, ShieldOff, Users } from 'lucide-react'
import QRCode from 'qrcode'
import GymSelect from '../components/GymSelect'
import {
  createAccessDevice,
  createGym,
  getAccessDevices,
  getGyms,
  regenerateJoinCode,
  revokeAccessDevice,
  updateGym,
} from '../services/api'
import type { AccessDevice, Gym, GymLimits } from '../services/api'
import { useAuth } from '../store/useAuth'
import { useStaffRoles } from '../utils/access'
import { targetGymField } from '../utils/targetGym'
import PageHeader from '../components/ui/PageHeader'
import Panel from '../components/ui/Panel'
import Modal from '../components/ui/Modal'
import Badge from '../components/ui/Badge'
import EmptyState from '../components/ui/EmptyState'
import {
  errorAlert,
  fieldClass,
  hintClass,
  labelClass,
  primaryButton,
  secondaryButton,
  tableHeadClass,
  tdClass,
  thClass,
} from '../components/ui/styles'

// The app opens its join screen from this link; the printed QR holds it.
function joinLink(code: string) {
  return `projectgymgo://join-gym?code=${encodeURIComponent(code)}`
}

function formatDate(value: string | null) {
  if (!value) return 'Nunca'
  return new Intl.DateTimeFormat('es-MX', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
}

// The QR image for a code; null while it is drawn, so a new code never shows the old QR.
function useJoinQr(code: string | null) {
  const [qr, setQr] = useState<{ code: string; url: string } | null>(null)
  useEffect(() => {
    let isMounted = true
    if (!code) return
    QRCode.toDataURL(joinLink(code), { width: 640, margin: 1 })
      .then((url) => { if (isMounted) setQr({ code, url }) })
      .catch(() => { if (isMounted) setQr(null) })
    return () => { isMounted = false }
  }, [code])
  return qr && qr.code === code ? qr.url : null
}

// A sheet for the front desk: the QR plus the code for clients who type it.
function printJoinSheet(gym: Gym, qrDataUrl: string) {
  const sheet = window.open('', '_blank', 'width=600,height=800')
  if (!sheet) throw new Error('El navegador bloqueó la ventana de impresión.')
  const doc = sheet.document
  doc.title = `Código de ${gym.name}`
  doc.body.style.cssText = 'font-family: system-ui, sans-serif; text-align: center; padding: 48px; color: #0F172A;'

  const append = (tag: string, text: string, style: string) => {
    const element = doc.createElement(tag)
    element.textContent = text
    element.style.cssText = style
    doc.body.appendChild(element)
  }
  append('h1', gym.name, 'font-size: 32px; margin: 0;')
  append('p', 'Escanea con la app GymGo o ingresa el código para unirte.', 'font-size: 16px; color: #475569;')
  const image = doc.createElement('img')
  image.style.cssText = 'width: 320px; height: 320px; margin: 24px auto; display: block;'
  image.onload = () => {
    sheet.focus()
    sheet.print()
  }
  image.src = qrDataUrl
  doc.body.appendChild(image)
  append('p', gym.joinCode ?? '', 'font-size: 40px; font-weight: 700; letter-spacing: 0.3em; margin: 0;')
  append('p', 'Unirte es gratis. Para entrar necesitas una membresía activa; adquiérela en recepción.', 'font-size: 14px; color: #64748B; margin-top: 24px;')
}

interface GymCardProps {
  gym: Gym
  canManage: boolean
  onRegenerate: (gym: Gym) => Promise<void>
  onEdit: (gym: Gym) => void
  onError: (message: string) => void
}

function GymCard({ gym, canManage, onRegenerate, onEdit, onError }: GymCardProps) {
  const qrDataUrl = useJoinQr(gym.joinCode)
  const [isRegenerating, setIsRegenerating] = useState(false)
  const [copied, setCopied] = useState(false)

  async function handleRegenerate() {
    if (!window.confirm(`El código actual de ${gym.name} dejará de funcionar y tendrás que volver a imprimir el QR. Los clientes que ya se unieron no se ven afectados. ¿Continuar?`)) return
    setIsRegenerating(true)
    try {
      await onRegenerate(gym)
    } finally {
      setIsRegenerating(false)
    }
  }

  function handlePrint() {
    if (!qrDataUrl) return
    try {
      printJoinSheet(gym, qrDataUrl)
    } catch (printError) {
      onError(printError instanceof Error ? printError.message : 'No se pudo abrir la impresión.')
    }
  }

  async function handleCopy() {
    if (!gym.joinCode) return
    try {
      await navigator.clipboard.writeText(gym.joinCode)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      onError('No se pudo copiar el código.')
    }
  }

  return (
    <article className="flex flex-col overflow-hidden rounded-card border border-slate-200/80 bg-white shadow-card">
      <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 sm:px-6">
        <div className="min-w-0">
          <h2 className="truncate font-display text-2xl font-bold tracking-tight text-ink">{gym.name}</h2>
          <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
            {gym.address && <span className="inline-flex items-center gap-1.5"><MapPin size={14} aria-hidden /> {gym.address}</span>}
            <span className="inline-flex items-center gap-1.5"><Clock size={14} aria-hidden /> {gym.timezone}</span>
            <span className="inline-flex items-center gap-1.5"><Users size={14} aria-hidden /> {gym.capacity ? `Aforo ${gym.capacity.toLocaleString('es-MX')}` : 'Sin aforo definido'}</span>
          </p>
        </div>
        {canManage && (
          <button className={`${secondaryButton} shrink-0 px-3`} type="button" onClick={() => onEdit(gym)} aria-label={`Editar ${gym.name}`}>
            <Pencil size={16} aria-hidden /> <span className="hidden sm:inline">Editar</span>
          </button>
        )}
      </header>

      <div className="flex flex-1 flex-col gap-5 p-5 sm:flex-row sm:p-6">
        <div className="grid h-40 w-40 shrink-0 place-items-center self-center rounded-xl border border-slate-200 bg-white p-2 sm:self-start">
          {qrDataUrl
            ? <img className="h-full w-full" src={qrDataUrl} alt={`QR para unirse a ${gym.name}`} />
            : gym.joinCode
              ? <div className="skeleton h-full w-full" aria-label="Generando QR" />
              : <span className="flex flex-col items-center gap-2 text-xs text-slate-400"><QrCode size={28} aria-hidden /> Sin código</span>}
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Código para unirse</p>
          <div className="mt-2 flex items-center gap-2">
            <p className="select-all font-mono text-3xl font-semibold tracking-[0.25em] text-ink tabular">{gym.joinCode ?? '—'}</p>
            {gym.joinCode && (
              <button
                className="grid h-9 w-9 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-ink"
                type="button"
                aria-label={copied ? 'Código copiado' : 'Copiar código'}
                title={copied ? 'Copiado' : 'Copiar'}
                onClick={() => void handleCopy()}
              >
                {copied ? <Check size={17} className="text-brand-text" aria-hidden /> : <Copy size={17} aria-hidden />}
              </button>
            )}
          </div>
          <p className="mt-2 text-sm text-slate-500">El cliente lo escanea o lo escribe en la app. Para entrar sigue necesitando una membresía activa.</p>

          <div className="mt-auto flex flex-wrap gap-2 pt-5">
            <button className={primaryButton} type="button" onClick={handlePrint} disabled={!qrDataUrl}>
              <Printer size={16} aria-hidden /> Imprimir QR
            </button>
            {canManage && (
              <button
                className={`${secondaryButton} hover:border-red-200 hover:bg-red-50 hover:text-red-700`}
                type="button"
                onClick={() => void handleRegenerate()}
                disabled={isRegenerating}
              >
                <RefreshCw size={16} className={isRegenerating ? 'animate-spin' : undefined} aria-hidden /> {isRegenerating ? 'Generando...' : 'Código nuevo'}
              </button>
            )}
          </div>
        </div>
      </div>
    </article>
  )
}

interface DevicesSectionProps {
  gyms: Gym[]
  onError: (message: string | null) => void
}

// Turnstiles get their own key, bound to one gym. The key is shown once, at creation.
function DevicesSection({ gyms, onError }: DevicesSectionProps) {
  const { isAllGyms } = useAuth()
  const [devices, setDevices] = useState<AccessDevice[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [name, setName] = useState('')
  const [gymId, setGymId] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [modalError, setModalError] = useState<string | null>(null)
  const [newKey, setNewKey] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  async function refreshDevices() {
    const response = await getAccessDevices()
    setDevices(response.devices)
  }

  useEffect(() => {
    let isMounted = true
    getAccessDevices()
      .then((response) => { if (isMounted) setDevices(response.devices) })
      .catch((requestError: unknown) => {
        if (isMounted) onError(requestError instanceof Error ? requestError.message : 'No se pudieron cargar los torniquetes.')
      })
      .finally(() => { if (isMounted) setIsLoading(false) })
    return () => { isMounted = false }
  }, [onError])

  function openModal() {
    setName(''); setGymId(''); setModalError(null); setNewKey(null); setCopied(false)
    setIsModalOpen(true)
  }

  function closeModal() {
    if (isSubmitting) return
    setIsModalOpen(false)
    setNewKey(null)
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setModalError(null); setIsSubmitting(true)
    try {
      const response = await createAccessDevice({ name: name.trim(), ...targetGymField(isAllGyms, gymId) })
      setNewKey(response.key)
      await refreshDevices()
    } catch (requestError) {
      setModalError(requestError instanceof Error ? requestError.message : 'No se pudo registrar el torniquete.')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleCopy() {
    if (!newKey) return
    try {
      await navigator.clipboard.writeText(newKey)
      setCopied(true)
    } catch {
      setModalError('No se pudo copiar. Selecciona la llave y cópiala manualmente.')
    }
  }

  async function handleRevoke(device: AccessDevice) {
    if (!window.confirm(`${device.name} dejará de registrar accesos de inmediato. ¿Revocar su llave?`)) return
    onError(null)
    try {
      await revokeAccessDevice(device.id)
      await refreshDevices()
    } catch (requestError) {
      onError(requestError instanceof Error ? requestError.message : 'No se pudo revocar el torniquete.')
    }
  }

  const gymName = (id: string) => gyms.find((gym) => gym.id === id)?.name ?? 'Sucursal'
  const activeCount = devices.filter((device) => !device.revokedAt).length

  return (
    <Panel
      className="mt-6"
      title="Torniquetes"
      icon={KeyRound}
      description={isLoading ? 'Cada torniquete tiene su propia llave y registra los accesos de su sucursal.' : `${activeCount} activo${activeCount === 1 ? '' : 's'} · cada uno con su propia llave para registrar los accesos de su sucursal.`}
      actions={(
        <button className={secondaryButton} type="button" onClick={openModal}>
          <Plus size={18} aria-hidden /> Nuevo torniquete
        </button>
      )}
    >
      {isLoading ? (
        <div className="space-y-3" aria-label="Cargando torniquetes" aria-busy="true">
          {Array.from({ length: 3 }).map((_, index) => <div className="skeleton h-12 w-full" key={index} />)}
        </div>
      ) : devices.length === 0 ? (
        <EmptyState icon={KeyRound} title="Aún no hay torniquetes">
          Registra uno para obtener la llave que configura el equipo de acceso.
        </EmptyState>
      ) : (
        <div className="-mx-5 overflow-x-auto sm:-mx-6">
          <table className="min-w-full text-left text-sm">
            <thead className={tableHeadClass}>
              <tr>
                <th className={thClass}>Nombre</th>
                <th className={thClass}>Sucursal</th>
                <th className={thClass}>Llave</th>
                <th className={thClass}>Última conexión</th>
                <th className={thClass}>Estado</th>
                <th className={thClass}><span className="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {devices.map((device) => (
                <tr className={`transition-colors hover:bg-slate-50 ${device.revokedAt ? 'text-slate-400' : ''}`} key={device.id}>
                  <td className={`${tdClass} whitespace-nowrap font-medium ${device.revokedAt ? 'text-slate-500' : 'text-ink'}`}>{device.name}</td>
                  <td className={`${tdClass} whitespace-nowrap`}>{gymName(device.gymId)}</td>
                  <td className={`${tdClass} whitespace-nowrap font-mono text-xs text-slate-500`}>{device.keyPreview}…</td>
                  <td className={`${tdClass} whitespace-nowrap text-slate-500 tabular`}>{formatDate(device.lastSeenAt)}</td>
                  <td className={tdClass}>
                    {device.revokedAt ? <Badge tone="danger">Revocado</Badge> : <Badge tone="success">Activo</Badge>}
                  </td>
                  <td className={`${tdClass} whitespace-nowrap text-right`}>
                    {!device.revokedAt && (
                      <button
                        className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-500 transition hover:bg-red-50 hover:text-red-700"
                        type="button"
                        onClick={() => void handleRevoke(device)}
                      >
                        <ShieldOff size={15} aria-hidden /> Revocar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {isModalOpen && (
        <Modal eyebrow="Acceso" title={newKey ? 'Llave del torniquete' : 'Nuevo torniquete'} onClose={closeModal}>
          {newKey ? (
            <div className="space-y-4">
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                Copia esta llave y configúrala en el torniquete (encabezado <span className="font-mono">X-Device-Key</span>). No se volverá a mostrar; si se pierde, revoca el torniquete y registra uno nuevo.
              </p>
              <p className="select-all break-all rounded-xl bg-slate-50 px-4 py-3 font-mono text-sm text-ink ring-1 ring-inset ring-slate-200">{newKey}</p>
              {modalError && <p className={errorAlert} role="alert">{modalError}</p>}
              <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
                <button className={secondaryButton} type="button" onClick={() => void handleCopy()}>
                  {copied ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />} {copied ? 'Copiada' : 'Copiar llave'}
                </button>
                <button className={primaryButton} type="button" onClick={closeModal}>Listo</button>
              </div>
            </div>
          ) : (
            <form className="space-y-5" onSubmit={handleSubmit}>
              <div>
                <label className={labelClass} htmlFor="device-name">Nombre</label>
                <input
                  className={fieldClass}
                  id="device-name"
                  placeholder="Ej. Torniquete entrada principal"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  minLength={2}
                  maxLength={80}
                  required
                />
              </div>
              <GymSelect id="device-gym" label="Sucursal del torniquete" value={gymId} onChange={setGymId} />
              {modalError && <p className={errorAlert} role="alert">{modalError}</p>}
              <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
                <button className={secondaryButton} type="button" onClick={closeModal} disabled={isSubmitting}>Cancelar</button>
                <button className={primaryButton} type="submit" disabled={isSubmitting}>
                  {isSubmitting ? 'Registrando...' : 'Registrar'}
                </button>
              </div>
            </form>
          )}
        </Modal>
      )}
    </Panel>
  )
}

// Mexican zones first; the rest come from the browser's list.
const MEXICO_TIMEZONES = ['America/Mexico_City', 'America/Monterrey', 'America/Merida', 'America/Cancun', 'America/Chihuahua', 'America/Hermosillo', 'America/Mazatlan', 'America/Tijuana']
const OTHER_TIMEZONES = Intl.supportedValuesOf('timeZone').filter((zone) => !MEXICO_TIMEZONES.includes(zone))

function currentTime(timezone: string) {
  return new Intl.DateTimeFormat('es-MX', { timeZone: timezone, timeStyle: 'short' }).format(new Date())
}

interface GymDialogProps {
  // Editing this gym; without it a new one is opened.
  gym?: Gym
  onClose: () => void
  onSaved: () => Promise<void>
}

function GymDialog({ gym, onClose, onSaved }: GymDialogProps) {
  const [name, setName] = useState(gym?.name ?? '')
  const [address, setAddress] = useState(gym?.address ?? '')
  const [timezone, setTimezone] = useState(gym?.timezone ?? 'America/Mexico_City')
  const [capacity, setCapacity] = useState(gym?.capacity ? String(gym.capacity) : '')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const timezoneChanged = Boolean(gym && gym.timezone !== timezone)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(null); setIsSubmitting(true)
    try {
      const payload = { name: name.trim(), address: address.trim(), timezone, capacity: capacity ? Number(capacity) : null }
      if (gym) await updateGym(gym.id, payload)
      else await createGym(payload)
      await onSaved()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : gym ? 'No se pudo guardar la sucursal.' : 'No se pudo abrir la sucursal.')
      setIsSubmitting(false)
    }
  }

  return (
    <Modal eyebrow="Sucursales" title={gym ? `Editar ${gym.name}` : 'Nueva sucursal'} onClose={() => { if (!isSubmitting) onClose() }}>
      <form className="space-y-5" onSubmit={handleSubmit}>
        {!gym && <p className="-mt-1 text-sm text-slate-500">Tendrá su propio código para que los clientes se unan desde la app.</p>}
        <div>
          <label className={labelClass} htmlFor="gym-name">Nombre</label>
          <input
            className={fieldClass}
            id="gym-name"
            placeholder="Ej. Sucursal Norte"
            value={name}
            onChange={(event) => setName(event.target.value)}
            minLength={2}
            maxLength={120}
            required
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="gym-address">Dirección <span className="font-normal text-slate-400">(opcional)</span></label>
          <input
            className={fieldClass}
            id="gym-address"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            maxLength={200}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_10rem]">
          <div>
            <label className={labelClass} htmlFor="gym-timezone">Zona horaria</label>
            <select className={fieldClass} id="gym-timezone" value={timezone} onChange={(event) => setTimezone(event.target.value)} aria-describedby="gym-timezone-hint">
              <optgroup label="México">
                {MEXICO_TIMEZONES.map((zone) => <option key={zone} value={zone}>{zone.replace('America/', '').replace('_', ' ')} ({zone})</option>)}
              </optgroup>
              <optgroup label="Otras">
                {OTHER_TIMEZONES.map((zone) => <option key={zone} value={zone}>{zone}</option>)}
              </optgroup>
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="gym-capacity">Aforo máximo</label>
            <input
              className={fieldClass}
              id="gym-capacity"
              type="number"
              inputMode="numeric"
              min={1}
              max={100000}
              placeholder="Sin límite"
              value={capacity}
              onChange={(event) => setCapacity(event.target.value)}
              aria-describedby="gym-capacity-hint"
            />
          </div>
        </div>
        <div className="-mt-2 space-y-1">
          <p className={hintClass} id="gym-timezone-hint">
            Hora local ahora: <span className="font-medium text-slate-700 tabular">{currentTime(timezone)}</span>. Define los horarios de los planes, los días de asistencia y la bitácora de accesos.
          </p>
          <p className="text-xs text-slate-500" id="gym-capacity-hint">Aforo: personas dentro al mismo tiempo; el monitor de aforo avisa al acercarse.</p>
        </div>
        {timezoneChanged && (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Los horarios de acceso de los planes se evaluarán con la nueva zona desde que guardes.
          </p>
        )}
        {error && <p className={errorAlert} role="alert">{error}</p>}
        <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
          <button className={secondaryButton} type="button" onClick={onClose} disabled={isSubmitting}>Cancelar</button>
          <button className={primaryButton} type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Guardando...' : gym ? 'Guardar cambios' : 'Abrir sucursal'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function Gyms() {
  const canManage = useStaffRoles().has('Admin')
  const { session, organizationGyms, refreshSession } = useAuth()
  // Only the owner (or SIRID) opens gyms; managers also act as Admin but cannot.
  const isOwner = Boolean(session?.user.isPlatformAdmin) || organizationGyms.some((gym) => gym.roles.includes('Propietario'))
  const [gyms, setGyms] = useState<Gym[]>([])
  const [limits, setLimits] = useState<GymLimits | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // 'new' opens an empty form; a gym opens it for editing.
  const [dialog, setDialog] = useState<'new' | Gym | null>(null)
  const isAtLimit = Boolean(limits && limits.activeGyms >= limits.gymLimit)

  async function handleGymSaved() {
    const response = await getGyms()
    setGyms(response.gyms)
    setLimits(response.limits ?? null)
    setDialog(null)
    // A new or renamed gym shows up in the sidebar selector.
    await refreshSession()
  }

  useEffect(() => {
    let isMounted = true
    getGyms()
      .then((response) => {
        if (!isMounted) return
        setGyms(response.gyms)
        setLimits(response.limits ?? null)
      })
      .catch((requestError: unknown) => {
        if (isMounted) setError(requestError instanceof Error ? requestError.message : 'No se pudieron cargar las sucursales.')
      })
      .finally(() => { if (isMounted) setIsLoading(false) })
    return () => { isMounted = false }
  }, [])

  async function handleRegenerate(gym: Gym) {
    setError(null)
    try {
      const response = await regenerateJoinCode(gym.id)
      setGyms((current) => current.map((item) => item.id === gym.id ? response.gym : item))
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No se pudo generar el código.')
    }
  }

  return (
    <section className="min-h-screen bg-canvas px-4 py-8 sm:px-8 sm:py-10">
      <PageHeader
        eyebrow="Operación"
        title="Gimnasios"
        description={`Códigos para que los clientes se unan desde la app${canManage ? ' y torniquetes de cada sucursal' : ''}.`}
        actions={isOwner && limits && (
          <>
            <Badge tone={isAtLimit ? 'warning' : 'neutral'} icon={Building2}>{limits.activeGyms} de {limits.gymLimit} sucursales</Badge>
            <button
              className={primaryButton}
              type="button"
              onClick={() => setDialog('new')}
              disabled={isAtLimit}
              title={isAtLimit ? 'Llegaste al límite de tu plan. Contacta a SIRID para ampliarlo.' : undefined}
            >
              <Plus size={18} aria-hidden /> Nueva sucursal
            </button>
          </>
        )}
      />
      {isOwner && isAtLimit && (
        <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Llegaste al límite de sucursales de tu plan. Contacta a SIRID para ampliarlo.
        </p>
      )}

      {error && <p className={`${errorAlert} mt-6`} role="alert">{error}</p>}

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        {isLoading
          ? Array.from({ length: 2 }).map((_, index) => <div className="skeleton h-72 w-full rounded-card" key={index} />)
          : gyms.length
            ? gyms.map((gym) => <GymCard key={gym.id} gym={gym} canManage={canManage} onRegenerate={handleRegenerate} onEdit={setDialog} onError={setError} />)
            : (
              <div className="rounded-card border border-slate-200/80 bg-white p-5 shadow-card xl:col-span-2">
                <EmptyState icon={Building2} title="No hay sucursales activas">
                  {isOwner ? 'Abre tu primera sucursal para obtener su código de registro.' : 'Cuando el propietario abra una sucursal aparecerá aquí.'}
                </EmptyState>
              </div>
            )}
      </div>

      {canManage && !isLoading && <DevicesSection gyms={gyms} onError={setError} />}

      {dialog && <GymDialog gym={dialog === 'new' ? undefined : dialog} onClose={() => setDialog(null)} onSaved={handleGymSaved} />}
    </section>
  )
}

export default Gyms
