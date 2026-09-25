document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const forgotForm = document.getElementById('forgotPasswordForm');

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault(); // Evita que la página se recargue

            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;

            try {
                // Petición al backend local (cambiar a URL de Railway al subir a producción)
                const response = await fetch('https://sirid-systems.onrender.com/api/auth/login', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ email, password })
                });

                const data = await response.json();

                if (response.ok) {
                    // Guardar el token y el nombre en el navegador
                    localStorage.setItem('token', data.token);
                    localStorage.setItem('userName', data.user.nombre); 
                    localStorage.setItem('userData', JSON.stringify(data.user));
                    
                    alert('Inicio de sesión exitoso');
                    window.location.href = '../index.html';
                } else {
                    alert('Error: ' + data.msg);
                }
            } catch (error) {
                console.error('Error de conexión:', error);
                alert('No se pudo conectar con el servidor.');
            }
        });
    }

    if (forgotForm) {
        forgotForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const submitButton = forgotForm.querySelector('button[type="submit"]');
            const status = document.getElementById('forgotPasswordStatus');
            submitButton.disabled = true;
            status.className = 'small mt-3 text-secondary';
            status.textContent = 'Enviando enlace...';
            try {
                const response = await fetch('https://sirid-systems.onrender.com/api/auth/forgot-password', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: document.getElementById('forgotEmail').value })
                });
                const data = await response.json();
                status.className = 'small mt-3 text-success';
                status.textContent = data.msg || 'Revisa tu correo.';
            } catch (error) {
                status.className = 'small mt-3 text-danger';
                status.textContent = 'No se pudo procesar la solicitud. Inténtalo más tarde.';
            } finally {
                submitButton.disabled = false;
            }
        });
    }
});

async function handleGoogleCredential(response) {
    try {
        const result = await fetch('https://sirid-systems.onrender.com/api/auth/google', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ credential: response.credential })
        });
        const data = await result.json();

        if (!result.ok) throw new Error(data.msg || 'No se pudo iniciar sesión con Google.');

        localStorage.setItem('token', data.token);
        localStorage.setItem('userName', data.user.nombre);
        localStorage.setItem('userData', JSON.stringify(data.user));
        window.location.href = '../index.html';
    } catch (error) {
        console.error('Error de autenticación con Google:', error);
        alert(error.message || 'No se pudo iniciar sesión con Google.');
    }
}