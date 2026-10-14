(function () {
    const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname)
        || window.location.protocol === 'file:';
    window.SIRID_API_URL = isLocal
        ? 'http://localhost:3000'
        : 'https://sirid-systems.onrender.com';
})();
