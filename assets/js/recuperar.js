/**
 * "¿Olvidaste tu contraseña?": un código de 6 dígitos llega al correo; con él y una contraseña nueva se abre la sesión.
 * La API responde igual exista o no la cuenta, así que el mensaje nunca confirma que el correo esté registrado.
 */
document.addEventListener('DOMContentLoaded', () => {
    const RESEND_SECONDS = 60;
    const requestForm = document.getElementById('requestForm');
    const resetForm = document.getElementById('resetForm');
    const emailInput = document.getElementById('email');
    const codeInput = document.getElementById('code');
    const title = document.getElementById('resetTitle');
    const subtitle = document.getElementById('resetSubtitle');
    const resend = document.getElementById('resendCode');
    const requestNotify = (type, message) => window.siridStatus(document.getElementById('requestStatus'), type, message);
    const resetNotify = (type, message) => window.siridStatus(document.getElementById('resetStatus'), type, message);
    const initialSubtitle = subtitle.textContent;
    let sentTo = null;
    let timer = null;

    emailInput.value = new URLSearchParams(location.search).get('email') || '';

    function cooldown() {
        clearInterval(timer);
        let left = RESEND_SECONDS;
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

    function showStep(email) {
        sentTo = email;
        requestForm.hidden = Boolean(email);
        resetForm.hidden = !email;
        title.textContent = email ? 'Crea tu contraseña nueva' : '¿Olvidaste tu contraseña?';
        if (email) {
            subtitle.innerHTML = `Si <b>${GymGo.escape(email)}</b> tiene cuenta en GymGo, le enviamos un código de 6 dígitos. Revisa también la carpeta de spam.`;
            cooldown();
        } else {
            subtitle.textContent = initialSubtitle;
            clearInterval(timer);
        }
        title.focus();
    }

    requestForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const email = emailInput.value.trim().toLowerCase();
        if (!emailInput.checkValidity() || !email) {
            requestNotify('error', 'Escribe un correo válido.');
            emailInput.focus();
            return;
        }
        requestNotify();
        const submit = document.getElementById('requestSubmit');
        window.siridLoading(submit, true, 'Enviando…');
        try {
            await GymGo.api('/auth/password-reset', { method: 'POST', auth: false, body: { email } });
            showStep(email);
        } catch (error) {
            requestNotify('error', error.message);
        } finally {
            window.siridLoading(submit, false);
        }
    });

    codeInput.addEventListener('input', () => { codeInput.value = codeInput.value.replace(/\D/g, '').slice(0, 6); });

    resend.addEventListener('click', async () => {
        resetNotify();
        try {
            await GymGo.api('/auth/password-reset', { method: 'POST', auth: false, body: { email: sentTo } });
            resetNotify('success', 'Te enviamos un código nuevo.');
        } catch (error) {
            resetNotify('error', error.message);
        } finally {
            cooldown();
        }
    });

    document.getElementById('otherEmail').addEventListener('click', () => { resetNotify(); showStep(null); });

    resetForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const password = document.getElementById('password').value;
        if (!/^\d{6}$/.test(codeInput.value)) { resetNotify('error', 'Escribe los 6 dígitos del código.'); codeInput.focus(); return; }
        if (password.length < 10) { resetNotify('error', 'La contraseña nueva debe tener al menos 10 caracteres.'); return; }
        if (password !== document.getElementById('confirmation').value) { resetNotify('error', 'Las contraseñas no coinciden.'); return; }
        resetNotify();
        const submit = document.getElementById('resetSubmit');
        window.siridLoading(submit, true, 'Guardando…');
        try {
            const data = await GymGo.api('/auth/password-reset/confirm', { method: 'POST', auth: false, body: { email: sentTo, code: codeInput.value, password } });
            clearInterval(timer);
            GymGo.saveSession(data);
            const worksInGym = Boolean(data.subscription) || (data.gyms || []).some((gym) => (gym.roles || []).some((role) => role !== 'Cliente'));
            if (worksInGym || data.user?.isPlatformAdmin) {
                resetNotify('success', 'Contraseña actualizada. Abriendo tu panel…');
                location.href = GymGo.dashboardUrl();
            } else {
                resetNotify('success', 'Contraseña actualizada. Entra a la app GymGo con tu contraseña nueva.');
                window.siridLoading(submit, false);
            }
        } catch (error) {
            resetNotify('error', error.message);
            window.siridLoading(submit, false);
            codeInput.select();
        }
    });
});
