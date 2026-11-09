import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AlertTriangle, CalendarClock, Check, CreditCard, ExternalLink, Lock, Receipt, Sparkles, Store } from 'lucide-react'
import Panel from '../components/ui/Panel'
import EmptyState from '../components/ui/EmptyState'
import {
  getMySubscription,
  getSubscriptionPayments,
  openBillingPortal,
  type MySubscriptionResponse,
  type OrganizationSubscription,
  type SaasPlan,
  type SubscriptionPaymentEntry,
} from '../services/api'
import { socket } from '../services/socket'
import { checkoutUrl, formatLongDate, formatMoney, METHOD_LABELS, PLAN_FEATURES, PRO_FEATURES, STATUS_LABELS } from '../utils/planFeatures'

const SALES_EMAIL = 'project.gymgo@gmail.com'

// The date that matters right now and how long the current stretch lasts, for the countdown bar.
function countdown(subscription: OrganizationSubscription) {
  if (subscription.phase !== 'ok') return { label: 'Venció el', date: subscription.lapsedAt, total: 0 }
  if (subscription.status === 'trialing') {
    // The simulated PayPal button gives a 5-day pass; the signup trial lasts 14 days.
    return { label: 'Tu prueba termina', date: subscription.trialEndsAt, total: subscription.method === 'paypal' ? 5 : 14 }
  }
  if (subscription.status === 'active') {
    return {
      label: subscription.renews ? 'Se renueva el' : 'Pagado hasta el',
      date: subscription.currentPeriodEnd,
      total: subscription.interval === 'year' ? 365 : 30,
    }
  }
  return { label: 'Venció el', date: subscription.lapsedAt, total: 0 }
}

// A card subscription that renews by itself changes plan in Stripe's portal (the web checkout refuses it).
function isCardRenewing(subscription: OrganizationSubscription) {
  return subscription.renews && subscription.method === 'card' && subscription.status !== 'canceled'
}

function StatusBadge({ subscription }: { subscription: OrganizationSubscription }) {
  const tone = subscription.phase !== 'ok'
    ? 'bg-red-500/15 text-red-300 ring-red-400/30'
    : subscription.status === 'trialing'
      ? 'bg-amber-400/15 text-amber-200 ring-amber-300/30'
      : 'bg-brand/15 text-brand ring-brand/30'
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${tone}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
      {subscription.phase === 'ok' ? STATUS_LABELS[subscription.status] : subscription.phase === 'grace' ? 'Vencido · en gracia' : 'Vencido'}
    </span>
  )
}

