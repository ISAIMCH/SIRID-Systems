(function () {
    window.SIRID_GA_ID = '';
    const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname)
        || window.location.protocol === 'file:';
    // Backend de la web (reseñas, contacto y demo).
    window.SIRID_API_URL = isLocal
        ? 'http://localhost:3000'
        : 'https://sirid-systems.onrender.com';
    // API de GymGo: cuentas de dueños, planes y pagos. En local corre en el puerto 4000 para no chocar con la web.
    window.GYMGO_API_URL = isLocal
        ? 'http://localhost:4000'
        : 'https://sirid-systemsappmovil.onrender.com';
    // Panel de administración (dashboard). En el mismo dominio comparte la sesión con la web.
    window.GYMGO_DASHBOARD_URL = isLocal
        ? 'http://localhost:5173/dashboard/'
        : `${window.location.origin}/dashboard/`;
})();
