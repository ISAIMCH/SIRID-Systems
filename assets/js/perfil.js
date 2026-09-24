const API_URL = 'https://sirid-systems.onrender.com/api/auth';
const token = localStorage.getItem('token');
const loading = document.getElementById('profileLoading');
const content = document.getElementById('profileContent');
const alertBox = document.getElementById('profileAlert');
let profileUser;

function showAlert(message, type = 'success') {
    alertBox.className = `alert alert-${type}`;
    alertBox.textContent = message;
    alertBox.classList.remove('d-none');
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
    document.getElementById('verificationBadge').innerHTML = user.verificado
        ? '<i class="bi bi-shield-check me-2"></i>Cuenta verificada'
        : '<i class="bi bi-exclamation-circle me-2"></i>Verificación pendiente';
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
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(options.headers || {}) }
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
    } catch (error) {
        if (error.message !== 'Sesión expirada.') showAlert(error.message, 'danger');
        loading.classList.add('d-none');
    }
});

document.getElementById('profileForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
        const data = await request('/me', { method: 'PATCH', body: JSON.stringify({
            nombre: document.getElementById('profileFirstName').value,
            apellidos: document.getElementById('profileLastName').value,
            fechaNacimiento: document.getElementById('profileBirthDate').value
        }) });
        setProfile(data.user);
        showAlert('Tu información personal fue actualizada.');
    } catch (error) { showAlert(error.message, 'danger'); }
});

document.getElementById('passwordForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
        await request('/me', { method: 'PATCH', body: JSON.stringify({
            currentPassword: document.getElementById('currentPassword').value,
            newPassword: document.getElementById('newPassword').value
        }) });
        event.target.reset();
        showAlert('Tu contraseña fue actualizada.');
    } catch (error) { showAlert(error.message, 'danger'); }
});
