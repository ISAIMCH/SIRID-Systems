/**
 * Utilidades de interfaz compartidas por las páginas de cuenta y perfil.
 * - siridStatus: muestra un mensaje de éxito, error o información junto al formulario.
 * - siridLoading: pone un botón en estado de carga y lo restaura.
 * - Botones [data-toggle-password]: muestran u ocultan la contraseña.
 */
(function () {
    const icons = { error: 'bi-exclamation-circle-fill', success: 'bi-check-circle-fill', info: 'bi-info-circle-fill' };

    window.siridStatus = function (element, type, message) {
        if (!element) return;
        if (!message) {
            element.className = 'status-msg';
            element.textContent = '';
            return;
        }
        element.className = `status-msg show is-${type}`;
        element.innerHTML = `<i class="bi ${icons[type] || icons.info}" aria-hidden="true"></i><span></span>`;
        element.querySelector('span').textContent = message;
    };

    window.siridLoading = function (button, loading, label) {
        if (!button) return;
        if (loading) {
            button.dataset.originalHtml = button.innerHTML;
            button.disabled = true;
            button.innerHTML = `<span class="spinner-border spinner-border-sm" aria-hidden="true"></span><span>${label || 'Procesando…'}</span>`;
        } else {
            button.disabled = false;
            if (button.dataset.originalHtml) button.innerHTML = button.dataset.originalHtml;
        }
    };

    document.addEventListener('click', (event) => {
        const toggle = event.target.closest('[data-toggle-password]');
        if (!toggle) return;
        const input = document.getElementById(toggle.dataset.togglePassword);
        if (!input) return;
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        toggle.setAttribute('aria-label', show ? 'Ocultar contraseña' : 'Mostrar contraseña');
        toggle.innerHTML = `<i class="bi bi-${show ? 'eye-slash' : 'eye'}"></i>`;
    });
})();
