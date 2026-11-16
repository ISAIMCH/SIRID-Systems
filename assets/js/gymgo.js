/**
 * Conexión de la web con la API de GymGo (planes, cuentas de dueños y pagos).
 * La sesión se guarda con las mismas claves que el dashboard, así el dueño entra a su panel sin volver a iniciar sesión.
 */
(function () {
    const FIELD_LABELS = {
        email: 'el correo', password: 'la contraseña', phone: 'el teléfono', name: 'tu nombre', lastName: 'tus apellidos',
        organizationName: 'el nombre de tu negocio', gymName: 'el nombre de la sucursal', rfc: 'el RFC', legalName: 'la razón social',
    };

    class GymGoError extends Error {
        constructor(message, status, code, details) {
            super(message);
            this.status = status;
            this.code = code;
            this.details = details;
        }
    }

    // The API explains validation errors per field (in English); this turns the first one into a Spanish sentence.
    function validationMessage(data) {
        const issue = Array.isArray(data.details) ? data.details[0] : null;
        const field = issue?.path?.[0];
        if (!field) return data.error;
        if (field === 'password') return 'La contraseña debe tener entre 10 y 72 caracteres.';
        if (field === 'phone') return 'El teléfono debe tener 10 dígitos.';
        return `Revisa ${FIELD_LABELS[field] || 'los datos enviados'}.`;
    }

    async function api(path, { method = 'GET', body, auth = true } = {}) {
        const headers = { Accept: 'application/json' };
        if (body !== undefined) headers['Content-Type'] = 'application/json';
        const token = localStorage.getItem('token');
        if (auth && token) headers.Authorization = `Bearer ${token}`;
        let response;
        try {
            response = await fetch(`${window.GYMGO_API_URL}/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
        } catch {
            throw new GymGoError('No pudimos conectar con GymGo. Revisa tu conexión e inténtalo de nuevo.', 0);
        }
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            if (response.status === 401 && auth) clearSession();
            const message = response.status === 400 && data.details ? validationMessage(data) : data.error;
            throw new GymGoError(message || 'GymGo no pudo completar la operación.', response.status, data.code, data.details);
        }
        return data;
    }

    function saveSession(data) {
        if (!data?.token) return;
        localStorage.setItem('token', data.token);
        localStorage.setItem('userName', data.user?.name || data.user?.nombre || '');
        localStorage.setItem('userData', JSON.stringify(data.user || {}));
        localStorage.setItem('session', JSON.stringify({
            user: data.user, organization: data.organization ?? null, gyms: data.gyms || [], defaultGymId: data.defaultGymId ?? null,
            organizationApplications: data.organizationApplications || [], subscription: data.subscription ?? null,
        }));
    }

    function clearSession() {
        ['token', 'userName', 'userData', 'session'].forEach((key) => localStorage.removeItem(key));
    }

    function money(value) {
        return `$${Number(value).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }

    function date(value) {
        return value ? new Date(value).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
    }

    function escape(value) {
        return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
    }

    window.GymGo = {
        api, saveSession, clearSession, money, date, escape,
        isSignedIn: () => Boolean(localStorage.getItem('token')),
        userName: () => localStorage.getItem('userName') || '',
        dashboardUrl: () => window.GYMGO_DASHBOARD_URL,
        intervalLabel: (interval) => (interval === 'year' ? 'al año' : 'al mes'),
    };

    // Replaces the content of `container` with the "confirm your email" step and resolves with the session
    // (token included) once the 6-digit code we emailed is right. The API sends the code at sign-up and when an
    // unverified account signs in; this step can also ask for a new one.
    window.GymGo.verifyEmail = function verifyEmail(container, email, { inputClass = 'form-control auth-input', buttonClass = 'btn auth-submit w-100', intro } = {}) {
        const RESEND_SECONDS = 60;
        container.innerHTML = `
            <div class="verify-email">
                <span class="done-icon" aria-hidden="true"><i class="bi bi-envelope-check"></i></span>
                <h2 class="auth-title mt-3" tabindex="-1">Confirma tu correo</h2>
                <p class="auth-subtitle">${escape(intro || 'Te enviamos un código de 6 dígitos a')} <b>${escape(email)}</b>. Revisa también la carpeta de spam.</p>
                <form novalidate>
                    <div class="status-msg mb-3" role="alert" aria-live="assertive"></div>
                    <label class="auth-label" for="verifyCode">Código de verificación</label>
                    <input id="verifyCode" class="${inputClass} verify-code-input mb-3" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="000000" required>
                    <button type="submit" class="${buttonClass}">Confirmar correo</button>
                    <button type="button" class="btn btn-link w-100 mt-2" data-resend>Reenviar código</button>
                </form>
            </div>`;
        const form = container.querySelector('form');
        const input = container.querySelector('#verifyCode');
        const status = container.querySelector('.status-msg');
        const submit = form.querySelector('[type="submit"]');
        const resend = form.querySelector('[data-resend]');
        const notify = (type, message) => window.siridStatus(status, type, message);
        let timer = null;

        function cooldown(seconds) {
            clearInterval(timer);
            let left = seconds;
            resend.disabled = true;
            resend.textContent = `Reenviar código (${left} s)`;
            timer = setInterval(() => {
                left -= 1;
                if (left > 0) { resend.textContent = `Reenviar código (${left} s)`; return; }
                clearInterval(timer);
                resend.disabled = false;
                resend.textContent = 'Reenviar código';
            }, 1000);
        }

        cooldown(RESEND_SECONDS);
        container.querySelector('h2').focus();
        input.addEventListener('input', () => { input.value = input.value.replace(/\D/g, '').slice(0, 6); });

        resend.addEventListener('click', async () => {
            notify();
            try {
                await api('/auth/verify-email/resend', { method: 'POST', auth: false, body: { email } });
                notify('success', 'Te enviamos un código nuevo.');
                cooldown(RESEND_SECONDS);
            } catch (error) {
                notify('error', error.message);
                if (error.status === 429) cooldown(RESEND_SECONDS);
            }
        });

        return new Promise((resolve) => {
            form.addEventListener('submit', async (event) => {
                event.preventDefault();
                if (!/^\d{6}$/.test(input.value)) {
                    notify('error', 'Escribe los 6 dígitos del código.');
                    input.focus();
                    return;
                }
                notify();
                window.siridLoading(submit, true, 'Confirmando…');
                try {
                    const data = await api('/auth/verify-email', { method: 'POST', auth: false, body: { email, code: input.value } });
                    clearInterval(timer);
                    saveSession(data);
                    resolve(data);
                } catch (error) {
                    window.siridLoading(submit, false);
                    notify('error', error.status === 400 && !error.code ? 'Escribe los 6 dígitos del código.' : error.message);
                    input.select();
                }
            });
        });
    };
})();