function PlanHero({ data, onPortal, portalBusy }: { data: MySubscriptionResponse; onPortal: () => void; portalBusy: boolean }) {
  const { subscription } = data
  const { label, date, total } = countdown(subscription)
  // A card that renews has no lapse date, so the API sends no daysLeft: count to the renewal instead.
  const [now] = useState(() => Date.now())
  const daysLeft = subscription.daysLeft ?? (date && total > 0 ? Math.max(0, Math.ceil((new Date(date).getTime() - now) / 864e5)) : null)
  const progress = total > 0 && daysLeft !== null ? Math.min(100, Math.max(4, (daysLeft / total) * 100)) : 0
  const lowTime = subscription.phase === 'ok' && !subscription.renews && daysLeft !== null && daysLeft <= 3
  const cardRenews = isCardRenewing(subscription)

  return (
    <section className="relative overflow-hidden rounded-card bg-ink p-6 text-white shadow-lift sm:p-8">
      <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-brand/15 blur-3xl" aria-hidden="true" />
      <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge subscription={subscription} />
            {subscription.method && <span className="text-xs text-slate-400">Pago con {METHOD_LABELS[subscription.method]}{subscription.interval ? ` · ${subscription.interval === 'year' ? 'anual' : 'mensual'}` : ''}</span>}
          </div>
          <p className="mt-4 text-sm text-slate-400">{data.organization.name}</p>
          <h2 className="font-display text-5xl font-bold leading-none tracking-tight">
            GymGo <span className="text-brand">{subscription.planName ?? 'sin plan'}</span>
          </h2>

          {subscription.status !== 'manual' && (
            <div className="mt-6 max-w-md">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-sm text-slate-300">{label} <strong className="text-white">{formatLongDate(date)}</strong></p>
                {daysLeft !== null && total > 0 && (
                  <p className={`shrink-0 whitespace-nowrap font-display text-2xl font-bold tabular ${lowTime ? 'text-amber-300' : 'text-white'}`}>
                    {daysLeft} <span className="text-sm font-semibold text-slate-400">{daysLeft === 1 ? 'día' : 'días'}</span>
                  </p>
                )}
              </div>
              {total > 0 && (
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-label="Tiempo restante del plan" aria-valuemin={0} aria-valuemax={total} aria-valuenow={daysLeft ?? 0}>
                  <div className={`h-full origin-left animate-grow-x rounded-full ${lowTime ? 'bg-amber-300' : 'bg-brand'}`} style={{ width: `${progress}%` }} />
                </div>
              )}
            </div>
          )}
          {subscription.status === 'manual' && (
            <p className="mt-4 max-w-md text-sm text-slate-300">SIRID administra el plan de tu organización. Para cambiarlo escríbenos a <a className="font-semibold text-brand underline-offset-2 hover:underline" href={`mailto:${SALES_EMAIL}`}>{SALES_EMAIL}</a>.</p>
          )}
        </div>

        {subscription.status !== 'manual' && (
          <div className="flex flex-col gap-2 sm:flex-row lg:flex-col">
            {!cardRenews && (
              <a
                className="inline-flex items-center justify-center gap-2 rounded-full bg-brand px-6 py-3 text-sm font-bold text-brand-ink shadow-glow transition hover:bg-brand-hover active:bg-brand-press"
                href={checkoutUrl(subscription.planCode ?? undefined)}
              >
                <CreditCard size={16} aria-hidden />
                {subscription.status === 'active' && subscription.phase === 'ok' ? 'Pagar siguiente periodo' : 'Activar mi plan'}
              </a>
            )}
            <button
              type="button"
              className="inline-flex items-center justify-center gap-2 rounded-full border border-white/15 bg-white/5 px-6 py-3 text-sm font-semibold text-white transition hover:border-white/30 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={onPortal}
              disabled={!subscription.hasStripeCustomer || portalBusy}
              title={subscription.hasStripeCustomer ? undefined : 'Disponible después de tu primer pago con Stripe'}
            >
              <ExternalLink size={16} aria-hidden />
              {portalBusy ? 'Abriendo Stripe…' : 'Administrar en Stripe'}
            </button>
            {!subscription.hasStripeCustomer && <p className="text-center text-xs text-slate-500 lg:max-w-[210px]">El portal de Stripe se habilita con tu primer pago con tarjeta u OXXO.</p>}
          </div>
        )}
      </div>
    </section>
  )
}

