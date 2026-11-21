import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, CameraOff, History, Keyboard, LogIn, LogOut, ScanLine, XCircle } from 'lucide-react'
import jsQR from 'jsqr'
import GymSelect from '../components/GymSelect'
import OccupancyMonitor from '../components/OccupancyMonitor'
import AccessLog from '../components/AccessLog'
import PageHeader from '../components/ui/PageHeader'
import Panel from '../components/ui/Panel'
import Segmented from '../components/ui/Segmented'
import Badge from '../components/ui/Badge'
import EmptyState from '../components/ui/EmptyState'
import { errorAlert, fieldClass, hintClass, primaryButton, secondaryButton } from '../components/ui/styles'
import { ApiError, registerQrAccess } from '../services/api'
import { useAuth } from '../store/useAuth'
import { targetGymField } from '../utils/targetGym'
import { denialTitleForCode } from '../utils/accessReasons'

type ScanResult =
  | { kind: 'check-in' | 'check-out'; name: string; at: string }
  | { kind: 'error'; title: string; message: string; at: string }

const SCAN_INTERVAL_MS = 200
// Time the result stays on screen before the next QR is read, so the same client isn't scanned twice.
const RESULT_PAUSE_MS = 2500
const MAX_FRAME_WIDTH = 640

function denialTitle(error: unknown) {
  return denialTitleForCode(error instanceof ApiError ? (error.response.data as { code?: string } | null)?.code : undefined)
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat('es-MX', { timeStyle: 'short' }).format(new Date(value))
}

function cameraErrorMessage(error: unknown) {
  if (!window.isSecureContext) return 'La cámara solo funciona con HTTPS o en localhost.'
  if (error instanceof DOMException && error.name === 'NotAllowedError') return 'Permite el acceso a la cámara en el navegador para escanear.'
  if (error instanceof DOMException && error.name === 'NotFoundError') return 'No se encontró una cámara en este equipo.'
  return 'No se pudo abrir la cámara.'
}

