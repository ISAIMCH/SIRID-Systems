import { FileText, Radio, ScanLine, Share2 } from 'lucide-react'
import type { ComponentType } from 'react'
import type { PlanFeature, SubscriptionMethod, SubscriptionStatus } from '../services/api'

interface FeatureInfo {
  title: string
  description: string
  icon: ComponentType<{ size?: number; className?: string; 'aria-hidden'?: boolean }>
}

// What each Pro module does, in the owner's words. Keys match the API's plan features.
export const PLAN_FEATURES: Record<PlanFeature, FeatureInfo> = {
  iot: {
    title: 'Torniquetes IoT',
    description: 'Conecta torniquetes y lectores para que la entrada se abra sola con el QR del cliente.',
    icon: Radio,
  },
  occupancy: {
    title: 'Aforo en vivo y bitácora',
    description: 'Mira cuánta gente hay en cada sucursal y revisa quién entró, cuándo y por qué se le negó el paso.',
    icon: ScanLine,
  },
  documents: {
    title: 'Documentos y expedientes',
    description: 'Guarda contratos, responsivas y certificados médicos de cada cliente con registro de quién los consulta.',
    icon: FileText,
  },
  historyShare: {
    title: 'Historial entre gimnasios',
    description: 'Comparte el progreso de un cliente con otra sucursal o gimnasio cuando él lo autoriza.',
    icon: Share2,
  },
}

export const PRO_FEATURES = Object.keys(PLAN_FEATURES) as PlanFeature[]

export const STATUS_LABELS: Record<SubscriptionStatus, string> = {
  trialing: 'Periodo de prueba',
  active: 'Activo',
  past_due: 'Pago pendiente',
  canceled: 'Cancelado',
  incomplete: 'Pago incompleto',
  manual: 'Administrado por SIRID',
}

export const METHOD_LABELS: Record<SubscriptionMethod, string> = {
  card: 'Tarjeta',
  oxxo: 'OXXO',
  paypal: 'PayPal',
  manual: 'Con SIRID',
}

export function formatMoney(value: number) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(value)
}

export function formatLongDate(value: string | null) {
  return value ? new Intl.DateTimeFormat('es-MX', { dateStyle: 'long' }).format(new Date(value)) : ''
}

// The public web's checkout (pages/pagos.html); in production it shares the dashboard's domain and session.
export function checkoutUrl(planCode?: string) {
  const base = (import.meta.env.VITE_GYMGO_WEB_URL || window.location.origin).replace(/\/$/, '')
  return `${base}/pages/pagos.html${planCode ? `?plan=${encodeURIComponent(planCode)}` : ''}`
}
