import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, CameraOff, LogIn, LogOut, XCircle } from 'lucide-react'
import jsQR from 'jsqr'
import GymSelect from '../components/GymSelect'
import { registerQrAccess } from '../services/api'
import { useAuth } from '../store/useAuth'
import { targetGymField } from '../utils/targetGym'

type ScanResult =
  | { kind: 'check-in' | 'check-out'; name: string; at: string }
  | { kind: 'error'; message: string; at: string }

const SCAN_INTERVAL_MS = 200
// Time the result stays on screen before the next QR is read, so the same client isn't scanned twice.
const RESULT_PAUSE_MS = 2500
const MAX_FRAME_WIDTH = 640

function formatTime(value: string) {
  return new Intl.DateTimeFormat('es-MX', { timeStyle: 'short' }).format(new Date(value))
}

function cameraErrorMessage(error: unknown) {
  if (!window.isSecureContext) return 'La cámara solo funciona con HTTPS o en localhost.'
  if (error instanceof DOMException && error.name === 'NotAllowedError') return 'Permite el acceso a la cámara en el navegador para escanear.'
  if (error instanceof DOMException && error.name === 'NotFoundError') return 'No se encontró una cámara en este equipo.'
  return 'No se pudo abrir la cámara.'
}

function ResultCard({ result }: { result: ScanResult }) {
  if (result.kind === 'error') {
    return (
      <div className="flex items-center gap-4 rounded-xl border border-red-200 bg-red-50 p-5 text-red-800" role="alert">
        <XCircle size={36} aria-hidden="true" />
        <div>
          <p className="text-lg font-semibold">Acceso denegado</p>
          <p className="text-sm">{result.message}</p>
        </div>
      </div>
    )
  }
  const isCheckIn = result.kind === 'check-in'
  const Icon = isCheckIn ? LogIn : LogOut
  return (
    <div className={`flex items-center gap-4 rounded-xl border p-5 ${isCheckIn ? 'border-green-200 bg-green-50 text-green-800' : 'border-slate-200 bg-slate-50 text-slate-800'}`} role="status">
      <Icon size={36} aria-hidden="true" />
      <div>
        <p className="text-lg font-semibold">{isCheckIn ? 'Entrada registrada' : 'Salida registrada'}</p>
        <p className="text-sm">{result.name} · {formatTime(result.at)}</p>
      </div>
    </div>
  )
}

// Reception validates the client's QR with a phone or webcam when there is no turnstile.
function Access() {
  const { isAllGyms } = useAuth()
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
      next = { kind: 'error', message: requestError instanceof Error ? requestError.message : 'No se pudo validar el QR.', at: new Date().toISOString() }
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

  return (
    <section className="min-h-screen bg-[#F8FAFC] px-4 py-10 sm:px-8">
      <p className="text-sm font-medium uppercase tracking-[0.25em] text-slate-500">Operación</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-900">Control de acceso</h1>
      <p className="mt-3 text-slate-500">Escanea el QR del cliente con la cámara para registrar su entrada o salida.</p>

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-4">
          {isAllGyms && (
            <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
              <GymSelect id="access-gym" label="Sucursal donde registras el acceso" value={gymId} onChange={setGymId} />
            </div>
          )}

          <div className="overflow-hidden rounded-xl border border-slate-100 bg-[#0F172A] shadow-sm">
            <div className="relative aspect-[4/3] w-full">
              <video className={`h-full w-full object-cover ${isCameraOn ? '' : 'hidden'}`} ref={videoRef} muted playsInline />
              {isCameraOn ? (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="h-3/5 w-auto aspect-square rounded-2xl border-4 border-[#9BFF63]/80" />
                </div>
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center text-slate-400">
                  <Camera size={40} aria-hidden="true" />
                  <p className="text-sm">{needsGym ? 'Elige la sucursal para empezar.' : 'La cámara está apagada.'}</p>
                </div>
              )}
              {isSubmitting && <div className="absolute inset-x-0 bottom-0 bg-[#0F172A]/80 py-2 text-center text-sm text-white">Validando...</div>}
            </div>
            <div className="flex justify-center p-4">
              {isCameraOn ? (
                <button className="inline-flex items-center gap-2 rounded-lg border border-slate-600 px-4 py-2 text-sm font-medium text-slate-200 transition hover:text-white" type="button" onClick={stopCamera}>
                  <CameraOff size={16} aria-hidden="true" /> Apagar cámara
                </button>
              ) : (
                <button className="inline-flex items-center gap-2 rounded-lg bg-[#9BFF63] px-4 py-2 font-medium text-[#0F172A] transition hover:bg-[#abff7c] disabled:opacity-50" type="button" onClick={() => void startCamera()} disabled={needsGym}>
                  <Camera size={18} aria-hidden="true" /> Encender cámara
                </button>
              )}
            </div>
          </div>
          {cameraError && <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{cameraError}</div>}
          {result && <ResultCard result={result} />}
        </div>

        <aside className="space-y-4">
          <form className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm" onSubmit={handleManualSubmit}>
            <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="access-manual">Lector externo</label>
            <p className="mb-3 text-xs text-slate-500">Con un lector USB, coloca el cursor aquí y escanea el QR.</p>
            <div className="flex gap-2">
              <input
                className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-100"
                id="access-manual"
                value={manualToken}
                onChange={(event) => setManualToken(event.target.value)}
                autoComplete="off"
                disabled={needsGym}
              />
              <button className="shrink-0 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:border-green-400 hover:text-green-700 disabled:opacity-50" type="submit" disabled={needsGym || isSubmitting || !manualToken.trim()}>
                Validar
              </button>
            </div>
          </form>

          <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-slate-700">Últimos escaneos</p>
            {history.length ? (
              <ul className="mt-3 divide-y divide-slate-100 text-sm">
                {history.map((item, index) => (
                  <li className="flex items-center justify-between gap-3 py-2" key={`${item.at}-${index}`}>
                    <span className="min-w-0 truncate text-slate-700">{item.kind === 'error' ? item.message : item.name}</span>
                    <span className={`shrink-0 text-xs font-medium ${item.kind === 'error' ? 'text-red-600' : item.kind === 'check-in' ? 'text-green-700' : 'text-slate-500'}`}>
                      {item.kind === 'error' ? 'Denegado' : item.kind === 'check-in' ? 'Entrada' : 'Salida'} · {formatTime(item.at)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : <p className="mt-3 text-sm text-slate-500">Aún no hay escaneos en esta sesión.</p>}
          </div>
        </aside>
      </div>
    </section>
  )
}

export default Access
