const API_URL = `${window.SIRID_API_URL}/api/auth`;
const token = localStorage.getItem('token');
const loading = document.getElementById('profileLoading');
const content = document.getElementById('profileContent');
const alertBox = document.getElementById('profileAlert');
let profileUser;

function showAlert(message, type = 'success') {
    alertBox.className = `alert alert-${type}`;
    alertBox.textContent = message;
    alertBox.classList.remove('d-none');
    alertBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function initials(user) {
    return `${user.nombre?.[0] || ''}${user.apellidos?.[0] || ''}`.toUpperCase();
}

function setProfile(user) {
    profileUser = user;
    const fullName = `${user.nombre} ${user.apellidos || ''}`.trim();
    document.getElementById('profileAvatar').textContent = initials(user);
    document.getElementById('profileName').textContent = fullName;
    document.getElementById('profileEmail').textContent = user.email;
    document.getElementById('profileFirstName').value = user.nombre || '';
    document.getElementById('profileLastName').value = user.apellidos || '';
    document.getElementById('profileEmailInput').value = user.email || '';
    document.getElementById('profileBirthDate').value = user.fechaNacimiento ? user.fechaNacimiento.slice(0, 10) : '';
    document.getElementById('profileAccess').textContent = user.password ? 'Correo' : 'Google';
    const badge = document.getElementById('verificationBadge');
    badge.innerHTML = user.verificado
        ? '<i class="bi bi-shield-check me-2"></i>Cuenta verificada'
        : '<i class="bi bi-exclamation-circle me-2"></i>Verificación pendiente';
    badge.classList.toggle('pending', !user.verificado);
    if (!user.password) {
        document.getElementById('passwordForm').classList.add('d-none');
        document.getElementById('passwordHelp').textContent = 'Tu cuenta usa Google. Administra tu acceso desde tu cuenta de Google.';
    }
    localStorage.setItem('userName', user.nombre);
    localStorage.setItem('userData', JSON.stringify(user));
}

async function request(path, options = {}) {
    const response = await fetch(`${API_URL}${path}`, {
        ...options,
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token, ...(options.headers || {}) }
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) {
        localStorage.removeItem('token');
        localStorage.removeItem('userName');
        localStorage.removeItem('userData');
        window.location.href = 'login.html';
        throw new Error('Sesión expirada.');
    }
    if (!response.ok) throw new Error(data.msg || 'No se pudo completar la operación.');
    return data;
}


async function requestFrom(path) {
    const response = await fetch(`${window.SIRID_API_URL}${path}`, { headers: { Authorization: 'Bearer ' + token } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.msg || 'No se pudo cargar el historial.');
    return data;
}

const money = (value) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(Number(value || 0));
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const METHOD_INFO = { stripe: ['bi-credit-card', 'Tarjeta (Stripe)'], paynet: ['bi-upc-scan', 'Efectivo (Paynet)'], paypal: ['bi-paypal', 'PayPal'] };
let allPayments = [];
let historyFilter = 'todos';

function renderPurchaseHistory() {
    const history = document.getElementById('purchaseHistory');
    if (!allPayments.length) {
        history.innerHTML = '<div class="history-empty"><i class="bi bi-bag"></i>Aún no tienes compras registradas.<br><a class="btn-gg btn-gg-outline btn-gg-sm mt-3" href="../index.html#catalogo">Explorar el catálogo</a></div>';
        return;
    }
    const paid = allPayments.filter((payment) => payment.status === 'pagado');
    const pending = allPayments.filter((payment) => payment.status !== 'pagado');
    const visible = historyFilter === 'pagado' ? paid : historyFilter === 'pendiente' ? pending : allPayments;
    const filterButton = (value, label, count) => `<button type="button" class="${historyFilter === value ? 'active' : ''}" data-history-filter="${value}" aria-pressed="${historyFilter === value}">${label} (${count})</button>`;
    history.innerHTML = `
        <div class="history-kpis">
            <div class="history-kpi"><span>Total pagado</span><strong>${money(paid.reduce((sum, payment) => sum + Number(payment.total || 0), 0))}</strong></div>
            <div class="history-kpi"><span>Pendiente</span><strong>${money(pending.reduce((sum, payment) => sum + Number(payment.total || 0), 0))}</strong></div>
            <div class="history-kpi"><span>Órdenes</span><strong>${allPayments.length}</strong></div>
        </div>
        <div class="history-toolbar">
            <div class="profile-tabs" aria-label="Filtrar por estado">${filterButton('todos', 'Todas', allPayments.length)}${filterButton('pagado', 'Pagadas', paid.length)}${filterButton('pendiente', 'Pendientes', pending.length)}</div>
        </div>
        <div class="history-list">${visible.length ? visible.map((payment) => {
            const [icon, methodName] = METHOD_INFO[payment.method] || ['bi-receipt', payment.method || 'Pago'];
            const isPaid = payment.status === 'pagado';
            return `<article class="history-item">
                <span class="method" aria-hidden="true"><i class="bi ${icon}"></i></span>
                <div>
                    <div class="title">${escapeHtml(payment.id)}</div>
                    <div class="meta">${new Date(payment.date).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })} · ${escapeHtml(methodName)}${payment.last4 ? ` ····${escapeHtml(payment.last4)}` : ''}</div>
                    <div class="items">${(payment.items || []).map((item) => `${escapeHtml(item.title)} ×${item.quantity}`).join(' · ')}</div>
                </div>
                <div class="amount">
                    <div><strong>${money(payment.total)}</strong><span class="status-pill ${isPaid ? 'paid' : 'pending'}">${isPaid ? 'Pagado' : 'Pendiente'}</span></div>
                    <button type="button" class="btn-gg btn-gg-outline btn-gg-sm mt-2" data-receipt-order="${escapeHtml(payment.id)}"><i class="bi bi-file-earmark-pdf"></i>Recibo</button>
                </div>
            </article>`;
        }).join('') : '<div class="history-empty"><i class="bi bi-funnel"></i>No hay órdenes con este estado.</div>'}</div>`;
}

