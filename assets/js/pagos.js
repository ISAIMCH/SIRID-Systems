/**
 * Checkout del plan GymGo.
 * - Modo simulado (payments.simulated, evaluación escolar): tarjeta, ficha OXXO y PayPal se cobran en la API sin
 *   proveedores reales; el servidor decide si el pago pasa y activa el plan.
 * - Modo Stripe: tarjeta y OXXO van a Stripe Checkout y el plan se activa con el webhook, nunca aquí.
 */
(function () {
    const $ = (selector) => document.querySelector(selector);
    const params = new URLSearchParams(location.search);
    const METHOD_LABELS = { card: 'Tarjeta', oxxo: 'OXXO', paypal: 'PayPal', manual: 'Pago con SIRID' };
    const state = { data: null, plan: null, interval: 'month', method: 'card', busy: false };

    const show = (element, visible) => element.classList.toggle('d-none', !visible);
    const simulated = () => Boolean(state.data?.payments?.simulated);
    // One id per payment attempt: the API never charges the same attempt twice.
    const newAttemptId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`);
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
        if (s?.pendingPayment?.simulated) {
            html += `<div class="mt-2"><i class="bi bi-upc-scan me-1"></i>Tienes una ficha OXXO pendiente por ${GymGo.money(s.pendingPayment.amount)} (vence el ${date(s.pendingPayment.expiresAt)}).
                <button type="button" class="mini-btn ms-1" id="showVoucher"><i class="bi bi-receipt"></i>Ver ficha</button></div>`;
        } else if (s?.pendingPayment?.voucherUrl) {
            html += `<div class="mt-2"><i class="bi bi-upc-scan me-1"></i>Tienes una ficha OXXO pendiente${s.pendingPayment.expiresAt ? ` (vence el ${date(s.pendingPayment.expiresAt)})` : ''}.
                <a class="mini-btn ms-1" href="${escape(s.pendingPayment.voucherUrl)}" target="_blank" rel="noopener"><i class="bi bi-receipt"></i>Ver ficha</a></div>`;
        }
        banner.className = `status-banner is-${tone}`;
        banner.innerHTML = html;
        show(banner, Boolean(html));
        $('#openPortal')?.addEventListener('click', openPortal);
        $('#showVoucher')?.addEventListener('click', () => {
            bootstrap.Tab.getOrCreateInstance(document.querySelector('.pay-tabs [data-method="oxxo"]')).show();
            $('#t-oxxo').scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
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
        const renew = simulated() ? {
            card: `Pago único por ${period}. Tu plan se activa en cuanto se aprueba la tarjeta. No se renueva solo.`,
            oxxo: `Pago único por ${period}. Tu plan se activa cuando pagas la ficha. No se renueva solo.`,
            paypal: `Pago único por ${period} con tu cuenta PayPal. No se renueva solo.`,
        }[state.method] : {
            card: firstCharge
                ? `Primer cobro el ${date(firstCharge)}: respetamos el periodo que ya pagaste. Después se renueva ${GymGo.intervalLabel(state.interval)} hasta que canceles.`
                : `Se renueva ${GymGo.intervalLabel(state.interval)} con la misma tarjeta hasta que canceles.`,
            oxxo: `Pago único por ${period}. No se renueva solo.`,
            paypal: 'Simulación de PayPal: activa una prueba de 5 días de este plan. No se cobra nada.',
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
        $('#payOxxo span').textContent = state.data.subscription?.pendingPayment?.simulated ? `Generar una ficha nueva por ${money(price.total)}` : `Generar ficha OXXO por ${money(price.total)}`;
        show($('#paypalButtons'), !locked);
        if ($('#payPaypal') && !state.busy) $('#payPaypal').disabled = locked;
    }

    function renderMethods() {
        const { payments } = state.data;
        document.querySelectorAll('.pay-tabs [data-method]').forEach((tab) => {
            const available = Boolean(payments[tab.dataset.method]);
            tab.disabled = !available;
            tab.querySelector('small').textContent = available
                ? { card: payments.simulated ? 'Al instante' : 'Se renueva sola', oxxo: 'Efectivo', paypal: 'Tu cuenta' }[tab.dataset.method]
                : 'No disponible';
        });
        document.querySelectorAll('[data-test-hint]').forEach((hint) => show(hint, payments.testMode && !payments.simulated));
        document.querySelectorAll('[data-sim-only]').forEach((element) => show(element, Boolean(payments.simulated)));
        document.querySelectorAll('[data-stripe-only]:not([data-test-hint])').forEach((element) => show(element, !payments.simulated));
        show($('#simCardForm'), Boolean(payments.simulated));
        $('#testBadge').innerHTML = payments.simulated ? '<i class="bi bi-cone-striped"></i>Pagos simulados' : '<i class="bi bi-cone-striped"></i>Modo prueba';
        show($('#testBadge'), payments.testMode);
        // Opens the first method that works.
        const first = ['card', 'oxxo', 'paypal'].find((method) => payments[method]);
        if (!first) payStatus('info', 'Los pagos en línea no están disponibles en este momento. Escríbenos y te ayudamos a activar tu plan.');
        else if (!payments[state.method]) bootstrap.Tab.getOrCreateInstance(document.querySelector(`.pay-tabs [data-method="${first}"]`)).show();
    }

    function paymentLabel(payment) {
        const details = payment.details || {};
        if (payment.method === 'card' && details.last4) return `${details.brand || 'Tarjeta'} •••• ${details.last4}`;
        if (payment.method === 'paypal' && details.payer) return `PayPal (${details.payer})`;
        return METHOD_LABELS[payment.method] || payment.method;
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
                        <div class="tx-meta">${date(payment.paidAt)} · ${escape(paymentLabel(payment))} · hasta el ${date(payment.periodEnd)}</div></div>
                    <div class="tx-side"><span class="amount">${money(payment.amount)}</span><span class="status-pill paid">${payment.provider === 'simulated' ? 'Pagado (simulado)' : 'Pagado'}</span></div>
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
        renderVoucher();
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

    /* ===== Pagos simulados ===== */

    async function paySimulated(path, body, button, loadingText) {
        if (state.busy || cardLocked()) return null;
        state.busy = true;
        payStatus();
        if (button) window.siridLoading(button, true, loadingText);
        try {
            return await GymGo.api(path, { method: 'POST', body: { planCode: state.plan, interval: state.interval, ...body } });
        } catch (error) {
            state.busy = false;
            if (button) window.siridLoading(button, false);
            throw error;
        }
    }

    const digitsOnly = (value) => value.replace(/\D/g, '');

    function brandOf(number) {
        if (/^4/.test(number)) return 'Visa';
        if (/^(5[1-5]|2[2-7])/.test(number)) return 'Mastercard';
        if (/^3[47]/.test(number)) return 'Amex';
        return '';
    }

    function luhn(number) {
        let sum = 0;
        [...number].reverse().forEach((char, index) => {
            let digit = Number(char);
            if (index % 2 === 1) digit = digit * 2 > 9 ? digit * 2 - 9 : digit * 2;
            sum += digit;
        });
        return number.length >= 13 && sum % 10 === 0;
    }

    function setupCardInputs() {
        const number = $('#cardNumber');
        const exp = $('#cardExp');
        const cvc = $('#cardCvc');
        number.addEventListener('input', () => {
            const digits = digitsOnly(number.value).slice(0, 19);
            number.value = digits.replace(/(\d{4})(?=\d)/g, '$1 ');
            $('#cardBrand').textContent = brandOf(digits);
        });
        exp.addEventListener('input', () => {
            const digits = digitsOnly(exp.value).slice(0, 4);
            exp.value = digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
        });
        cvc.addEventListener('input', () => { cvc.value = digitsOnly(cvc.value).slice(0, 4); });
    }

    function readCard() {
        const holder = $('#cardHolder').value.trim();
        const number = digitsOnly($('#cardNumber').value);
        const [month, year] = $('#cardExp').value.split('/').map(Number);
        const cvc = $('#cardCvc').value;
        const now = new Date();
        const fullYear = 2000 + (year || 0);
        if (holder.length < 2) return { error: 'Escribe el nombre como aparece en la tarjeta.', field: '#cardHolder' };
        if (!luhn(number)) return { error: 'Revisa el número de tarjeta.', field: '#cardNumber' };
        if (!month || month > 12 || !year) return { error: 'Escribe el vencimiento como MM/AA.', field: '#cardExp' };
        if (fullYear < now.getFullYear() || (fullYear === now.getFullYear() && month < now.getMonth() + 1)) return { error: 'La tarjeta está vencida.', field: '#cardExp' };
        if (!/^\d{3,4}$/.test(cvc)) return { error: 'El CVC tiene 3 o 4 dígitos.', field: '#cardCvc' };
        return { card: { holder, number, expMonth: month, expYear: fullYear, cvc } };
    }

    async function simulatedCard() {
        const { card, error, field } = readCard();
        if (error) {
            payStatus('error', error);
            $(field).focus();
            return;
        }
        try {
            const result = await paySimulated('/subscription/simulated/card', { attemptId: newAttemptId(), card }, $('#payCard'), 'Procesando pago…');
            if (!result) return;
            $('#simCardForm').reset();
            location.href = 'pago-exitoso.html?provider=simulated';
        } catch (requestError) {
            handlePayError(requestError);
        }
    }

    async function simulatedOxxo() {
        try {
            const result = await paySimulated('/subscription/simulated/oxxo', {}, $('#payOxxo'), 'Generando ficha…');
            if (!result) return;
            state.busy = false;
            window.siridLoading($('#payOxxo'), false);
            state.data.subscription = result.subscription;
            renderAll();
            payStatus('success', 'Tu ficha está lista. Págala en cualquier OXXO antes de que venza.');
        } catch (error) {
            handlePayError(error);
        }
    }

    // Decorative bars from the reference digits, so each voucher looks different; the number below is what counts.
    function barcodeSvg(digits) {
        let x = 0;
        const bars = [];
        for (const char of `1${digits}1`) {
            const value = Number(char);
            for (const width of [1 + (value % 3), 1 + ((value + 1) % 2), 2 + (value % 2)]) {
                bars.push(`<rect x="${x}" y="0" width="${width}" height="60"/>`);
                x += width + 1 + ((value + width) % 2);
            }
        }
        return `<svg class="oxxo-barcode" viewBox="0 0 ${x} 60" preserveAspectRatio="none" role="img" aria-label="Código de barras de la ficha">${bars.join('')}</svg>`;
    }

    function renderVoucher() {
        const box = $('#oxxoVoucher');
        const pending = state.data.subscription?.pendingPayment;
        if (!pending?.simulated) {
            show(box, false);
            box.innerHTML = '';
            return;
        }
        const { escape, money, date } = GymGo;
        const plan = state.data.plans.find((item) => item.code === pending.planCode);
        const reference = pending.barcode.replace(/(\d{4})(?=\d)/g, '$1 ');
        box.innerHTML = `
            <div class="oxxo-voucher-head"><span class="oxxo-logo">OXXO</span><span>Ficha de pago</span></div>
            <div class="oxxo-voucher-amount"><span>Monto a pagar</span><strong>${money(pending.amount)} MXN</strong></div>
            ${barcodeSvg(pending.barcode)}
            <div class="oxxo-reference">${escape(reference)}</div>
            <dl class="oxxo-facts">
                <div><dt>Concepto</dt><dd>GymGo ${escape(plan?.name || pending.planCode)} · ${pending.interval === 'year' ? 'anual' : 'mensual'}</dd></div>
                <div><dt>Vence</dt><dd>${date(pending.expiresAt)}</dd></div>
                <div><dt>Beneficiario</dt><dd>SIRID Systems · GymGo</dd></div>
            </dl>
            <ol class="oxxo-steps"><li>Ve a cualquier OXXO y pide hacer un pago de servicio.</li><li>Dicta la referencia de 14 dígitos y paga en efectivo.</li><li>Conserva tu ticket; tu plan se activa al confirmarse el pago.</li></ol>
            <div class="oxxo-actions">
                <button type="button" class="btn btn-d" id="oxxoPaid"><i class="bi bi-shop"></i><span>Simular pago en tienda</span></button>
                <button type="button" class="btn-gg btn-gg-outline btn-gg-sm" id="oxxoPrint"><i class="bi bi-printer"></i>Imprimir</button>
                <button type="button" class="btn btn-link btn-sm text-danger" id="oxxoCancel">Cancelar ficha</button>
            </div>`;
        show(box, true);
        $('#oxxoPrint').onclick = () => window.print();
        $('#oxxoPaid').onclick = payOxxoVoucher;
        $('#oxxoCancel').onclick = cancelOxxoVoucher;
    }

    async function payOxxoVoucher() {
        if (state.busy) return;
        const button = $('#oxxoPaid');
        state.busy = true;
        payStatus();
        window.siridLoading(button, true, 'Confirmando pago en tienda…');
        try {
            await GymGo.api('/subscription/simulated/oxxo/pay', { method: 'POST', body: {} });
            location.href = 'pago-exitoso.html?provider=simulated';
        } catch (error) {
            state.busy = false;
            window.siridLoading(button, false);
            handlePayError(error);
            if (error.code === 'voucher_expired' || error.code === 'no_pending_voucher') load();
        }
    }

    async function cancelOxxoVoucher() {
        if (state.busy) return;
        try {
            const { subscription } = await GymGo.api('/subscription/simulated/oxxo', { method: 'DELETE' });
            state.data.subscription = subscription;
            renderAll();
            payStatus('info', 'Cancelaste la ficha. Puedes generar otra o pagar con otro método.');
        } catch (error) {
            handlePayError(error);
        }
    }

    /* PayPal simulado: una ventana con inicio de sesión y confirmación del cargo. */
    let paypalModal = null;
    let paypalPayer = '';

    function paypalStep(step) {
        show($('#ppLogin'), step === 'login');
        show($('#ppReview'), step === 'review');
        window.siridStatus($('#ppStatus'));
    }

    function openPaypalModal() {
        if (state.busy || cardLocked()) return;
        const { plan, price } = selectedPrice();
        $('#ppConcept').textContent = `GymGo ${plan.name} · ${state.interval === 'year' ? 'anual' : 'mensual'}`;
        $('#ppTotal').textContent = `${GymGo.money(price.total)} MXN`;
        paypalStep(paypalPayer ? 'review' : 'login');
        paypalModal.show();
    }

    function setupPaypalModal() {
        paypalModal = bootstrap.Modal.getOrCreateInstance($('#paypalModal'));
        $('#paypalModal').addEventListener('shown.bs.modal', () => (paypalPayer ? $('#ppPay') : $('#ppEmail')).focus());
        $('#ppLogin').addEventListener('submit', (event) => {
            event.preventDefault();
            const email = $('#ppEmail').value.trim().toLowerCase();
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || !$('#ppPassword').value) {
                window.siridStatus($('#ppStatus'), 'error', 'Escribe tu correo y contraseña de PayPal.');
                return;
            }
            paypalPayer = email;
            $('#ppPassword').value = '';
            $('#ppPayer').textContent = email;
            paypalStep('review');
            $('#ppPay').focus();
        });
        $('#ppSwitch').addEventListener('click', () => {
            paypalPayer = '';
            paypalStep('login');
            $('#ppEmail').focus();
        });
        $('#ppPay').addEventListener('click', async () => {
            try {
                const result = await paySimulated('/subscription/simulated/paypal', { attemptId: newAttemptId(), payerEmail: paypalPayer }, $('#ppPay'), 'Procesando…');
                if (!result) return;
                location.href = 'pago-exitoso.html?provider=simulated';
            } catch (error) {
                if (error.status === 401) {
                    paypalModal.hide();
                    showGate();
                    return;
                }
                window.siridStatus($('#ppStatus'), 'error', error.message);
            }
        });
    }


    // PayPal simulado (evaluación escolar): no carga el SDK ni habla con PayPal. La API da una prueba de
    // 5 días del plan elegido, una sola vez. PayPal se quitará del proyecto después de la evaluación.
    function renderPaypalDemo() {
        if (!state.data.payments.paypal) return;
        const slot = $('#paypalButtons');
        slot.innerHTML = '<button type="button" class="paypal-demo-btn w-100" id="payPaypal"><i class="bi bi-paypal" aria-hidden="true"></i><span>Pagar con PayPal</span></button>';
        $('#payPaypal').disabled = cardLocked() || state.data.subscription?.status === 'manual';
        $('#payPaypal').addEventListener('click', () => (simulated() ? openPaypalModal() : paypalDemo()));
    }

    async function paypalDemo() {
        if (state.busy || cardLocked()) return;
        const button = $('#payPaypal');
        state.busy = true;
        payStatus();
        window.siridLoading(button, true, 'Conectando con PayPal…');
        try {
            const { trialDays, subscription } = await GymGo.api('/subscription/paypal/demo', { method: 'POST', body: { planCode: state.plan } });
            window.alert(`¡Pago con PayPal aprobado! (simulación)

Tu plan ${subscription.planName} queda activo con una prueba de ${trialDays} días.`);
            state.busy = false;
            await load();
            payStatus('success', `Pago simulado con PayPal: ${subscription.planName} activo por ${trialDays} días. Ya puedes entrar a tu panel.`);
        } catch (error) {
            state.busy = false;
            window.siridLoading(button, false);
            handlePayError(error);
        }
    }

    // PayPal real (desactivado): botones del SDK con captura y verificación en la API.
    // function loadPaypal() {
    //     const { paypal: enabled, paypalClientId } = state.data.payments;
    //     if (!enabled || !paypalClientId || state.paypalLoaded) return;
    //     state.paypalLoaded = true;
    //     const script = document.createElement('script');
    //     script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(paypalClientId)}&currency=MXN&intent=capture&components=buttons&disable-funding=card,credit&locale=es_MX`;
    //     script.onerror = () => { $('#paypalButtons').innerHTML = '<p class="small text-muted">No se pudo cargar PayPal. Recarga la página o usa otro método.</p>'; };
    //     script.onload = () => {
    //         window.paypal.Buttons({
    //             style: { layout: 'vertical', shape: 'pill', label: 'pay' },
    //             onClick: (data, actions) => (state.busy || cardLocked() ? actions.reject() : actions.resolve()),
    //             createOrder: async () => {
    //                 payStatus();
    //                 try {
    //                     const { orderId } = await GymGo.api('/subscription/paypal/orders', { method: 'POST', body: { planCode: state.plan, interval: state.interval } });
    //                     return orderId;
    //                 } catch (error) {
    //                     handlePayError(error);
    //                     throw error;
    //                 }
    //             },
    //             onApprove: async ({ orderID }) => {
    //                 state.busy = true;
    //                 payStatus('info', 'Confirmando tu pago con PayPal…');
    //                 try {
    //                     await GymGo.api(`/subscription/paypal/orders/${encodeURIComponent(orderID)}/capture`, { method: 'POST', body: {} });
    //                     location.href = 'pago-exitoso.html?provider=paypal';
    //                 } catch (error) {
    //                     state.busy = false;
    //                     handlePayError(error);
    //                 }
    //             },
    //             onCancel: () => payStatus('info', 'Cancelaste el pago en PayPal. No se hizo ningún cargo.'),
    //             onError: () => { if (!$('#payStatus').textContent) payStatus('error', 'PayPal no pudo completar el pago. Inténtalo de nuevo o usa otro método.'); },
    //         }).render('#paypalButtons');
    //     };
    //     document.head.appendChild(script);
    // }

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
        renderPaypalDemo();
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
        $('#payCard').addEventListener('click', () => (simulated() ? simulatedCard() : stripeCheckout('card')));
        $('#payOxxo').addEventListener('click', () => (simulated() ? simulatedOxxo() : stripeCheckout('oxxo')));
        $('#simCardForm').addEventListener('submit', (event) => { event.preventDefault(); simulatedCard(); });
        setupCardInputs();
        setupPaypalModal();
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
                if (error.code === 'email_not_verified') {
                    // Confirms the email here; the reload opens the checkout with the new session.
                    await GymGo.verifyEmail($('#gateForm').parentElement, $('#gateEmail').value.trim().toLowerCase(), { inputClass: 'form-control gg-input', buttonClass: 'btn btn-d w-100' });
                    location.reload();
                    return;
                }
                window.siridStatus(status, 'error', error.status === 400 ? 'Correo o contraseña incorrectos.' : error.message);
            } finally {
                window.siridLoading(submit, false);
            }
        });

        load();
    });
})();
