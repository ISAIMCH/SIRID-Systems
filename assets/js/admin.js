(() => {
    const API = window.SIRID_API_URL || '';
    const token = localStorage.getItem('token');
    const headers = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` });
    const state = { products: [], chart: null };
    const $ = (selector) => document.querySelector(selector);

    function showAlert(message, type = 'danger') {
        const alert = $('#adminAlert');
        alert.className = `alert alert-${type}`;
        alert.textContent = message;
        window.setTimeout(() => alert.classList.add('d-none'), 4500);
    }

    async function request(path, options = {}) {
        let response;
        try {
            response = await fetch(`${API}${path}`, { ...options, headers: { ...headers(), ...(options.headers || {}) } });
        } catch (error) {
            throw new Error(`No se pudo conectar con el servidor (${API || 'origen actual'}). Verifica que el backend esté iniciado.`);
        }
        const data = await response.json().catch(() => ({}));
        if (response.status === 401 || response.status === 403) {
            throw new Error(data.msg || 'No tienes permisos para acceder al dashboard.');
        }
        if (!response.ok) throw new Error(data.msg || `La API respondió con HTTP ${response.status} en ${path}.`);
        return data;
    }

    function money(value) {
        return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(Number(value || 0));
    }

    function date(value) {
        return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' }).format(new Date(value));
    }

    function statusBadge(status) {
        return `<span class="admin-badge${status === 'pendiente' ? ' alert' : ''}">${status}</span>`;
    }

    function renderOverview(data) {
        $('#metricRevenue').textContent = money(data.metrics.revenue);
        $('#metricOrders').textContent = data.metrics.paidOrders;
        $('#metricUsers').textContent = data.metrics.users;
        $('#metricLowStock').textContent = data.metrics.lowStock;
        $('#recentOrders').innerHTML = data.recentOrders.length
            ? data.recentOrders.map((order) => `<div class="compact-order"><div><strong>${order.customer}</strong><small>${order.id}</small></div><div class="text-end"><strong>${money(order.total)}</strong><small>${statusBadge(order.status)}</small></div></div>`).join('')
            : '<p class="text-secondary small mb-0">Todavía no hay órdenes registradas.</p>';

        const labels = data.salesByDay.map((item) => item._id);
        const values = data.salesByDay.map((item) => item.total);
        if (state.chart) state.chart.destroy();
        state.chart = new Chart($('#salesChart'), {
            type: 'line',
            data: { labels, datasets: [{ label: 'Ingresos', data: values, borderColor: '#1d1d1f', backgroundColor: 'rgba(29,29,31,.08)', fill: true, tension: .35 }] },
            options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { ticks: { callback: (value) => money(value) }, grid: { color: '#ececf0' } }, x: { grid: { display: false } } } }
        });
    }

    async function loadOverview() { renderOverview(await request('/api/admin/overview')); }

    async function loadOrders() {
        const { orders } = await request('/api/admin/orders');
        $('#ordersTable').innerHTML = orders.length ? orders.map((order) => `<tr><td><strong>${order.orderId}</strong></td><td>${order.user ? `${order.user.nombre} ${order.user.apellidos || ''}` : 'No disponible'}<small class="d-block text-secondary">${order.user?.email || ''}</small></td><td>${order.method}</td><td>${statusBadge(order.status)}</td><td>${money(order.total)}</td><td>${date(order.createdAt)}</td></tr>`).join('') : '<tr><td colspan="6" class="text-secondary">No hay pedidos.</td></tr>';
    }

    function renderProducts(products) {
        state.products = products;
        $('#catalogTable').innerHTML = products.length ? products.map((product) => `<tr><td><strong>${product.nombre}</strong><small class="d-block text-secondary">${product.descripcion}</small></td><td>${money(product.precio)}</td><td>${product.stock}</td><td>${product.isActive === false ? '<span class="admin-badge alert">Inactivo</span>' : '<span class="admin-badge">Activo</span>'}</td><td class="text-end"><button class="btn btn-sm btn-outline-dark edit-product" data-id="${product._id}"><i class="bi bi-pencil"></i></button> <button class="btn btn-sm btn-outline-danger delete-product" data-id="${product._id}"><i class="bi bi-trash"></i></button></td></tr>`).join('') : '<tr><td colspan="5">No hay productos.</td></tr>';
    }

    async function loadCatalog() { renderProducts(await request('/api/planes')); }

    async function loadInventory() {
        const { products } = await request('/api/admin/inventory');
        $('#inventoryTable').innerHTML = products.map((product) => `<tr><td><strong>${product.nombre}</strong></td><td><input class="form-control form-control-sm inventory-input" data-id="${product._id}" type="number" min="0" value="${product.stock}" style="max-width:100px"></td><td>${product.stock <= 3 ? '<span class="admin-badge alert">Reponer pronto</span>' : '<span class="admin-badge">Estable</span>'}</td><td><button class="btn btn-sm admin-primary save-stock" data-id="${product._id}">Guardar</button></td></tr>`).join('');
    }

    async function loadUsers() {
        const users = await request('/api/auth/users');
        $('#usersTable').innerHTML = users.map((user) => `<tr><td><strong>${user.firstName} ${user.lastName}</strong></td><td>${user.email}</td><td><span class="admin-badge">${user.role}</span></td><td>${user.status || 'Activo'}</td></tr>`).join('');
    }

    async function loadReviews() {
        const { reviews } = await request('/api/admin/reviews');
        $('#reviewsList').innerHTML = reviews.length ? reviews.map((review) => `<div class="review-admin-item"><div><strong>${review.user ? `${review.user.nombre} ${review.user.apellidos || ''}` : 'Usuario'}</strong><span class="ms-2 text-secondary">${'★'.repeat(review.rating)}${'☆'.repeat(5 - review.rating)}</span><p>${review.comment}</p></div><button class="btn btn-sm btn-outline-danger delete-review" data-id="${review._id}" aria-label="Eliminar reseña"><i class="bi bi-trash"></i></button></div>`).join('') : '<p class="text-secondary">No hay reseñas.</p>';
    }

    async function showSection(section) {
        document.querySelectorAll('.admin-section').forEach((item) => item.classList.add('d-none'));
        $(`#${section}Section`).classList.remove('d-none');
        document.querySelectorAll('.admin-nav button').forEach((button) => button.classList.toggle('active', button.dataset.section === section));
        const titles = { overview: 'Resumen de operación', orders: 'Pedidos', catalog: 'Catálogo', inventory: 'Inventario', users: 'Usuarios', reviews: 'Reseñas' };
        $('#pageTitle').textContent = titles[section];
        try {
            if (section === 'overview') await loadOverview();
            if (section === 'orders') await loadOrders();
            if (section === 'catalog') await loadCatalog();
            if (section === 'inventory') await loadInventory();
            if (section === 'users') await loadUsers();
            if (section === 'reviews') await loadReviews();
        } catch (error) { showAlert(error.message); }
    }

    async function init() {
        if (!token) { window.location.href = 'login.html?returnTo=admin.html'; return; }
        try {
            const { user } = await request('/api/auth/me');
            if (user.role !== 'Admin') throw new Error('Esta área está reservada para administradores.');
            $('#operatorName').textContent = user.nombre || user.email;
            await showSection('overview');
        } catch (error) {
            showAlert(error.message);
            window.setTimeout(() => { window.location.href = 'login.html?returnTo=admin.html'; }, 1200);
        }
    }

    function openProduct(product = {}) {
        $('#productId').value = product._id || '';
        $('#productName').value = product.nombre || '';
        $('#productPrice').value = product.precio ?? '';
        $('#productStock').value = product.stock ?? 0;
        $('#productDescription').value = product.descripcion || '';
        bootstrap.Modal.getOrCreateInstance($('#productModal')).show();
    }

    document.addEventListener('click', async (event) => {
        const nav = event.target.closest('[data-section], [data-section-link]');
        if (nav) return showSection(nav.dataset.section || nav.dataset.sectionLink);
        if (event.target.closest('#logoutButton')) { localStorage.removeItem('token'); localStorage.removeItem('userData'); window.location.href = '../index.html'; return; }
        const edit = event.target.closest('.edit-product');
        if (edit) openProduct(state.products.find((product) => product._id === edit.dataset.id));
        const remove = event.target.closest('.delete-product');
        if (remove && window.confirm('¿Eliminar este producto del catálogo?')) {
            try { await request(`/api/plans/${remove.dataset.id}`, { method: 'DELETE' }); await loadCatalog(); showAlert('Producto eliminado.', 'success'); } catch (error) { showAlert(error.message); }
        }
        const saveStock = event.target.closest('.save-stock');
        if (saveStock) {
            const input = document.querySelector(`.inventory-input[data-id="${saveStock.dataset.id}"]`);
            try { await request(`/api/admin/inventory/${saveStock.dataset.id}`, { method: 'PATCH', body: JSON.stringify({ stock: Number(input.value) }) }); showAlert('Inventario actualizado.', 'success'); await loadInventory(); } catch (error) { showAlert(error.message); }
        }
        const deleteReview = event.target.closest('.delete-review');
        if (deleteReview && window.confirm('¿Eliminar esta reseña?')) {
            try { await request(`/api/admin/reviews/${deleteReview.dataset.id}`, { method: 'DELETE' }); await loadReviews(); showAlert('Reseña eliminada.', 'success'); } catch (error) { showAlert(error.message); }
        }
    });

    $('#newProductButton').addEventListener('click', () => openProduct());
    $('#productForm').addEventListener('submit', async (event) => {
        event.preventDefault();
        const id = $('#productId').value;
        const payload = { nombre: $('#productName').value.trim(), precio: Number($('#productPrice').value), descripcion: $('#productDescription').value.trim() };
        try {
            const product = await request(id ? `/api/plans/${id}` : '/api/plans', { method: id ? 'PATCH' : 'POST', body: JSON.stringify(payload) });
            const savedId = id || product._id;
            if (Number($('#productStock').value) !== Number(id ? state.products.find((item) => item._id === id)?.stock : 0)) {
                await request(`/api/admin/inventory/${savedId}`, { method: 'PATCH', body: JSON.stringify({ stock: Number($('#productStock').value) }) });
            }
            bootstrap.Modal.getOrCreateInstance($('#productModal')).hide();
            await loadCatalog();
            showAlert('Producto guardado correctamente.', 'success');
        } catch (error) { showAlert(error.message); }
    });

    init();
})();
