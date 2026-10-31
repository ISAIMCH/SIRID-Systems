import { useEffect, useState } from 'react'
import { Copy, Plus, Printer, RefreshCw } from 'lucide-react'
import QRCode from 'qrcode'
import GymSelect from '../components/GymSelect'
import {
  createAccessDevice,
  createGym,
  getAccessDevices,
  getGyms,
  regenerateJoinCode,
  revokeAccessDevice,
} from '../services/api'
import type { AccessDevice, Gym, GymLimits } from '../services/api'
import { useAuth } from '../store/useAuth'
import { useStaffRoles } from '../utils/access'
import { targetGymField } from '../utils/targetGym'

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
  onError: (message: string) => void
}

function GymCard({ gym, canManage, onRegenerate, onError }: GymCardProps) {
  const qrDataUrl = useJoinQr(gym.joinCode)
  const [isRegenerating, setIsRegenerating] = useState(false)

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

  return (
    <article className="flex flex-col gap-6 rounded-xl border border-slate-100 bg-white p-6 shadow-sm sm:flex-row">
      <div className="flex h-40 w-40 shrink-0 items-center justify-center self-center rounded-lg border border-slate-100 bg-white sm:self-start">
        {qrDataUrl
          ? <img className="h-full w-full" src={qrDataUrl} alt={`QR para unirse a ${gym.name}`} />
          : <span className="px-4 text-center text-xs text-slate-400">{gym.joinCode ? 'Generando QR...' : 'Sin código'}</span>}
      </div>
      <div className="min-w-0 flex-1">
        <h2 className="text-xl font-semibold text-slate-900">{gym.name}</h2>
        {gym.address && <p className="mt-1 text-sm text-slate-500">{gym.address}</p>}
        <p className="mt-5 text-xs font-medium uppercase tracking-[0.2em] text-slate-500">Código para unirse</p>
        <p className="mt-1 font-mono text-3xl font-semibold tracking-[0.25em] text-slate-900">{gym.joinCode ?? '—'}</p>
        <p className="mt-2 text-sm text-slate-500">El cliente lo escanea o lo escribe en la app. Para entrar sigue necesitando una membresía activa.</p>
        <div className="mt-5 flex flex-wrap gap-3">
          <button
            className="inline-flex items-center gap-2 rounded-lg bg-[#0F172A] px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50"
            type="button"
            onClick={handlePrint}
            disabled={!qrDataUrl}
          >
            <Printer size={16} aria-hidden="true" /> Imprimir QR
          </button>
          {canManage && (
            <button
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-red-300 hover:text-red-700 disabled:opacity-50"
              type="button"
              onClick={() => void handleRegenerate()}
              disabled={isRegenerating}
            >
              <RefreshCw size={16} aria-hidden="true" /> {isRegenerating ? 'Generando...' : 'Generar código nuevo'}
            </button>
          )}
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

  return (
    <div className="mt-12">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Torniquetes</h2>
          <p className="mt-2 text-slate-500">Cada torniquete tiene su propia llave y registra los accesos de su sucursal.</p>
        </div>
        <button
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#9BFF63] px-4 py-2 font-medium text-[#0F172A] transition hover:bg-[#abff7c]"
          type="button"
          onClick={openModal}
        >
          <Plus size={18} aria-hidden="true" /> Nuevo torniquete
        </button>
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
        {isLoading ? (
          <div className="space-y-4 p-6" aria-label="Cargando torniquetes" aria-busy="true">
            {Array.from({ length: 3 }).map((_, index) => <div className="h-4 animate-pulse rounded bg-slate-200" key={index} />)}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-100 bg-slate-50/80 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-6 py-4 font-medium">Nombre</th>
                  <th className="px-6 py-4 font-medium">Sucursal</th>
                  <th className="px-6 py-4 font-medium">Llave</th>
                  <th className="px-6 py-4 font-medium">Última conexión</th>
                  <th className="px-6 py-4 font-medium">Estado</th>
                  <th className="px-6 py-4" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {devices.length ? devices.map((device) => (
                  <tr className="transition-colors hover:bg-slate-50" key={device.id}>
                    <td className="whitespace-nowrap px-6 py-4 font-medium text-slate-900">{device.name}</td>
                    <td className="whitespace-nowrap px-6 py-4">{gymName(device.gymId)}</td>
                    <td className="whitespace-nowrap px-6 py-4 font-mono text-xs text-slate-500">{device.keyPreview}…</td>
                    <td className="whitespace-nowrap px-6 py-4 text-slate-500">{formatDate(device.lastSeenAt)}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${device.revokedAt ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
                        {device.revokedAt ? 'Revocado' : 'Activo'}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-right">
                      {!device.revokedAt && (
                        <button className="text-sm font-medium text-slate-500 transition hover:text-red-700" type="button" onClick={() => void handleRevoke(device)}>
                          Revocar
                        </button>
                      )}
                    </td>
                  </tr>
                )) : (
                  <tr><td className="px-6 py-10 text-center text-sm text-slate-500" colSpan={6}>No hay torniquetes registrados.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/50 px-4 py-8 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.2em] text-emerald-700">Acceso</p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-900">{newKey ? 'Llave del torniquete' : 'Nuevo torniquete'}</h2>
              </div>
              <button className="text-2xl leading-none text-slate-400 transition hover:text-slate-700" type="button" aria-label="Cerrar modal" onClick={closeModal}>×</button>
            </div>

            {newKey ? (
              <div className="mt-6 space-y-4">
                <p className="rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
                  Copia esta llave y configúrala en el torniquete (encabezado <span className="font-mono">X-Device-Key</span>). No se volverá a mostrar; si se pierde, revoca el torniquete y registra uno nuevo.
                </p>
                <p className="break-all rounded-lg bg-slate-50 px-4 py-3 font-mono text-sm text-slate-900">{newKey}</p>
                {modalError && <p className="text-sm text-red-600" role="alert">{modalError}</p>}
                <div className="flex justify-end gap-3">
                  <button className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50" type="button" onClick={() => void handleCopy()}>
                    <Copy size={16} aria-hidden="true" /> {copied ? 'Copiada' : 'Copiar llave'}
                  </button>
                  <button className="rounded-lg bg-[#0F172A] px-4 py-2 text-sm font-medium text-white" type="button" onClick={closeModal}>Listo</button>
                </div>
              </div>
            ) : (
              <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="device-name">Nombre</label>
                  <input
                    className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-100"
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
                {modalError && <p className="text-sm text-red-600" role="alert">{modalError}</p>}
                <div className="flex justify-end gap-3 pt-2">
                  <button className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100" type="button" onClick={closeModal}>Cancelar</button>
                  <button className="rounded-lg bg-[#0F172A] px-4 py-2 text-sm font-medium text-white disabled:opacity-50" type="submit" disabled={isSubmitting}>
                    {isSubmitting ? 'Registrando...' : 'Registrar'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

interface NewGymDialogProps {
  onClose: () => void
  onCreated: () => Promise<void>
}

function NewGymDialog({ onClose, onCreated }: NewGymDialogProps) {
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(null); setIsSubmitting(true)
    try {
      await createGym({ name: name.trim(), address: address.trim() || undefined })
      await onCreated()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No se pudo abrir la sucursal.')
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/50 px-4" role="dialog" aria-modal="true" aria-labelledby="new-gym-title">
      <form className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl" onSubmit={handleSubmit}>
        <h2 className="text-xl font-semibold text-slate-900" id="new-gym-title">Nueva sucursal</h2>
        <p className="mt-2 text-sm text-slate-500">Tendrá su propio código para que los clientes se unan desde la app.</p>
        <div className="mt-6 space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="gym-name">Nombre</label>
            <input
              className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-100"
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
            <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="gym-address">Dirección (opcional)</label>
            <input
              className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-100"
              id="gym-address"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              maxLength={200}
            />
          </div>
        </div>
        {error && <p className="mt-3 text-sm text-red-600" role="alert">{error}</p>}
        <div className="mt-6 flex justify-end gap-3">
          <button className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100" type="button" onClick={onClose}>Cancelar</button>
          <button className="rounded-lg bg-[#0F172A] px-4 py-2 text-sm font-medium text-white disabled:opacity-50" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Abriendo...' : 'Abrir sucursal'}
          </button>
        </div>
      </form>
    </div>
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
  const [isNewGymOpen, setIsNewGymOpen] = useState(false)
  const isAtLimit = Boolean(limits && limits.activeGyms >= limits.gymLimit)

  async function handleGymCreated() {
    const response = await getGyms()
    setGyms(response.gyms)
    setLimits(response.limits ?? null)
    setIsNewGymOpen(false)
    // The new gym shows up in the sidebar selector.
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
    <section className="min-h-screen bg-[#F8FAFC] px-4 py-10 sm:px-8">
      <p className="text-sm font-medium uppercase tracking-[0.25em] text-slate-500">Operación</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-900">Gimnasios</h1>
      <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-slate-500">Códigos para que los clientes se unan desde la app{canManage ? ' y torniquetes de cada sucursal' : ''}.</p>
        {isOwner && limits && (
          <div className="flex shrink-0 items-center gap-3">
            <span className="text-sm text-slate-500">{limits.activeGyms} de {limits.gymLimit} sucursales</span>
            <button
              className="inline-flex items-center gap-2 rounded-lg bg-[#0F172A] px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              type="button"
              onClick={() => setIsNewGymOpen(true)}
              disabled={isAtLimit}
              title={isAtLimit ? 'Llegaste al límite de tu plan. Contacta a SIRID para ampliarlo.' : undefined}
            >
              <Plus size={16} aria-hidden="true" /> Nueva sucursal
            </button>
          </div>
        )}
      </div>
      {isOwner && isAtLimit && (
        <p className="mt-3 text-sm text-slate-500">Llegaste al límite de sucursales de tu plan. Contacta a SIRID para ampliarlo.</p>
      )}

      {error && <div className="mt-6 rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{error}</div>}

      <div className="mt-8 grid gap-6 xl:grid-cols-2">
        {isLoading
          ? Array.from({ length: 2 }).map((_, index) => <div className="h-52 animate-pulse rounded-xl bg-slate-200" key={index} />)
          : gyms.length
            ? gyms.map((gym) => <GymCard key={gym.id} gym={gym} canManage={canManage} onRegenerate={handleRegenerate} onError={setError} />)
            : <p className="text-sm text-slate-500">No hay sucursales activas.</p>}
      </div>

      {canManage && !isLoading && <DevicesSection gyms={gyms} onError={setError} />}

      {isNewGymOpen && <NewGymDialog onClose={() => setIsNewGymOpen(false)} onCreated={handleGymCreated} />}
    </section>
  )
}

export default Gyms
