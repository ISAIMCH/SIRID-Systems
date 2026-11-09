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
})();
