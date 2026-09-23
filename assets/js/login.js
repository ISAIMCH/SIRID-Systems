document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');

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
});