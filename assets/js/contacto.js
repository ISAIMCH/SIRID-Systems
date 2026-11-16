/**
 * Formularios de contacto y demo: los envía la API de GymGo desde el correo de SIRID (nos llega con el
 * visitante como "responder a" y él recibe una copia). Si la API falla, se ofrece escribir directo al correo.
 */
(function () {
    const SALES_EMAIL = 'project.gymgo@gmail.com';
    const ICONS = { success: 'check-circle-fill', error: 'exclamation-circle-fill', info: 'info-circle-fill' };

    function showStatus(box, type, html) {
        box.className = `status-msg mb-3 show is-${type}`;
        box.innerHTML = `<i class="bi bi-${ICONS[type]}" aria-hidden="true"></i><span>${html}</span>`;
    }

    function setBusy(button, busy) {
        if (busy) {
            button.dataset.label = button.innerHTML;
            button.innerHTML = '<span class="spinner-border spinner-border-sm" aria-hidden="true"></span> Enviando…';
        } else if (button.dataset.label) {
            button.innerHTML = button.dataset.label;
        }
        button.disabled = busy;
    }

    document.addEventListener('DOMContentLoaded', () => {
        document.querySelectorAll('form[data-contact-kind]').forEach((form) => {
            const status = form.querySelector('[data-contact-status]');
            const submit = form.querySelector('[type="submit"]');
            const field = (name) => form.querySelector(`[data-field="${name}"]`)?.value.trim() || undefined;

            form.addEventListener('submit', async (event) => {
                event.preventDefault();
                if (!form.checkValidity()) {
                    form.classList.add('was-validated');
                    return;
                }
                const body = {
                    kind: form.dataset.contactKind,
                    name: field('name'),
                    email: field('email')?.toLowerCase(),
                    branches: field('branches'),
                    message: field('message'),
                    website: form.querySelector('[name="website"]')?.value || undefined,
                };
                setBusy(submit, true);
                try {
                    await GymGo.api('/contact', { method: 'POST', auth: false, body });
                    form.reset();
                    form.classList.remove('was-validated');
                    showStatus(status, 'success', `¡Gracias, ${GymGo.escape(body.name)}! Recibimos tu mensaje y te enviamos una copia a <b>${GymGo.escape(body.email)}</b>. Te responderemos en menos de un día hábil.`);
                } catch (error) {
                    const subject = encodeURIComponent(form.dataset.contactKind === 'demo' ? 'Solicitud de demostración GymGo' : 'Contacto GymGo');
                    const message = error.status === 429 ? 'Ya enviaste varios mensajes. Inténtalo más tarde o' : `${GymGo.escape(error.message)} También puedes`;
                    showStatus(status, 'error', `${message} escribirnos a <a href="mailto:${SALES_EMAIL}?subject=${subject}">${SALES_EMAIL}</a>.`);
                } finally {
                    setBusy(submit, false);
                }
            });
        });
    });
})();
