import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Lock, Sparkles, X } from 'lucide-react'
import { getMySubscription, PLAN_FEATURE_EVENT, type PlanFeature, type PlanFeatureBlocked, type SaasPlan } from '../services/api'
import { useAuth } from '../store/useAuth'
import { formatMoney, PLAN_FEATURES, PRO_FEATURES } from '../utils/planFeatures'

// Opens when the API refuses a module the plan doesn't include (403 feature_not_in_plan). Pages load some of
// these modules on their own (aforo, bitácora, torniquetes), so each one opens the modal once per session;
// afterwards the page shows its own message without interrupting reception.
const announced = new Set<string>()

function PlanUpgradeModal() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const [blocked, setBlocked] = useState<PlanFeatureBlocked | null>(null)
  const [pro, setPro] = useState<SaasPlan | null>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  // Only the owner pays the plan; the rest of the team is told who can change it.
  const isOwner = Boolean(session?.subscription)

  useEffect(() => {
    const onBlocked = (event: Event) => {
      const detail = (event as CustomEvent<PlanFeatureBlocked>).detail
      const key = detail.feature ?? 'plan'
      if (announced.has(key)) return
      announced.add(key)
      setBlocked(detail)
    }
    window.addEventListener(PLAN_FEATURE_EVENT, onBlocked)
    return () => window.removeEventListener(PLAN_FEATURE_EVENT, onBlocked)
  }, [])

  // Pro's price for the owner, from the same catalog the web sells.
  useEffect(() => {
    if (!blocked || !isOwner || pro) return
    getMySubscription()
      .then(({ plans }) => setPro(plans.find((plan) => plan.code === 'pro') ?? null))
      .catch(() => {})
  }, [blocked, isOwner, pro])

  useEffect(() => {
    if (!blocked) return
    closeRef.current?.focus()
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setBlocked(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [blocked])

  if (!blocked) return null

  const feature = blocked.feature && PLAN_FEATURES[blocked.feature] ? blocked.feature : null
  const info = feature ? PLAN_FEATURES[feature] : null
  const FeatureIcon = info?.icon ?? Lock
  const others: PlanFeature[] = PRO_FEATURES.filter((item) => item !== feature)
  const close = () => setBlocked(null)

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/60 px-4 pb-4 backdrop-blur-sm sm:items-center sm:pb-0" role="dialog" aria-modal="true" aria-labelledby="upgrade-title" onClick={close}>
      <div className="w-full max-w-lg animate-pop-in overflow-hidden rounded-card bg-white shadow-lift" onClick={(event) => event.stopPropagation()}>
        <div className="relative overflow-hidden bg-ink px-6 pb-6 pt-7 text-white">
          <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-brand/20 blur-3xl" aria-hidden="true" />
          <button ref={closeRef} type="button" className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-lg text-slate-400 transition hover:bg-white/10 hover:text-white" aria-label="Cerrar" onClick={close}>
            <X size={18} aria-hidden />
          </button>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-brand-ink">
            <Sparkles size={13} aria-hidden /> Plan Pro
          </span>
          <h2 id="upgrade-title" className="mt-4 font-display text-3xl font-bold leading-tight tracking-tight">Mejora tu plan a Pro</h2>
          <p className="mt-2 text-sm text-slate-300">
            {info ? <><strong className="text-white">{info.title}</strong> no está incluido en tu plan actual.</> : blocked.message}
          </p>
        </div>

        <div className="px-6 py-5">
          {info && (
            <div className="flex gap-3 rounded-xl border border-brand/40 bg-brand-soft p-4">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand text-brand-ink">
                <FeatureIcon size={20} aria-hidden />
              </span>
              <div>
                <p className="font-semibold text-ink">{info.title}</p>
                <p className="mt-0.5 text-sm text-slate-600">{info.description}</p>
              </div>
            </div>
          )}

          <p className="mt-5 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">También incluye</p>
          <ul className="mt-2 space-y-2">
            {others.map((item) => (
              <li key={item} className="flex items-start gap-2.5 text-sm text-slate-700">
                <Check size={16} className="mt-0.5 shrink-0 text-brand-text" aria-hidden />
                <span><strong className="font-semibold text-ink">{PLAN_FEATURES[item].title}.</strong> {PLAN_FEATURES[item].description}</span>
              </li>
            ))}
            <li className="flex items-start gap-2.5 text-sm text-slate-700">
              <Check size={16} className="mt-0.5 shrink-0 text-brand-text" aria-hidden />
              <span><strong className="font-semibold text-ink">Hasta {pro?.gymLimit ?? 3} sucursales</strong> en una sola cuenta.</span>
            </li>
          </ul>

          {isOwner ? (
            <>
              {pro?.monthly && (
                <p className="mt-5 text-sm text-slate-500">
                  <span className="font-display text-2xl font-bold text-ink tabular">{formatMoney(pro.monthly.subtotal)}</span> + IVA al mes
                </p>
              )}
              <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button type="button" className="rounded-full px-5 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-100" onClick={close}>Ahora no</button>
                <button
                  type="button"
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-brand px-6 py-3 text-sm font-bold text-brand-ink shadow-glow transition hover:bg-brand-hover active:bg-brand-press"
                  onClick={() => { close(); navigate('/billing?plan=pro') }}
                >
                  <Sparkles size={16} aria-hidden /> Ver cómo mejorar
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="mt-5 rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-600">Pídele al dueño del gimnasio que cambie a Pro desde <strong>Mi plan GymGo</strong>.</p>
              <div className="mt-4 flex justify-end">
                <button type="button" className="rounded-full bg-ink px-6 py-3 text-sm font-semibold text-white transition hover:bg-slate-800" onClick={close}>Entendido</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default PlanUpgradeModal
