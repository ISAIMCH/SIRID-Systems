/**
 * Inicio de sesión con la cuenta de GymGo. Vuelve a la página que lo pidió (returnTo) o abre el panel del gimnasio.
 */
const SAFE_RETURN = /^[a-z0-9_-]+\.html(?:\?[^#]*)?$/i;

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('loginForm');
    const status = document.getElementById('loginStatus');
    const submit = document.getElementById('loginSubmit');
    const returnTo = new URLSearchParams(location.search).get('returnTo');
    const safeReturn = returnTo && SAFE_RETURN.test(returnTo) ? returnTo : null;
    const notify = (type, message) => window.siridStatus(status, type, message);

    if (safeReturn?.startsWith('pagos.html')) {
        document.getElementById('signupLink').href = `registro.html${safeReturn.slice('pagos.html'.length)}`;
    }

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (!form.checkValidity()) {
            notify('error', 'Escribe un correo válido y tu contraseña.');
            form.reportValidity();
            return;
        }
        notify();
        window.siridLoading(submit, true, 'Entrando…');
        try {
            const data = await GymGo.api('/auth/login', {
                method: 'POST',
                auth: false,
                body: { email: document.getElementById('email').value.trim().toLowerCase(), password: document.getElementById('password').value },
            });
            GymGo.saveSession(data);
            const worksInGym = Boolean(data.subscription) || (data.gyms || []).some((gym) => (gym.roles || []).some((role) => role !== 'Cliente'));
            if (safeReturn) {
                location.href = safeReturn;
            } else if (worksInGym || data.user?.isPlatformAdmin) {
                notify('success', `Hola, ${data.user?.name || ''}. Abriendo tu panel…`);
                location.href = GymGo.dashboardUrl();
            } else {
                notify('info', 'Tu cuenta es de cliente: entrena y consulta tu membresía desde la app GymGo.');
                window.siridLoading(submit, false);
            }
        } catch (error) {
            notify('error', error.status === 400 ? 'Correo o contraseña incorrectos.' : error.message);
            window.siridLoading(submit, false);
        }
    });
});
