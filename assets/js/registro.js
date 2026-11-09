/**
 * Registro de dueños en GymGo: crea la organización con su primera sucursal y la deja activa
 * (14 días de prueba de Esencial). Después el dueño paga o entra a su panel.
 */
const COMMON_PASSWORDS = new Set([
    '1234567890', '12345678910', 'password123', 'contraseña1', 'qwerty1234',
    'qwertyuiop', 'abc1234567', 'admin12345', 'gymgo12345', '0000000000', '1111111111',
]);

const normalizeText = (value) => value.toLocaleLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const RFC_PATTERN = /^[A-ZÑ&]{3,4}\d{6}[A-Z\d]{3}$/;
const params = new URLSearchParams(location.search);
const chosenPlan = (params.get('plan') || '').toLowerCase();
const chosenInterval = params.get('interval') === 'year' ? 'year' : 'month';

function passwordChecks(password, userData) {
    const normalizedPassword = normalizeText(password);
    const personal = [userData.email, userData.nombre, userData.apellidos, userData.email.split('@')[0]]
        .map(normalizeText)
        .filter((value) => value.length > 3);
    return {
        length: password.length >= 10 && password.length <= 72,
        common: !COMMON_PASSWORDS.has(normalizedPassword),
        personal: !personal.includes(normalizedPassword),
    };
}

function updatePasswordMeter() {
    const password = document.getElementById('regPassword').value;
    const checks = passwordChecks(password, {
        email: document.getElementById('regEmail').value,
        nombre: document.getElementById('regNombre').value,
        apellidos: document.getElementById('regApellidos').value,
    });
    const meter = document.getElementById('passwordMeter');
    const status = document.getElementById('passwordStatus');
    const varied = /[A-Z]/.test(password) && /[a-z]/.test(password) && /\d/.test(password) && /[^A-Za-z0-9]/.test(password);
    const score = Number(checks.length) + Number(checks.common) + Number(checks.personal) + (password.length >= 14 ? 1 : 0) + (varied ? 1 : 0);

    meter.className = 'password-meter';
    if (password) meter.classList.add(score <= 2 ? 'is-weak' : score <= 4 ? 'is-medium' : 'is-strong');
    status.className = 'password-status';
    if (!password) status.textContent = 'Usa entre 10 y 72 caracteres.';
    else if (!checks.length) { status.textContent = 'La contraseña debe tener entre 10 y 72 caracteres.'; status.classList.add('is-invalid'); }
    else if (!checks.common || !checks.personal) { status.textContent = !checks.common ? 'Esta contraseña es muy común.' : 'No puede coincidir con tus datos personales.'; status.classList.add('is-invalid'); }
    else { status.textContent = score >= 5 ? 'Contraseña segura.' : 'Contraseña aceptable.'; status.classList.add('is-valid'); }
    return checks;
}

async function showChosenPlan() {
    if (!chosenPlan) return;
    try {
        const { plans } = await GymGo.api('/saas-plans', { auth: false });
        const plan = plans.find((item) => item.code === chosenPlan && item.selfService);
        const price = plan?.[chosenInterval === 'year' ? 'yearly' : 'monthly'];
        if (!plan || !price) return;
        document.getElementById('planSummary').textContent = plan.code === 'esencial'
            ? 'Empiezas con 14 días gratis de Esencial. Después pagas desde tu panel.'
            : `Elegiste ${plan.name}: ${GymGo.money(price.subtotal)} + IVA ${GymGo.intervalLabel(chosenInterval)}. Primero creas tu cuenta y en el siguiente paso pagas.`;
    } catch {
        // The plan summary is a courtesy; signing up works without it.
    }
}