function PlanCard({ plan, current, highlighted, onPortal }: { plan: SaasPlan; current: boolean; highlighted: boolean; onPortal: (() => void) | null }) {
  const isPro = plan.code === 'pro'
  return (
    <article className={`flex flex-col rounded-card border bg-white p-5 shadow-card transition sm:p-6 ${highlighted ? 'border-brand ring-2 ring-brand/40' : 'border-slate-200/80'}`}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-display text-2xl font-bold text-ink">{plan.name}</h3>
        {current ? (
          <span className="rounded-full bg-ink px-2.5 py-1 text-xs font-semibold text-white">Tu plan</span>
        ) : plan.featured && (
          <span className="rounded-full bg-brand px-2.5 py-1 text-xs font-bold text-brand-ink">Más elegido</span>
        )}
      </div>
      <p className="mt-1 min-h-[40px] text-sm text-slate-500">{plan.description}</p>
      <p className="mt-3">
        {plan.monthly ? (
          <><span className="font-display text-3xl font-bold text-ink tabular">{formatMoney(plan.monthly.subtotal)}</span> <span className="text-sm text-slate-500">+ IVA al mes</span></>
        ) : (
          <span className="font-display text-2xl font-bold text-ink">A la medida</span>
        )}
      </p>
      <p className="mt-1 text-xs text-slate-500">{plan.gymLimit ? `Hasta ${plan.gymLimit} ${plan.gymLimit === 1 ? 'sucursal' : 'sucursales'}` : 'Sucursales ilimitadas'}</p>
      <ul className="mt-4 flex-1 space-y-2">
        {PRO_FEATURES.map((feature) => {
          const included = plan.features.includes(feature)
          return (
            <li key={feature} className={`flex items-center gap-2 text-sm ${included ? 'text-slate-700' : 'text-slate-400'}`}>
              {included ? <Check size={16} className="shrink-0 text-brand-text" aria-hidden /> : <Lock size={14} className="shrink-0" aria-hidden />}
              <span>{PLAN_FEATURES[feature].title}</span>
              <span className="sr-only">{included ? 'incluido' : 'no incluido'}</span>
            </li>
          )
        })}
      </ul>
      {current ? null : plan.selfService && onPortal ? (
        <button
          type="button"
          className="mt-5 inline-flex items-center justify-center gap-2 rounded-full border border-slate-300 px-5 py-3 text-sm font-semibold text-ink transition hover:bg-slate-50"
          onClick={onPortal}
        >
          <ExternalLink size={16} aria-hidden /> Cambiar en Stripe
        </button>
      ) : plan.selfService ? (
        <a
          className={`mt-5 inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-bold transition ${isPro ? 'bg-brand text-brand-ink shadow-glow hover:bg-brand-hover' : 'bg-ink text-white hover:bg-slate-800'}`}
          href={checkoutUrl(plan.code)}
        >
          {isPro && <Sparkles size={16} aria-hidden />} Cambiar a {plan.name}
        </a>
      ) : (
        <a className="mt-5 inline-flex items-center justify-center gap-2 rounded-full border border-slate-300 px-5 py-3 text-sm font-semibold text-ink transition hover:bg-slate-50" href={`mailto:${SALES_EMAIL}?subject=${encodeURIComponent(`GymGo ${plan.name}`)}`}>
          Contactar a ventas
        </a>
      )}
    </article>
  )
}

