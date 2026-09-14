document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('form[data-validate]').forEach((form) => {
    form.addEventListener('submit', (event) => {
      if (!form.checkValidity()) { event.preventDefault(); event.stopPropagation(); }
      form.classList.add('was-validated');
    });
  });

  const map = document.querySelector('#map');
  if (map && window.L) {
    fetch('../data/sucursales.json').then((response) => response.json()).then((branches) => {
      const view = L.map(map).setView([19.4326, -99.1332], 11);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap' }).addTo(view);
      branches.forEach((branch) => L.marker([branch.lat, branch.lng]).addTo(view).bindPopup(`<strong>${branch.nombre}</strong><br>${branch.direccion}`));
    });
  }
});