async function loadPurchaseHistory() {
    const history = document.getElementById('purchaseHistory');
    try {
        const data = await requestFrom('/api/payments');
        allPayments = data.payments || [];
        renderPurchaseHistory();
    } catch (error) {
        history.innerHTML = `<div class="status-msg show is-error"><i class="bi bi-exclamation-circle-fill"></i><span>${escapeHtml(error.message)}</span></div>`;
    }
}

async function loadMyReviews() {
    const container = document.getElementById('reviewHistory');
    container.innerHTML = '<div class="skeleton" style="height: 100px;"></div>';
    try {
        const { reviews = [] } = await requestFrom('/api/reviews');
        container.dataset.loaded = 'true';
        container.innerHTML = reviews.length ? `<div class="history-list">${reviews.map((review) => `
            <article class="review-item">
                <div class="d-flex justify-content-between gap-2 flex-wrap">
                    <span class="stars" aria-label="${review.rating} de 5 estrellas">${'★'.repeat(review.rating)}<span class="off">${'★'.repeat(5 - review.rating)}</span></span>
                    <small class="text-muted">${review.createdAt ? new Date(review.createdAt).toLocaleDateString('es-MX', { dateStyle: 'medium' }) : ''}</small>
                </div>
                <p class="mb-0 mt-2">${escapeHtml(review.comment)}</p>
            </article>`).join('')}</div>` : '<div class="history-empty"><i class="bi bi-star"></i>Aún no has publicado reseñas. Puedes dejar una al confirmar una compra.</div>';
    } catch (error) {
        container.innerHTML = `<div class="status-msg show is-error"><i class="bi bi-exclamation-circle-fill"></i><span>${escapeHtml(error.message)}</span></div>`;
    }
}

document.addEventListener('click', async (event) => {
    const filter = event.target.closest('[data-history-filter]');
    if (filter) { historyFilter = filter.dataset.historyFilter; renderPurchaseHistory(); return; }

    const tab = event.target.closest('[data-activity-tab]');
    if (tab) {
        document.querySelectorAll('[data-activity-tab]').forEach((button) => {
            const active = button === tab;
            button.classList.toggle('active', active);
            button.setAttribute('aria-selected', String(active));
        });
        const showReviews = tab.dataset.activityTab === 'reviews';
        document.getElementById('purchaseHistory').classList.toggle('d-none', showReviews);
        document.getElementById('reviewHistory').classList.toggle('d-none', !showReviews);
        if (showReviews && !document.getElementById('reviewHistory').dataset.loaded) loadMyReviews();
        return;
    }

    // Recibo PDF de una orden (mismo endpoint que el checkout).
    const receipt = event.target.closest('[data-receipt-order]');
    if (receipt) {
        const orderId = receipt.dataset.receiptOrder;
        window.siridLoading?.(receipt, true, 'Generando…');
        try {
            const response = await fetch(`${window.SIRID_API_URL}/api/payments/${encodeURIComponent(orderId)}/receipt`, { headers: { Authorization: 'Bearer ' + token } });
            if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.msg || 'No se pudo descargar el recibo.'); }
            const blob = await response.blob(); const url = URL.createObjectURL(blob); const link = document.createElement('a');
            link.href = url; link.download = `recibo-${orderId}.pdf`; link.click(); URL.revokeObjectURL(url);
        } catch (error) { showAlert(error.message, 'danger'); }
        finally { window.siridLoading?.(receipt, false); }
    }
});

document.getElementById('profileLogout')?.addEventListener('click', () => {
    localStorage.removeItem('token');
    localStorage.removeItem('userName');
    localStorage.removeItem('userData');
    window.location.href = '../index.html';
});

document.addEventListener('DOMContentLoaded', async () => {
    if (!token) {
        window.location.href = 'login.html';
        return;
    }
    try {
        const data = await request('/me');
        setProfile(data.user);
        loading.classList.add('d-none');
        content.classList.remove('d-none');
        loadPurchaseHistory();
    } catch (error) {
        if (error.message !== 'Sesión expirada.') showAlert(error.message, 'danger');
        loading.classList.add('d-none');
    }
});

document.getElementById('profileForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const submit = event.target.querySelector('button[type="submit"]');
    window.siridLoading?.(submit, true, 'Guardando…');
    try {
        const data = await request('/me', { method: 'PATCH', body: JSON.stringify({
            nombre: document.getElementById('profileFirstName').value,
            apellidos: document.getElementById('profileLastName').value,
            fechaNacimiento: document.getElementById('profileBirthDate').value
        }) });
        setProfile(data.user);
        showAlert('Tu información personal fue actualizada.');
    } catch (error) { showAlert(error.message, 'danger'); }
    finally { window.siridLoading?.(submit, false); }
});

document.getElementById('passwordForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const submit = event.target.querySelector('button[type="submit"]');
    window.siridLoading?.(submit, true, 'Actualizando…');
    try {
        await request('/me', { method: 'PATCH', body: JSON.stringify({
            currentPassword: document.getElementById('currentPassword').value,
            newPassword: document.getElementById('newPassword').value
        }) });
        event.target.reset();
        showAlert('Tu contraseña fue actualizada.');
    } catch (error) { showAlert(error.message, 'danger'); }
    finally { window.siridLoading?.(submit, false); }
});