function Billing() {
  const [searchParams] = useSearchParams()
  const [data, setData] = useState<MySubscriptionResponse | null>(null)
  const [payments, setPayments] = useState<SubscriptionPaymentEntry[]>([])
  const [error, setError] = useState('')
  const [portalBusy, setPortalBusy] = useState(false)
  const wantedPlan = searchParams.get('plan')

  const load = useCallback(async () => {
    try {
      const [subscription, history] = await Promise.all([getMySubscription(), getSubscriptionPayments().catch(() => ({ payments: [] }))])
      setData(subscription)
      setPayments(history.payments)
      setError('')
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'No se pudo cargar tu plan.')
    }
  }, [])

  // Payments land through Stripe's webhook while this page is open; the layout reloads the session itself.
  useEffect(() => {
    load()
    socket.on('subscription:updated', load)
    return () => { socket.off('subscription:updated', load) }
  }, [load])

  async function handlePortal() {
    setPortalBusy(true)
    try {
      const { url } = await openBillingPortal(window.location.href)
      window.location.href = url
    } catch (portalError) {
      setPortalBusy(false)
      setError(portalError instanceof Error ? portalError.message : 'No se pudo abrir el portal de Stripe.')
    }
  }

  const subscription = data?.subscription

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-8 sm:py-8">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Cuenta</p>
        <h1 className="mt-1 font-display text-4xl font-bold tracking-tight text-ink">Mi plan GymGo</h1>
        <p className="mt-1 text-sm text-slate-500">El plan que tu organización paga a SIRID por usar GymGo.</p>
      </header>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" aria-hidden /> <span>{error}</span>
        </div>
      )}

      {!data && !error && (
        <div className="space-y-4" aria-busy="true" aria-label="Cargando tu plan">
          <div className="skeleton h-56 w-full rounded-card" />
          <div className="grid gap-4 md:grid-cols-3"><div className="skeleton h-72" /><div className="skeleton h-72" /><div className="skeleton h-72" /></div>
        </div>
      )}

      {data && subscription && (
        <>
          {subscription.phase !== 'ok' && (
            <div className="flex items-start gap-3 rounded-card border border-red-200 bg-red-50 p-4 text-sm text-red-900" role="alert">
              <AlertTriangle size={20} className="mt-0.5 shrink-0 text-red-600" aria-hidden />
              <p>
                {subscription.phase === 'grace'
                  ? <>Tu plan venció. Tu equipo y tus clientes pueden seguir hasta el <strong>{formatLongDate(subscription.graceEndsAt)}</strong>; mientras tanto solo ves esta página. Paga para no interrumpir el servicio.</>
                  : <>Tu plan venció y tu gimnasio está pausado para tu equipo y tus clientes. Paga para reactivarlo al instante.</>}
              </p>
            </div>
          )}

          <PlanHero data={data} onPortal={handlePortal} portalBusy={portalBusy} />

          {subscription.pendingPayment?.voucherUrl && (
            <div className="flex flex-col gap-3 rounded-card border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between">
              <p className="flex items-center gap-2"><Store size={18} aria-hidden /> Tienes una ficha OXXO pendiente{subscription.pendingPayment.expiresAt ? `, vence el ${formatLongDate(subscription.pendingPayment.expiresAt)}` : ''}.</p>
              <a className="inline-flex items-center gap-1.5 font-semibold underline-offset-2 hover:underline" href={subscription.pendingPayment.voucherUrl} target="_blank" rel="noopener noreferrer">Ver ficha <ExternalLink size={14} aria-hidden /></a>
            </div>
          )}

          <Panel title="Planes" icon={Sparkles} description="Los módulos con candado se desbloquean con Pro. Los precios incluyen IVA al pagar.">
            <div className="grid gap-4 md:grid-cols-3">
              {data.plans.map((plan) => (
                <PlanCard
                  key={plan.code}
                  plan={plan}
                  current={plan.code === subscription.planCode}
                  highlighted={plan.code === wantedPlan && plan.code !== subscription.planCode}
                  onPortal={isCardRenewing(subscription) ? handlePortal : null}
                />
              ))}
            </div>
          </Panel>

          <Panel title="Historial de pagos" icon={Receipt}>
            {payments.length === 0 ? (
              <EmptyState icon={CalendarClock} title="Aún no hay pagos">Aquí verás cada pago de tu plan con su periodo.</EmptyState>
            ) : (
              <div className="-mx-5 overflow-x-auto sm:-mx-6">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead className="text-xs uppercase tracking-wider text-slate-500">
                    <tr className="border-b border-slate-200">
                      <th className="px-5 py-2 font-semibold sm:px-6">Fecha</th>
                      <th className="px-3 py-2 font-semibold">Plan</th>
                      <th className="px-3 py-2 font-semibold">Método</th>
                      <th className="px-3 py-2 font-semibold">Periodo</th>
                      <th className="px-5 py-2 text-right font-semibold sm:px-6">Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((payment) => (
                      <tr key={payment.id} className="border-b border-slate-100 last:border-0">
                        <td className="px-5 py-3 text-slate-700 sm:px-6">{formatLongDate(payment.paidAt)}</td>
                        <td className="px-3 py-3 font-medium capitalize text-ink">{payment.planCode} · {payment.interval === 'year' ? 'anual' : 'mensual'}</td>
                        <td className="px-3 py-3 text-slate-600">{METHOD_LABELS[payment.method] ?? payment.method}</td>
                        <td className="px-3 py-3 text-slate-600">hasta el {formatLongDate(payment.periodEnd)}</td>
                        <td className="px-5 py-3 text-right font-semibold text-ink tabular sm:px-6">{formatMoney(payment.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </>
      )}
    </div>
  )
}

export default Billing
