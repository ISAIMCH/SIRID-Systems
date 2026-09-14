const loginForm = document.querySelector('#login-form');
loginForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const message = document.querySelector('#login-message');
  const credentials = Object.fromEntries(new FormData(loginForm));
  try {
    const response = await fetch('http://localhost:3000/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(credentials) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'No se pudo iniciar sesion');
    localStorage.setItem('sirid_token', data.token);
    window.location.href = 'admin.html';
  } catch (error) { message.textContent = error.message; message.className = 'alert alert-danger'; }
});