function showDone(data) {
    const subscription = data.subscription;
    const payQuery = new URLSearchParams({ plan: chosenPlan === 'pro' ? 'pro' : (chosenPlan || 'esencial'), interval: chosenInterval });
    const payUrl = `pagos.html?${payQuery}`;

    // The trial was already used with this email or phone: the gym needs a plan right away.
    if (subscription?.status !== 'trialing') {
        location.replace(`${payUrl}&nuevo=1`);
        return;
    }

    const card = document.getElementById('registroCard');
    const done = document.getElementById('registroDone');
    const pay = document.getElementById('donePay');
    const dashboard = document.getElementById('doneDashboard');
    document.getElementById('doneText').textContent = `${data.organization?.name || 'Tu gimnasio'} tiene 14 días gratis del plan Esencial, hasta el ${GymGo.date(subscription.trialEndsAt)}. Puedes pagar ahora o cuando termine la prueba.`;
    pay.href = payUrl;
    pay.textContent = chosenPlan === 'pro' ? 'Pagar el plan Pro' : 'Elegir plan y pagar';
    dashboard.href = GymGo.dashboardUrl();
    // Who chose Pro came to pay; who chose the trial goes to their panel first.
    if (chosenPlan !== 'pro') {
        pay.className = 'btn-gg btn-gg-outline';
        dashboard.className = 'btn auth-submit';
        pay.parentElement.prepend(dashboard);
    }
    card.classList.add('d-none');
    done.classList.remove('d-none');
    done.focus();
}

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('registroForm');
    const password = document.getElementById('regPassword');
    const confirmation = document.getElementById('regPasswordConfirm');
    const confirmStatus = document.getElementById('confirmStatus');
    const email = document.getElementById('regEmail');
    const phone = document.getElementById('regTelefono');
    const rfc = document.getElementById('regRfc');
    const status = document.getElementById('registroStatus');
    const submit = document.getElementById('registroSubmit');

    if (location.search) document.getElementById('loginLink').href = `login.html?returnTo=${encodeURIComponent(`pagos.html${location.search}`)}`;
    showChosenPlan();

    ['regPassword', 'regEmail', 'regNombre', 'regApellidos'].forEach((id) => document.getElementById(id).addEventListener('input', updatePasswordMeter));
    email.addEventListener('input', () => email.setCustomValidity(EMAIL_PATTERN.test(email.value.trim()) ? '' : 'Escribe un correo electrónico válido.'));
    phone.addEventListener('input', () => { phone.value = phone.value.replace(/[^\d\s()+-]/g, ''); });
    confirmation.addEventListener('input', () => {
        const mismatch = confirmation.value && confirmation.value !== password.value;
        confirmStatus.textContent = mismatch ? 'Las contraseñas no coinciden.' : confirmation.value ? 'Las contraseñas coinciden.' : '';
        confirmStatus.className = `password-status ${mismatch ? 'is-invalid' : confirmation.value ? 'is-valid' : ''}`;
    });

    const notify = (type, message, field) => {
        window.siridStatus(status, type, message);
        if (type === 'error') {
            status.scrollIntoView({ behavior: 'smooth', block: 'center' });
            field?.focus({ preventScroll: true });
        }
    };

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const value = (id) => document.getElementById(id).value.trim();
        const digits = phone.value.replace(/\D/g, '');
        const checks = updatePasswordMeter();
        const rfcValue = rfc.value.trim().toUpperCase();

        if (value('regNegocio').length < 2) return notify('error', 'Escribe el nombre de tu negocio.', document.getElementById('regNegocio'));
        if (value('regSucursal').length < 2) return notify('error', 'Escribe el nombre de tu primera sucursal.', document.getElementById('regSucursal'));
        if (rfcValue && !RFC_PATTERN.test(rfcValue)) {
            rfc.closest('details').open = true;
            return notify('error', 'El RFC no es válido. Déjalo vacío si no lo necesitas.', rfc);
        }
        if (value('regNombre').length < 2 || !value('regApellidos')) return notify('error', 'Escribe tu nombre y apellidos.', document.getElementById(value('regNombre').length < 2 ? 'regNombre' : 'regApellidos'));
        if (!EMAIL_PATTERN.test(value('regEmail'))) return notify('error', 'Escribe un correo electrónico válido.', email);
        if (digits.length !== 10) return notify('error', 'El teléfono debe tener 10 dígitos.', phone);
        if (!checks.length || !checks.common || !checks.personal) return notify('error', 'Revisa los requisitos de la contraseña.', password);
        if (password.value !== confirmation.value) return notify('error', 'Las contraseñas no coinciden.', confirmation);
        if (!document.getElementById('acceptTerms').checked) return notify('error', 'Debes aceptar los términos y condiciones.', document.getElementById('acceptTerms'));
        if (!document.getElementById('acceptPrivacy').checked) return notify('error', 'Debes aceptar el aviso de privacidad.', document.getElementById('acceptPrivacy'));

        notify();
        window.siridLoading(submit, true, 'Activando tu gimnasio…');
        try {
            const data = await GymGo.api('/organizations/signup', {
                method: 'POST',
                auth: false,
                body: {
                    organizationName: value('regNegocio'),
                    gymName: value('regSucursal'),
                    legalName: value('regRazon') || undefined,
                    rfc: rfcValue || undefined,
                    name: value('regNombre'),
                    lastName: value('regApellidos'),
                    email: value('regEmail').toLowerCase(),
                    phone: digits,
                    password: password.value,
                    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Mexico_City',
                },
            });
            // A rejected application sent again goes back to SIRID's review and has no session yet.
            if (!data.token) {
                notify('info', data.message || 'Recibimos tu solicitud.');
                window.siridLoading(submit, false);
                return;
            }
            GymGo.saveSession(data);
            showDone(data);
        } catch (error) {
            notify('error', error.message, error.details?.[0]?.path?.[0] === 'email' ? email : undefined);
            window.siridLoading(submit, false);
        }
    });
});
