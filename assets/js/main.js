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

document.addEventListener("DOMContentLoaded", async () => {
    const contenedorPlanes = document.getElementById('contenedor-planes');
    
    // Si estamos en la página de inicio y el contenedor existe, cargamos los precios
    if (contenedorPlanes) {
        try {
            // Petición al backend
            const respuesta = await fetch('http://localhost:3000/api/planes');
            const planes = await respuesta.json();
            
            contenedorPlanes.innerHTML = ''; // Limpiamos el spinner

            if (planes.length === 0) {
                contenedorPlanes.innerHTML = '<p class="text-center text-muted">Aún no hay planes configurados en la base de datos.</p>';
                return;
            }

            // Generamos una tarjeta HTML por cada plan
            planes.forEach(plan => {
                const destacadoClass = plan.destacado ? 'destacado' : '';
                const badgeHtml = plan.destacado ? `<span class="badge-popular">MÁS ELEGIDO</span>` : '';
                
                // Extraemos beneficios como reducción de morosidad y upselling[cite: 1]
                const listaCaracteristicas = plan.caracteristicas.map(c => `<li>${c}</li>`).join('');

                const tarjetaHtml = `
                    <div class="col-lg-4 col-md-6">
                        <div class="pricing-card ${destacadoClass}">
                            ${badgeHtml}
                            <h3 class="fw-semibold" style="color: #1d1d1f;">${plan.nombre}</h3>
                            <p class="text-muted small">${plan.descripcion}</p>
                            <div class="mt-4">
                                <span class="price-text" style="color: #1d1d1f;">$${plan.precio}</span><span class="text-muted">${plan.tipoCobro}</span>
                            </div>
                            <ul class="feature-list">
                                ${listaCaracteristicas}
                            </ul>
                            <a href="pages/demo.html" class="btn btn-buy">Agendar Demo</a>
                        </div>
                    </div>
                `;
                contenedorPlanes.innerHTML += tarjetaHtml;
            });

        } catch (error) {
            console.error("Error conectando al backend:", error);
            contenedorPlanes.innerHTML = '<p class="text-center text-danger">Error al cargar los planes desde el servidor.</p>';
        }
    }
});
    
    // ==========================================
    // 1. LÓGICA DE LA BARRA DE NAVEGACIÓN (LOGIN)
    // ==========================================
    const userName = localStorage.getItem('userName');
    const userNavContainer = document.getElementById('userNavContainer');

    if (userNavContainer) {
        if (userName) {
            // Usuario logueado: Mostrar ícono, nombre y menú desplegable
            userNavContainer.innerHTML = `
                <a href="#" class="text-dark text-decoration-none d-flex align-items-center dropdown-toggle" data-bs-toggle="dropdown" aria-expanded="false" style="cursor: pointer;">
                    <i class="bi bi-person-check-fill fs-5 me-2 text-primary"></i>
                    <span class="fw-medium small">${userName}</span>
                </a>
                
                <ul class="dropdown-menu dropdown-menu-end border-0 shadow-sm mt-3 rounded-4 p-2">
                    <li><h6 class="dropdown-header text-secondary">Mi Cuenta</h6></li>
                    <li><a class="dropdown-item py-2 rounded" href="#"><i class="bi bi-person me-2 text-muted"></i>Mi perfil</a></li>
                    <li><a class="dropdown-item py-2 rounded" href="#"><i class="bi bi-box-seam me-2 text-muted"></i>Historial de pedidos</a></li>
                    <li><a class="dropdown-item py-2 rounded" href="#"><i class="bi bi-geo-alt me-2 text-muted"></i>Agenda de direcciones</a></li>
                    <li><a class="dropdown-item py-2 rounded" href="#"><i class="bi bi-credit-card me-2 text-muted"></i>Métodos de pago</a></li>
                    <li><hr class="dropdown-divider my-2"></li>
                    <li>
                        <a class="dropdown-item py-2 rounded text-danger fw-medium" href="#" id="logoutBtn">
                            <i class="bi bi-door-open me-2"></i>Cerrar sesión
                        </a>
                    </li>
                </ul>
            `;

            // Darle vida al botón de cerrar sesión dentro del menú
            document.getElementById('logoutBtn').addEventListener('click', (e) => {
                e.preventDefault();
                localStorage.removeItem('token');
                localStorage.removeItem('userName');
                window.location.reload(); 
            });
        } else {
            // Usuario NO logueado: Devolver el ícono normal con el enlace al login
            userNavContainer.innerHTML = `
                <a href="pages/login.html" class="text-dark text-decoration-none">
                    <i class="bi bi-person fs-5"></i>
                </a>
            `;
        }
    }