const resetToken = new URLSearchParams(window.location.search).get('token');
const resetForm = document.getElementById('resetPasswordForm');
const resetStatus = document.getElementById('resetStatus');
const resetSubmit = document.getElementById('resetSubmit');

if (!resetToken) {
    resetSubmit.disabled = true;
    resetStatus.className = 'small mb-3 text-danger';
    resetStatus.textContent = 'Este enlace no contiene un token válido.';
}

resetForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const password = document.getElementById('newPassword').value;
    const confirmation = document.getElementById('confirmPassword').value;
    if (password !== confirmation) {
        resetStatus.className = 'small mb-3 text-danger';
        resetStatus.textContent = 'Las contraseñas no coinciden.';
        return;
    }

    resetSubmit.disabled = true;
    resetStatus.className = 'small mb-3 text-secondary';
    resetStatus.textContent = 'Actualizando contraseña...';
    try {
        const response = await fetch('https://sirid-systems.onrender.com/api/auth/reset-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: resetToken, password })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.msg || 'No se pudo actualizar la contraseña.');
        resetStatus.className = 'small mb-3 text-success';
        resetStatus.textContent = data.msg;
        resetForm.reset();
        setTimeout(() => { window.location.href = 'login.html'; }, 1600);
    } catch (error) {
        resetSubmit.disabled = false;
        resetStatus.className = 'small mb-3 text-danger';
        resetStatus.textContent = error.message;
    }
});
