import { useRef, useState } from 'react'
import { Loader2, Upload } from 'lucide-react'
import { uploadPlatformExerciseMedia } from '../../services/api'
import { fieldClass, labelClass, secondaryButton } from './styles'

const MEDIA_ACCEPT = { gif: 'image/gif,image/webp', image: 'image/jpeg,image/png,image/webp' }
const MAX_MEDIA_BYTES = 5 * 1024 * 1024

// URL field with an "upload" shortcut: the file goes to the catalog's R2 bucket and its public URL fills the field.
export default function MediaField({ id, label, kind, value, required, onChange, onError }: {
  id: string
  label: string
  kind: 'gif' | 'image'
  value: string
  required?: boolean
  onChange: (value: string) => void
  onError: (message: string | null) => void
}) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [isUploading, setIsUploading] = useState(false)

  async function handleFile(file: File | undefined) {
    if (!file) return
    if (file.size > MAX_MEDIA_BYTES) return onError('El archivo supera el tamaño máximo de 5 MB.')
    onError(null)
    setIsUploading(true)
    try {
      onChange((await uploadPlatformExerciseMedia(file, kind)).url)
    } catch (uploadError) {
      onError(uploadError instanceof Error ? uploadError.message : 'No se pudo subir el archivo.')
    } finally {
      setIsUploading(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  return (
    <div>
      <label className={labelClass} htmlFor={id}>{label}</label>
      <div className="flex gap-2">
        <input className={fieldClass} id={id} type="url" value={value} onChange={(event) => onChange(event.target.value)} required={required} placeholder="https://..." />
        <button
          className={`${secondaryButton} shrink-0 px-3`}
          type="button"
          onClick={() => fileInput.current?.click()}
          disabled={isUploading}
          aria-label={`Subir ${kind === 'gif' ? 'GIF' : 'miniatura'}`}
        >
          {isUploading ? <Loader2 className="animate-spin" size={16} aria-hidden /> : <Upload size={16} aria-hidden />}
          <span className="hidden sm:inline">{isUploading ? 'Subiendo' : 'Subir'}</span>
        </button>
        <input ref={fileInput} className="hidden" type="file" accept={MEDIA_ACCEPT[kind]} onChange={(event) => handleFile(event.target.files?.[0])} />
      </div>
      {value && (
        <img
          className={`mt-3 rounded-xl bg-slate-50 ring-1 ring-slate-200 ${kind === 'gif' ? 'h-40 w-40 object-contain' : 'h-20 w-20 object-cover'}`}
          src={value}
          alt={kind === 'gif' ? 'Vista previa del GIF' : 'Vista previa de la miniatura'}
        />
      )}
    </div>
  )
}
