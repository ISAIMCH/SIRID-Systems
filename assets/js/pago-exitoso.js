/**
 * Después de Stripe o PayPal. El regreso del navegador no prueba nada: la página consulta la API hasta que el
 * webhook de Stripe (o la captura de PayPal) activa el plan, o hasta que aparece la ficha OXXO pendiente.
 */
(function () {
    const params = new URLSearchParams(location.search);
    const fromStripe = Boolean(params.get('session_id'));
    const METHOD_LABELS = { card: 'Tarjeta (se renueva sola)', oxxo: 'OXXO', paypal: 'PayPal', manual: 'Con SIRID' };
    const ATTEMPTS = 20;
    const result = document.getElementById('result');

    function paint(icon, title, text, facts = [], actions = '') {
        const { escape } = GymGo;
        result.innerHTML = `
            <span class="result-icon ${icon}"><i class="bi bi-${icon === 'ok' ? 'check-lg' : icon === 'wait' ? 'hourglass-split' : 'exclamation-lg'}" aria-hidden="true"></i></span>
            <h1>${escape(title)}</h1>
            <p>${text}</p>
            ${facts.length ? `<div class="result-facts">${facts.map(([label, value]) => `<div><span>${escape(label)}</span><b>${escape(value)}</b></div>`).join('')}</div>` : ''}
            <div class="result-actions">${actions}</div>`;
    }

    const dashboardButton = () => `<a class="btn btn-d" href="${GymGo.escape(GymGo.dashboardUrl())}"><i class="bi bi-speedometer2"></i>Ir a mi panel</a>`;

    function showActive({ organization, subscription: s }) {
        paint('ok', '¡Pago confirmado!', `${GymGo.escape(organization?.name || 'Tu gimnasio')} ya tiene el plan ${GymGo.escape(s.planName)} activo.`, [
            ['Plan', `${s.planName} · ${s.interval === 'year' ? 'anual' : 'mensual'}`],
            ['Método', METHOD_LABELS[s.method] || s.method],
            [s.renews ? 'Próxima renovación' : 'Pagado hasta', GymGo.date(s.currentPeriodEnd)],
            ['Sucursales incluidas', String(s.gymLimit)],
        ], `${dashboardButton()}<a class="btn-gg btn-gg-outline" href="pagos.html">Ver mis pagos</a>`);
    }

    function showVoucher({ subscription: s }) {
        const voucher = s.pendingPayment;
        paint('wait', 'Tu ficha OXXO está lista', 'Paga en cualquier OXXO antes de que venza. Tu plan se activa en cuanto OXXO confirme el pago (hasta 1 día hábil) y te avisamos en tu panel.', [
            ['Plan', `${s.planName} · ${voucher.interval === 'year' ? 'anual' : 'mensual'}`],
            ...(voucher.expiresAt ? [['Vence', GymGo.date(voucher.expiresAt)]] : []),
        ], `<a class="btn btn-d" href="${GymGo.escape(voucher.voucherUrl)}" target="_blank" rel="noopener"><i class="bi bi-receipt"></i>Ver e imprimir ficha</a>${dashboardButton()}`);
    }

    function showWaiting() {
        paint('wait', 'Tu pago se está confirmando', 'El banco aún no nos avisa. Si ya pagaste, no hagas un segundo pago: tu plan se activa solo en unos minutos y lo verás en tu panel.', [],
            `<button type="button" class="btn btn-d" id="checkAgain"><i class="bi bi-arrow-clockwise"></i>Revisar de nuevo</button>${dashboardButton()}`);
        document.getElementById('checkAgain').onclick = () => poll(ATTEMPTS);
    }

    async function poll(remaining) {
        let data;
        try {
            data = await GymGo.api('/subscription');
        } catch (error) {
            if (error.status === 401) {
                paint('fail', 'Inicia sesión para ver tu plan', 'Tu sesión terminó. Si ya pagaste, tu pago está a salvo: entra para confirmarlo.', [],
                    `<a class="btn btn-d" href="login.html?returnTo=${encodeURIComponent('pagos.html')}">Iniciar sesión</a>`);
                return;
            }
            if (remaining <= 1) {
                paint('fail', 'No pudimos revisar tu pago', GymGo.escape(error.message), [], `<a class="btn btn-d" href="pagos.html">Volver a pagos</a>`);
                return;
            }
        }
        const s = data?.subscription;
        if (s?.pendingPayment?.voucherUrl) return showVoucher(data);
        // Card payments wait for Stripe's webhook; PayPal was captured before arriving here.
        const confirmed = s?.status === 'active' && (!fromStripe || s.method === 'card' || s.method === 'oxxo');
        if (confirmed) return showActive(data);
        if (remaining <= 1) return showWaiting();
        setTimeout(() => poll(remaining - 1), 2000);
    }

    document.addEventListener('DOMContentLoaded', () => {
        // The session id is only for Stripe's redirect; the page never trusts it.
        if (fromStripe) history.replaceState(null, '', location.pathname);
        if (!GymGo.isSignedIn()) {
            paint('fail', 'Inicia sesión para ver tu plan', 'Si ya pagaste, tu pago está a salvo: entra con tu cuenta para confirmarlo.', [],
                `<a class="btn btn-d" href="login.html?returnTo=${encodeURIComponent('pagos.html')}">Iniciar sesión</a>`);
            return;
        }
        poll(ATTEMPTS);
    });
})();
