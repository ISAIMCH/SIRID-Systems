/**
 * Checkout del plan GymGo. Tarjeta y OXXO van a Stripe Checkout; PayPal usa sus botones y la API de GymGo
 * captura y verifica la orden. El plan se activa en la API (webhook de Stripe o captura de PayPal), nunca aquí.
 */
(function () {
    const $ = (selector) => document.querySelector(selector);
    const params = new URLSearchParams(location.search);
    const METHOD_LABELS = { card: 'Tarjeta', oxxo: 'OXXO', paypal: 'PayPal', manual: 'Pago con SIRID' };
    const state = { data: null, plan: null, interval: 'month', method: 'card', busy: false, paypalLoaded: false };

    const show = (element, visible) => element.classList.toggle('d-none', !visible);
    const payStatus = (type, message) => window.siridStatus($('#payStatus'), type, message);

    function selectedPrice() {
        const plan = state.data.plans.find((item) => item.code === state.plan);
        return { plan, price: plan?.[state.interval === 'year' ? 'yearly' : 'monthly'] };
    }

    // A period paid by OXXO or PayPal is respected: Stripe charges the card when it ends.
    function paidUntil() {
        const s = state.data.subscription;
        const end = s?.currentPeriodEnd ? new Date(s.currentPeriodEnd) : null;
        return s?.status === 'active' && end && end - Date.now() > 2 * 864e5 ? end : null;
    }

    function cardLocked() {
        const s = state.data.subscription;
        return Boolean(s?.renews && s.method === 'card' && s.status !== 'canceled');
    }

    /* ===== Render ===== */

    function renderBanner() {
        const s = state.data.subscription;
        const banner = $('#statusBanner');
        const { escape, date } = GymGo;
        let tone = 'info';
        let html = '';
        if (!s) {
            html = 'Tu organización no tiene un plan registrado todavía.';
        } else if (s.status === 'manual') {
            html = 'SIRID administra el plan de tu organización. Para cambiarlo, escríbenos a <a href="mailto:project.gymgo@gmail.com">project.gymgo@gmail.com</a>.';
        } else if (s.phase === 'expired') {
            tone = 'danger';
            html = `<b>Tu plan venció.</b> Tu gimnasio está pausado para tu equipo y tus clientes. Paga para reactivarlo al instante.`;
        } else if (s.phase === 'grace') {
            tone = 'danger';
            html = `<b>Tu plan venció el ${date(s.lapsedAt)}.</b> Tu equipo y tus clientes pueden seguir hasta el ${date(s.graceEndsAt)}; paga para no interrumpir el servicio.`;
        } else if (cardLocked()) {
            html = `Tu plan <b>${escape(s.planName)}</b> se renueva con tarjeta el ${date(s.currentPeriodEnd)}. Para cambiar de plan, de tarjeta o cancelar, usa el portal de Stripe.
                <button type="button" class="mini-btn ms-1" id="openPortal"><i class="bi bi-box-arrow-up-right"></i>Administrar mi plan</button>`;
        } else if (s.status === 'trialing') {
            html = `Prueba gratis de <b>${escape(s.planName)}</b>: te quedan ${s.daysLeft} día(s), hasta el ${date(s.trialEndsAt)}. Puedes pagar ahora; tu plan empieza hoy.`;
        } else if (s.status === 'active') {
            html = `Plan <b>${escape(s.planName)}</b> pagado hasta el ${date(s.currentPeriodEnd)}. Puedes pagar el siguiente periodo por adelantado.`;
        }
        if (s?.pendingPayment?.voucherUrl) {
            html += `<div class="mt-2"><i class="bi bi-upc-scan me-1"></i>Tienes una ficha OXXO pendiente${s.pendingPayment.expiresAt ? ` (vence el ${date(s.pendingPayment.expiresAt)})` : ''}.
                <a class="mini-btn ms-1" href="${escape(s.pendingPayment.voucherUrl)}" target="_blank" rel="noopener"><i class="bi bi-receipt"></i>Ver ficha</a></div>`;
        }
        banner.className = `status-banner is-${tone}`;
        banner.innerHTML = html;
        show(banner, Boolean(html));
        $('#openPortal')?.addEventListener('click', openPortal);
    }

    function renderPlans() {
        const { escape, money, intervalLabel } = GymGo;
        $('#intervalToggle').querySelectorAll('button').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.interval === state.interval)));
        $('#planOptions').innerHTML = state.data.plans.filter((plan) => plan.selfService).map((plan) => {
            const price = plan[state.interval === 'year' ? 'yearly' : 'monthly'];
            const checked = plan.code === state.plan;
            const current = state.data.subscription?.planCode === plan.code && state.data.subscription?.status === 'active';
            return `<div class="col-md-6">
                <label class="plan-option ${checked ? 'is-selected' : ''}">
                    <input type="radio" name="plan" value="${escape(plan.code)}" ${checked ? 'checked' : ''}>
                    <span class="plan-option-head"><span class="plan-option-name">${escape(plan.name)}</span>${plan.featured ? '<span class="plan-option-tag">Más elegido</span>' : ''}${current ? '<span class="plan-option-tag is-current">Tu plan</span>' : ''}</span>
                    <span class="plan-option-price">${money(price.subtotal)} <small>+ IVA ${intervalLabel(state.interval)}</small></span>
                    <span class="plan-option-desc">${escape((plan.highlights || []).slice(0, 2).join(' · '))}</span>
                </label>
            </div>`;
        }).join('');
    }

    function renderSummary() {
        const { plan, price } = selectedPrice();
        const { escape, money, date } = GymGo;
        if (!plan || !price) return;
        const period = state.interval === 'year' ? '1 año' : '1 mes';
        const firstCharge = state.method === 'card' ? paidUntil() : null;
        const renew = {
            card: firstCharge
                ? `Primer cobro el ${date(firstCharge)}: respetamos el periodo que ya pagaste. Después se renueva ${GymGo.intervalLabel(state.interval)} hasta que canceles.`
                : `Se renueva ${GymGo.intervalLabel(state.interval)} con la misma tarjeta hasta que canceles.`,
            oxxo: `Pago único por ${period}. No se renueva solo.`,
            paypal: `Pago único por ${period}. No se renueva solo.`,
        }[state.method];
        $('#summaryOrg').textContent = state.data.organization?.name || '';
        $('#summaryItems').innerHTML = `<div class="summary-line"><span class="name">GymGo ${escape(plan.name)}<small>${state.interval === 'year' ? 'Anual · pagas 10 meses' : 'Mensual'} · ${METHOD_LABELS[state.method]}</small></span><span class="val">${money(price.subtotal)}</span></div>`;
        $('#summaryTotals').innerHTML = `
            <div class="row-line"><span>Subtotal</span><span>${money(price.subtotal)}</span></div>
            <div class="row-line"><span>IVA (16%)</span><span>${money(price.tax)}</span></div>
            <div class="row-line grand"><span>Total MXN</span><span>${money(price.total)}</span></div>
            <div class="renew">${renew}</div>`;
        $('#totTop').textContent = money(price.total);
        const locked = cardLocked() || state.data.subscription?.status === 'manual';
        $('#payCard').disabled = locked || !state.data.payments.card || state.busy;
        $('#payOxxo').disabled = locked || !state.data.payments.oxxo || state.busy;
        $('#payCard span').textContent = `Pagar ${money(price.total)} con tarjeta`;
        $('#payOxxo span').textContent = `Generar ficha OXXO por ${money(price.total)}`;
        show($('#paypalButtons'), !locked);
    }

    function renderMethods() {
        const { payments } = state.data;
        document.querySelectorAll('.pay-tabs [data-method]').forEach((tab) => {
            const available = Boolean(payments[tab.dataset.method]);
            tab.disabled = !available;
            tab.querySelector('small').textContent = available
                ? { card: 'Se renueva sola', oxxo: 'Efectivo', paypal: 'Tu cuenta' }[tab.dataset.method]
                : 'No disponible';
        });
        document.querySelectorAll('[data-test-hint]').forEach((hint) => show(hint, payments.testMode));
        show($('#testBadge'), payments.testMode);
        // Opens the first method that works.
        const first = ['card', 'oxxo', 'paypal'].find((method) => payments[method]);
        if (!first) payStatus('info', 'Los pagos en línea no están disponibles en este momento. Escríbenos y te ayudamos a activar tu plan.');
        else if (!payments[state.method]) bootstrap.Tab.getOrCreateInstance(document.querySelector(`.pay-tabs [data-method="${first}"]`)).show();
    }

    async function renderHistory() {
        try {
            const { payments } = await GymGo.api('/subscription/payments');
            if (!payments?.length) return;
            const { escape, money, date } = GymGo;
            $('#history').innerHTML = payments.slice(0, 6).map((payment) => `
                <div class="tx">
                    <span class="tx-icon"><i class="bi bi-${payment.method === 'paypal' ? 'paypal' : payment.method === 'oxxo' ? 'shop' : 'credit-card'}"></i></span>
                    <div><div class="tx-id">GymGo ${escape(payment.planCode)} · ${payment.interval === 'year' ? 'anual' : 'mensual'}</div>
                        <div class="tx-meta">${date(payment.paidAt)} · ${METHOD_LABELS[payment.method] || escape(payment.method)} · hasta el ${date(payment.periodEnd)}</div></div>
                    <div class="tx-side"><span class="amount">${money(payment.amount)}</span><span class="status-pill paid">Pagado</span></div>
                </div>`).join('');
            show($('#historyPanel'), true);
        } catch {
            // The history is secondary; the checkout works without it.
        }
    }

    function renderAll() {
        renderBanner();
        renderPlans();
        renderSummary();
    }

    /* ===== Payments ===== */

    async function stripeCheckout(method) {
        if (state.busy) return;
        const button = method === 'card' ? $('#payCard') : $('#payOxxo');
        state.busy = true;
        payStatus();
        window.siridLoading(button, true, 'Abriendo pago seguro…');
        try {
            const { url } = await GymGo.api('/subscription/checkout', {
                method: 'POST',
                body: {
                    planCode: state.plan,
                    interval: state.interval,
                    method,
                    successUrl: new URL('pago-exitoso.html', location.href).href,
                    cancelUrl: new URL(`pagos.html?plan=${state.plan}&interval=${state.interval}&cancelado=1`, location.href).href,
                },
            });
            location.href = url;
        } catch (error) {
            state.busy = false;
            window.siridLoading(button, false);
            handlePayError(error);
        }
    }

    function handlePayError(error) {
        if (error.status === 401) return showGate();
        payStatus('error', error.message);
        if (error.code === 'subscription_active') load();
    }

    async function openPortal() {
        const button = $('#openPortal');
        window.siridLoading(button, true, 'Abriendo…');
        try {
            const { url } = await GymGo.api('/subscription/portal', { method: 'POST', body: { returnUrl: location.href } });
            location.href = url;
        } catch (error) {
            window.siridLoading(button, false);
            payStatus('error', error.message);
        }
    }

    function loadPaypal() {
        const { paypal: enabled, paypalClientId } = state.data.payments;
        if (!enabled || !paypalClientId || state.paypalLoaded) return;
        state.paypalLoaded = true;
        const script = document.createElement('script');
        script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(paypalClientId)}&currency=MXN&intent=capture&components=buttons&disable-funding=card,credit&locale=es_MX`;
        script.onerror = () => { $('#paypalButtons').innerHTML = '<p class="small text-muted">No se pudo cargar PayPal. Recarga la página o usa otro método.</p>'; };
        script.onload = () => {
            window.paypal.Buttons({
                style: { layout: 'vertical', shape: 'pill', label: 'pay' },
                onClick: (data, actions) => (state.busy || cardLocked() ? actions.reject() : actions.resolve()),
                createOrder: async () => {
                    payStatus();
                    try {
                        const { orderId } = await GymGo.api('/subscription/paypal/orders', { method: 'POST', body: { planCode: state.plan, interval: state.interval } });
                        return orderId;
                    } catch (error) {
                        handlePayError(error);
                        throw error;
                    }
                },
                onApprove: async ({ orderID }) => {
                    state.busy = true;
                    payStatus('info', 'Confirmando tu pago con PayPal…');
                    try {
                        await GymGo.api(`/subscription/paypal/orders/${encodeURIComponent(orderID)}/capture`, { method: 'POST', body: {} });
                        location.href = 'pago-exitoso.html?provider=paypal';
                    } catch (error) {
                        state.busy = false;
                        handlePayError(error);
                    }
                },
                onCancel: () => payStatus('info', 'Cancelaste el pago en PayPal. No se hizo ningún cargo.'),
                onError: () => { if (!$('#payStatus').textContent) payStatus('error', 'PayPal no pudo completar el pago. Inténtalo de nuevo o usa otro método.'); },
            }).render('#paypalButtons');
        };
        document.head.appendChild(script);
    }

    /* ===== Session ===== */

    function showGate() {
        GymGo.clearSession();
        show($('#loadingState'), false);
        show($('#checkout'), false);
        show($('#accountGate'), true);
        show($('#signOut'), false);
        $('#sessionUser').textContent = '';
        $('#gateSignup').href = `registro.html${location.search}`;
        document.querySelector('.checkout-steps li').className = 'current';
        document.querySelectorAll('.checkout-steps li')[1].className = '';
    }

    function showError(message) {
        show($('#loadingState'), false);
        const box = $('#errorState');
        box.innerHTML = `<i class="bi bi-exclamation-circle"></i><span></span>
            <div class="d-flex flex-wrap gap-2 justify-content-center mt-3"><button type="button" class="btn-gg btn-gg-outline btn-gg-sm" data-retry>Reintentar</button><button type="button" class="btn-gg btn-gg-ghost btn-gg-sm" data-switch>Usar otra cuenta</button></div>`;
        box.querySelector('span').textContent = message;
        box.querySelector('[data-retry]').onclick = () => { show(box, false); show($('#loadingState'), true); load(); };
        box.querySelector('[data-switch]').onclick = () => { show(box, false); showGate(); };
        show(box, true);
    }

    async function load() {
        if (!GymGo.isSignedIn()) return showGate();
        try {
            state.data = await GymGo.api('/subscription');
        } catch (error) {
            if (error.status === 401) return showGate();
            return showError(error.status === 403 ? 'Solo el dueño del gimnasio puede pagar el plan de GymGo. Entra con la cuenta del dueño.' : error.message);
        }
        const selfService = state.data.plans.filter((plan) => plan.selfService);
        const wanted = [params.get('plan'), state.data.subscription?.planCode, 'esencial'].find((code) => selfService.some((plan) => plan.code === code));
        state.plan = state.plan || wanted || selfService[0]?.code;
        state.interval = params.get('interval') === 'year' || (!params.get('interval') && state.data.subscription?.interval === 'year') ? 'year' : state.interval;

        show($('#loadingState'), false);
        show($('#accountGate'), false);
        show($('#checkout'), true);
        $('#sessionUser').textContent = GymGo.userName();
        show($('#signOut'), true);
        if (params.get('cancelado')) payStatus('info', 'Cancelaste el pago. No se hizo ningún cargo; puedes intentarlo de nuevo.');
        else if (params.get('nuevo')) payStatus('info', 'Ya usaste tu prueba gratuita con ese correo o teléfono: elige un plan para activar tu gimnasio.');
        renderMethods();
        renderAll();
        renderHistory();
        loadPaypal();
    }

    document.addEventListener('DOMContentLoaded', () => {
        if (params.get('interval') === 'year') state.interval = 'year';

        $('#planOptions').addEventListener('change', (event) => {
            if (event.target.name !== 'plan') return;
            state.plan = event.target.value;
            renderPlans();
            renderSummary();
        });
        $('#intervalToggle').addEventListener('click', (event) => {
            const button = event.target.closest('button[data-interval]');
            if (!button) return;
            state.interval = button.dataset.interval;
            renderPlans();
            renderSummary();
        });
        document.querySelectorAll('.pay-tabs [data-method]').forEach((tab) => tab.addEventListener('shown.bs.tab', () => {
            state.method = tab.dataset.method;
            payStatus();
            renderSummary();
        }));
        $('#payCard').addEventListener('click', () => stripeCheckout('card'));
        $('#payOxxo').addEventListener('click', () => stripeCheckout('oxxo'));
        $('#signOut').addEventListener('click', showGate);

        $('#gateForm').addEventListener('submit', async (event) => {
            event.preventDefault();
            const submit = $('#gateSubmit');
            const status = $('#gateStatus');
            window.siridStatus(status);
            window.siridLoading(submit, true, 'Entrando…');
            try {
                const data = await GymGo.api('/auth/login', {
                    method: 'POST',
                    auth: false,
                    body: { email: $('#gateEmail').value.trim().toLowerCase(), password: $('#gatePassword').value },
                });
                GymGo.saveSession(data);
                document.querySelector('.checkout-steps li').className = 'done';
                document.querySelectorAll('.checkout-steps li')[1].className = 'current';
                show($('#accountGate'), false);
                show($('#loadingState'), true);
                await load();
            } catch (error) {
                window.siridStatus(status, 'error', error.status === 400 ? 'Correo o contraseña incorrectos.' : error.message);
            } finally {
                window.siridLoading(submit, false);
            }
        });

        load();
    });
})();