// The answer to the last scan, big enough to read from the counter.
function ResultCard({ result }: { result: ScanResult }) {
  if (result.kind === 'error') {
    return (
      <div className="flex animate-pop-in items-center gap-4 rounded-card border border-red-200 bg-red-50 p-5 text-red-800" role="alert" key={result.at}>
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-red-600 text-white"><XCircle size={26} aria-hidden /></span>
        <div className="min-w-0">
          <p className="font-display text-2xl font-bold leading-tight">{result.title}</p>
          <p className="text-sm">{result.message}</p>
        </div>
      </div>
    )
  }
  const isCheckIn = result.kind === 'check-in'
  const Icon = isCheckIn ? LogIn : LogOut
  return (
    <div
      className={`flex animate-pop-in items-center gap-4 rounded-card border p-5 ${isCheckIn ? 'border-brand-text/20 bg-brand-soft text-brand-ink' : 'border-slate-200 bg-white text-ink'}`}
      role="status"
      key={result.at}
    >
      <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-full ${isCheckIn ? 'bg-brand text-brand-ink' : 'bg-slate-200 text-slate-700'}`}><Icon size={24} aria-hidden /></span>
      <div className="min-w-0">
        <p className="font-display text-2xl font-bold leading-tight">{isCheckIn ? 'Entrada registrada' : 'Salida registrada'}</p>
        <p className="truncate text-sm">{result.name} · {formatTime(result.at)}</p>
      </div>
    </div>
  )
}

type AccessTab = 'scanner' | 'occupancy' | 'log'

const TABS = [['scanner', 'Escáner'], ['occupancy', 'Aforo en vivo'], ['log', 'Bitácora']] as const

// Reception validates the client's QR with a phone or webcam when there is no turnstile,
// watches how full each gym is and looks up past entries and refusals.
function Access() {
  const { isAllGyms } = useAuth()
  const [tab, setTab] = useState<AccessTab>('scanner')
  const [gymId, setGymId] = useState('')
  const [isCameraOn, setIsCameraOn] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [result, setResult] = useState<ScanResult | null>(null)
  const [history, setHistory] = useState<ScanResult[]>([])
  const [manualToken, setManualToken] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const timerRef = useRef<number | null>(null)
  const busyRef = useRef(false)
  const lastTokenRef = useRef<string | null>(null)

  const submitToken = useCallback(async (qrToken: string) => {
    if (busyRef.current) return
    busyRef.current = true
    setIsSubmitting(true)
    let next: ScanResult
    try {
      const response = await registerQrAccess({ qrToken, ...targetGymField(isAllGyms, gymId) })
      next = { kind: response.access.event, name: response.access.userName, at: response.access.occurredAt }
    } catch (requestError) {
      next = {
        kind: 'error',
        title: denialTitle(requestError),
        message: requestError instanceof Error ? requestError.message : 'No se pudo validar el QR.',
        at: new Date().toISOString(),
      }
    }
    setResult(next)
    setHistory((current) => [next, ...current].slice(0, 10))
    setIsSubmitting(false)
    window.setTimeout(() => { busyRef.current = false }, RESULT_PAUSE_MS)
  }, [isAllGyms, gymId])

  const stopCamera = useCallback(() => {
    if (timerRef.current !== null) window.clearInterval(timerRef.current)
    timerRef.current = null
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setIsCameraOn(false)
  }, [])

  // The scan loop reads the latest submitToken through a ref, so changing the gym doesn't restart the camera.
  const submitRef = useRef(submitToken)
  useEffect(() => { submitRef.current = submitToken }, [submitToken])

  async function startCamera() {
    setCameraError(null)
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('unsupported')
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
      streamRef.current = stream
      const video = videoRef.current
      if (!video) return
      video.srcObject = stream
      await video.play()
      setIsCameraOn(true)

      const canvas = document.createElement('canvas')
      const context = canvas.getContext('2d', { willReadFrequently: true })
      timerRef.current = window.setInterval(() => {
        if (!context || busyRef.current || video.readyState < video.HAVE_ENOUGH_DATA) return
        const scale = Math.min(1, MAX_FRAME_WIDTH / video.videoWidth)
        canvas.width = Math.round(video.videoWidth * scale)
        canvas.height = Math.round(video.videoHeight * scale)
        context.drawImage(video, 0, 0, canvas.width, canvas.height)
        const frame = context.getImageData(0, 0, canvas.width, canvas.height)
        const code = jsQR(frame.data, frame.width, frame.height, { inversionAttempts: 'dontInvert' })
        // Each QR works once; reading it again would only return "ya fue utilizado".
        if (!code?.data || code.data === lastTokenRef.current) return
        lastTokenRef.current = code.data
        void submitRef.current(code.data)
      }, SCAN_INTERVAL_MS)
    } catch (error) {
      stopCamera()
      setCameraError(cameraErrorMessage(error))
    }
  }

  useEffect(() => stopCamera, [stopCamera])

  // Hand-held scanners type the QR content and press Enter.
  async function handleManualSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const token = manualToken.trim()
    if (!token) return
    await submitToken(token)
    setManualToken('')
  }

  const needsGym = isAllGyms && !gymId

  function changeTab(next: AccessTab) {
    // Leaving the scanner turns the camera off.
    if (next !== 'scanner') stopCamera()
    setTab(next)
  }

  return (
    <section className="min-h-screen bg-canvas px-4 py-8 sm:px-8 sm:py-10">
      <PageHeader
        eyebrow="Operación"
        title="Control de acceso"
        description="Registra entradas y salidas, vigila el aforo de cada sucursal y consulta la bitácora."
      />

      <div className="mt-6 overflow-x-auto pb-1">
        <Segmented label="Sección" value={tab} options={TABS} onChange={changeTab} />
      </div>

      {tab === 'occupancy' && <div className="mt-4"><OccupancyMonitor /></div>}
      {tab === 'log' && <div className="mt-4"><AccessLog /></div>}

      {/* Hidden instead of unmounted so the video element (and the camera) survive tab switches cleanly. */}
      <div className={`mt-4 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] ${tab === 'scanner' ? '' : 'hidden'}`}>
        <div className="space-y-4">
          {isAllGyms && (
            <Panel title="Sucursal" description="Elige dónde estás registrando el acceso.">
              <GymSelect id="access-gym" label="Sucursal donde registras el acceso" value={gymId} onChange={setGymId} />
            </Panel>
          )}

          <div className="overflow-hidden rounded-card bg-ink shadow-card">
            <div className="relative aspect-[4/3] w-full">
              <video className={`h-full w-full object-cover ${isCameraOn ? '' : 'hidden'}`} ref={videoRef} muted playsInline />
              {isCameraOn ? (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="aspect-square h-3/5 rounded-3xl border-4 border-brand/80 shadow-[0_0_0_9999px_rgba(9,9,11,0.35)]" />
                </div>
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center text-slate-400">
                  <span className="grid h-16 w-16 place-items-center rounded-full bg-white/5"><ScanLine size={32} aria-hidden /></span>
                  <p className="text-sm">{needsGym ? 'Elige la sucursal para empezar.' : 'Enciende la cámara y pide al cliente que muestre su QR.'}</p>
                </div>
              )}
              {isSubmitting && <div className="absolute inset-x-0 bottom-0 bg-ink/80 py-2 text-center text-sm font-medium text-white">Validando...</div>}
            </div>
            <div className="flex justify-center border-t border-white/5 p-4">
              {isCameraOn ? (
                <button className="inline-flex min-h-[40px] items-center gap-2 rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/5 hover:text-white" type="button" onClick={stopCamera}>
                  <CameraOff size={16} aria-hidden /> Apagar cámara
                </button>
              ) : (
                <button className={primaryButton} type="button" onClick={() => void startCamera()} disabled={needsGym}>
                  <Camera size={18} aria-hidden /> Encender cámara
                </button>
              )}
            </div>
          </div>
          {cameraError && <p className={errorAlert} role="alert">{cameraError}</p>}
          {result && <ResultCard result={result} />}
        </div>

        <aside className="space-y-4">
          <Panel title="Lector externo" icon={Keyboard}>
            <form onSubmit={handleManualSubmit}>
              <label className="sr-only" htmlFor="access-manual">Contenido del QR</label>
              <div className="flex gap-2">
                <input className={`${fieldClass} min-w-0 flex-1`} id="access-manual" value={manualToken} onChange={(event) => setManualToken(event.target.value)} autoComplete="off" disabled={needsGym} placeholder="Escanea aquí" />
                <button className={`${secondaryButton} shrink-0`} type="submit" disabled={needsGym || isSubmitting || !manualToken.trim()}>Validar</button>
              </div>
              <p className={hintClass}>Con un lector USB, coloca el cursor en el campo y escanea el QR.</p>
            </form>
          </Panel>

          <Panel title="Últimos escaneos" icon={History}>
            {history.length ? (
              <ul className="-my-2 divide-y divide-slate-100 text-sm">
                {history.map((item, index) => (
                  <li className="flex items-center justify-between gap-3 py-2.5" key={`${item.at}-${index}`}>
                    <div className="min-w-0">
                      <p className="truncate font-medium text-ink">{item.kind === 'error' ? item.title : item.name}</p>
                      {item.kind === 'error' && <p className="truncate text-xs text-slate-500">{item.message}</p>}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-xs text-slate-500 tabular">{formatTime(item.at)}</span>
                      {item.kind === 'error'
                        ? <Badge tone="danger">Denegado</Badge>
                        : item.kind === 'check-in' ? <Badge tone="success">Entrada</Badge> : <Badge>Salida</Badge>}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon={ScanLine} title="Sin escaneos todavía">Los accesos de esta sesión aparecerán aquí.</EmptyState>
            )}
          </Panel>
        </aside>
      </div>
    </section>
  )
}

export default Access
