document.addEventListener('DOMContentLoaded', () => {
    const animatedElements = document.querySelectorAll('.fade-in-up');
    if ('IntersectionObserver' in window) {
        const observer = new IntersectionObserver((entries, currentObserver) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) return;
                entry.target.classList.add('is-visible');
                currentObserver.unobserve(entry.target);
            });
        }, { threshold: 0.16 });
        animatedElements.forEach((element) => observer.observe(element));
    } else {
        animatedElements.forEach((element) => element.classList.add('is-visible'));
    }

  document.querySelectorAll('form[data-validate]').forEach((form) => {
    form.addEventListener('submit', (event) => {
      if (!form.checkValidity()) { event.preventDefault(); event.stopPropagation(); }
      form.classList.add('was-validated');
    });
  });

  const products = {
    esencial: { id: 'esencial', title: 'Básico', price: 99, rec: true },
    pro: { id: 'pro', title: 'Pro con Hardware IoT', price: 199, rec: true },
    hw: { id: 'hw', title: 'Enterprise', price: 250, rec: false }
  };
  const user = JSON.parse(localStorage.getItem('userData') || 'null');
  const cartKey = `gg_pay_${user?.id || user?.email || 'guest'}`;

  document.querySelectorAll('.add-to-cart').forEach((button) => {
    button.addEventListener('click', () => {
      const product = products[button.dataset.productId];
      if (!product) return;

      const state = JSON.parse(localStorage.getItem(cartKey) || 'null') || { cart: [], orders: [] };
      if (product.rec) {
        state.cart = state.cart.filter((item) => !products[item.pid]?.rec || item.pid === product.id);
      }

      const item = state.cart.find((cartItem) => cartItem.id === product.id);
      if (item) {
        if (!product.rec) item.qty += 1;
      } else {
        state.cart.push({ ...product, pid: product.id, qty: 1 });
      }

      localStorage.setItem(cartKey, JSON.stringify(state));
      button.textContent = 'Añadido al carrito';
      setTimeout(() => { button.textContent = 'Añadir al carrito'; }, 1800);
    });
  });

});

document.addEventListener("DOMContentLoaded", async () => {
    const catalogContainer = document.getElementById('catalogProducts');
    const catalogSearch = document.getElementById('catalogSearch');
    if (!catalogContainer) return;
    let catalogProducts = [];
    const money = (value) => `$${Number(value).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;
    const getExperienceContent = (product) => {
        const productName = product.name.toLocaleLowerCase();
        const isHardware = productName.includes('hardware') || productName.includes('iot');
        const isEnterprise = productName.includes('enterprise') || productName.includes('pro');
        const audience = isHardware
            ? 'Gimnasios que quieren conectar su espacio físico con la operación digital.'
            : isEnterprise
                ? 'Equipos que necesitan visibilidad, control y una operación lista para crecer.'
                : 'Gimnasios que buscan ordenar su operación sin añadir complejidad.';
        const outcome = isHardware
            ? 'Convierte cada acceso y cada dispositivo en información útil para tu equipo.'
            : isEnterprise
                ? 'Toma decisiones con una operación más conectada y una experiencia consistente.'
                : 'Empieza con una base clara para administrar mejor a tus clientes y tu equipo.';
        const implementation = isHardware ? 'Integración guiada' : isEnterprise ? 'Despliegue acompañado' : 'Activación sencilla';
        const scale = isEnterprise ? 'Operación avanzada' : isHardware ? 'Espacio conectado' : 'Base funcional';

        return { audience, outcome, implementation, scale };
    };
    const renderCatalog = () => {
        const query = (catalogSearch?.value || '').trim().toLocaleLowerCase();
        const filtered = catalogProducts.filter((product) =>
            `${product.name} ${product.description} ${(product.features || []).join(' ')}`
                .toLocaleLowerCase().includes(query)
        );
        catalogContainer.setAttribute('aria-busy', 'false');
        catalogContainer.innerHTML = filtered.length ? filtered.map((product) => {
            const experience = getExperienceContent(product);
            const available = product.stock > 0;
            return `
            <div class="col-lg-4 col-md-6 fade-in-up">
                <article class="pricing-card ${product.featured ? 'destacado' : ''}">
                    ${product.featured ? '<span class="badge-popular"><i class="bi bi-star-fill"></i>MÁS ELEGIDO</span>' : ''}
                    <span class="plan-tag">Solución GymGo</span>
                    <h3>${product.name}</h3>
                    <p class="pricing-description">${product.description}</p>
                    <div class="pricing-price">
                        <span class="price-text">${money(product.price)}</span>
                        <span class="price-period">MXN ${product.billing || ''}</span>
                    </div>
                    <ul class="feature-list">${(product.features || []).slice(0, 5).map((feature) => `<li>${feature}</li>`).join('')}</ul>
                    <p class="catalog-meta"><span><span class="dot ${available ? '' : 'out'}"></span><strong>${available ? 'Disponible' : 'Agotado'}</strong></span>${product.guarantee ? `<span><i class="bi bi-shield-check"></i>${product.guarantee}</span>` : ''}</p>
                    <div class="pricing-actions">
                        <button type="button" class="btn-buy catalog-add-to-cart" data-product-id="${product.id}" ${available ? '' : 'disabled'}><i class="bi bi-bag-plus"></i><span>Añadir al carrito</span></button>
                        <button type="button" class="catalog-detail-button catalog-open-details" aria-expanded="false">Ver detalles</button>
                    </div>
                    <div class="catalog-details-panel" aria-hidden="true">
                        <button type="button" class="catalog-details-close" aria-label="Cerrar detalles"><i class="bi bi-x-lg"></i></button>
                        <span class="detail-label">Vista de decisión</span>
                        <h4 class="mt-2 mb-2">¿Es la solución correcta para tu gimnasio?</h4>
                        <p class="details-intro">${experience.outcome}</p>
                        <div class="details-metrics">
                            <div class="details-metric">
                                <span class="details-metric-value">${experience.implementation}</span>
                                <span class="details-metric-label">puesta en marcha</span>
                            </div>
                            <div class="details-metric">
                                <span class="details-metric-value">${experience.scale}</span>
                                <span class="details-metric-label">enfoque</span>
                            </div>
                        </div>
                        <span class="detail-label">Ideal para</span>
                        <p class="details-audience">${experience.audience}</p>
                        <div class="details-next-step">
                            <i class="bi bi-arrow-up-right-circle"></i>
                            <div>
                                <strong>Tu siguiente paso</strong>
                                <span>Elige esta solución y revisa el resumen antes de confirmar.</span>
                            </div>
                        </div>
                        <button type="button" class="btn-buy catalog-add-to-cart" data-product-id="${product.id}" ${available ? '' : 'disabled'}><span>Elegir esta solución</span></button>
                    </div>
                </article>
            </div>`;
        }).join('') : `<div class="catalog-state"><i class="bi bi-search"></i>No encontramos soluciones con esa búsqueda.<br><button type="button" class="btn-gg btn-gg-outline btn-gg-sm mt-3" data-clear-catalog>Limpiar búsqueda</button></div>`;
        catalogContainer.querySelectorAll('.fade-in-up').forEach((element) => element.classList.add('is-visible'));
    };
    try {
        const response = await fetch(`${window.SIRID_API_URL}/api/catalog`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.msg || 'No se pudo cargar el catálogo.');
        catalogProducts = data.products || [];
        renderCatalog();
    } catch (error) {
        console.error('Error conectando al catálogo:', error);
        catalogContainer.setAttribute('aria-busy', 'false');
        catalogContainer.innerHTML = `<div class="catalog-state"><i class="bi bi-wifi-off"></i>No se pudo cargar el catálogo. Inténtalo más tarde.<br><button type="button" class="btn-gg btn-gg-outline btn-gg-sm mt-3" onclick="location.reload()">Reintentar</button></div>`;
    }
    catalogSearch?.addEventListener('input', renderCatalog);
    catalogContainer.addEventListener('click', (event) => {
        if (event.target.closest('[data-clear-catalog]')) {
            catalogSearch.value = '';
            renderCatalog();
            catalogSearch.focus();
            return;
        }
        const detailButton = event.target.closest('.catalog-open-details');
        if (detailButton) {
            const card = detailButton.closest('.pricing-card');
            card?.classList.add('details-open');
            detailButton.setAttribute('aria-expanded', 'true');
            card?.querySelector('.catalog-details-panel')?.setAttribute('aria-hidden', 'false');
            card?.querySelector('.catalog-details-close')?.focus();
            return;
        }
        const closeButton = event.target.closest('.catalog-details-close');
        if (closeButton) {
            const card = closeButton.closest('.pricing-card');
            card?.classList.remove('details-open');
            card?.querySelector('.catalog-details-panel')?.setAttribute('aria-hidden', 'true');
            const opener = card?.querySelector('.catalog-open-details');
            opener?.setAttribute('aria-expanded', 'false');
            opener?.focus();
            return;
        }
        const button = event.target.closest('.catalog-add-to-cart');
        const product = catalogProducts.find((item) => item.id === button?.dataset.productId);
        if (!product) return;
        const user = JSON.parse(localStorage.getItem('userData') || 'null');
        const cartKey = `gg_pay_${user?.id || user?.email || 'guest'}`;
        const state = JSON.parse(localStorage.getItem(cartKey) || 'null') || { cart: [], orders: [] };
        state.cart = state.cart.filter((item) => item.pid !== product.id || product.billing?.toLowerCase().includes('pago'));
        const existing = state.cart.find((item) => item.pid === product.id);
        if (existing) existing.qty += 1;
        else state.cart.push({ id: product.id, pid: product.id, title: product.name, price: product.price, qty: 1, rec: !product.billing?.toLowerCase().includes('pago') });
        localStorage.setItem(cartKey, JSON.stringify(state));
        const label = button.querySelector('span') || button;
        const originalLabel = label.textContent;
        label.textContent = 'Añadido al carrito';
        button.classList.add('is-added');
        setTimeout(() => { label.textContent = originalLabel; button.classList.remove('is-added'); }, 1800);
        window.siridUpdateCartCount?.();
        const toastText = document.getElementById('cartToastText');
        if (toastText && window.bootstrap) {
            toastText.textContent = `${product.name} se añadió al carrito`;
            bootstrap.Toast.getOrCreateInstance('#cartToast').show();
        }
    });
});

// ==========================================
// Contador del carrito en el menú
// ==========================================
window.siridUpdateCartCount = function () {
    const badge = document.getElementById('navCartCount');
    if (!badge) return;
    try {
        const user = JSON.parse(localStorage.getItem('userData') || 'null');
        const keys = [`gg_pay_${user?.id || user?.email || 'guest'}`];
        if (keys[0] !== 'gg_pay_guest') keys.push('gg_pay_guest');
        const count = keys.reduce((total, key) => {
            const state = JSON.parse(localStorage.getItem(key) || 'null');
            return total + (state?.cart || []).reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
        }, 0);
        badge.textContent = count > 0 ? String(count) : '';
        badge.dataset.count = String(count);
        badge.closest('a')?.setAttribute('aria-label', count > 0 ? `Carrito de compras, ${count} artículo(s)` : 'Carrito de compras');
    } catch (error) {
        badge.textContent = '';
    }
};

document.addEventListener('DOMContentLoaded', () => {
    window.siridUpdateCartCount();
    window.addEventListener('storage', window.siridUpdateCartCount);

    // Menú: fondo más sólido al hacer scroll y enlace activo según la sección visible.
    const nav = document.getElementById('siteNav');
    if (nav) {
        const onScroll = () => nav.classList.toggle('is-scrolled', window.scrollY > 24);
        onScroll();
        window.addEventListener('scroll', onScroll, { passive: true });

        const links = [...nav.querySelectorAll('.site-nav-links a[href^="#"]')];
        const sections = links.map((link) => document.querySelector(link.getAttribute('href'))).filter(Boolean);
        if ('IntersectionObserver' in window && sections.length) {
            const spy = new IntersectionObserver((entries) => {
                entries.forEach((entry) => {
                    if (!entry.isIntersecting) return;
                    links.forEach((link) => {
                        const active = link.getAttribute('href') === `#${entry.target.id}`;
                        link.classList.toggle('active', active);
                        if (active) link.setAttribute('aria-current', 'true'); else link.removeAttribute('aria-current');
                    });
                });
            }, { rootMargin: '-45% 0px -50% 0px' });
            sections.forEach((section) => spy.observe(section));
        }
    }

    // Menú móvil: al elegir una sección, cierra el panel y luego desplaza hasta ella.
    const actionsPanel = document.getElementById('actionsPanel');
    if (actionsPanel && window.bootstrap) {
        actionsPanel.querySelectorAll('.panel-nav a[href^="#"]').forEach((link) => {
            link.addEventListener('click', (event) => {
                event.preventDefault();
                const target = document.querySelector(link.getAttribute('href'));
                actionsPanel.addEventListener('hidden.bs.offcanvas', () => {
                    target?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
                    history.replaceState(null, '', link.getAttribute('href'));
                }, { once: true });
                bootstrap.Offcanvas.getOrCreateInstance(actionsPanel).hide();
            });
        });
    }

    // Slider principal: pausa accesible, contador y respeto a "reducir movimiento".
    const hero = document.getElementById('heroCarousel');
    if (hero && window.bootstrap) {
        const carousel = bootstrap.Carousel.getOrCreateInstance(hero);
        const pauseButton = document.getElementById('heroPause');
        const counter = document.getElementById('heroCurrent');
        hero.style.setProperty('--hero-interval', `${Number(hero.dataset.bsInterval || 10000) / 1000}s`);
        const setPaused = (paused) => {
            hero.classList.toggle('is-paused', paused);
            if (paused) carousel.pause(); else carousel.cycle();
            if (pauseButton) {
                pauseButton.setAttribute('aria-pressed', String(paused));
                pauseButton.setAttribute('aria-label', paused ? 'Reanudar presentación' : 'Pausar presentación');
                pauseButton.innerHTML = `<i class="bi bi-${paused ? 'play-fill' : 'pause-fill'}"></i>`;
            }
        };
        pauseButton?.addEventListener('click', () => setPaused(!hero.classList.contains('is-paused')));
        hero.addEventListener('slid.bs.carousel', (event) => {
            if (counter) counter.textContent = String(event.to + 1).padStart(2, '0');
            if (hero.classList.contains('is-paused')) carousel.pause();
        });
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) setPaused(true);
    }
    const stories = document.getElementById('storiesCarousel');
    if (stories && window.bootstrap && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        bootstrap.Carousel.getOrCreateInstance(stories).pause();
    }
});

function setCookie(nombre, valor, dias) {
    const fecha = new Date();
    fecha.setTime(fecha.getTime() + dias * 24 * 60 * 60 * 1000);
    const secure = window.location.protocol === 'https:' ? ';Secure' : '';
    document.cookie = `${nombre}=${valor};expires=${fecha.toUTCString()};path=/;SameSite=Lax${secure}`;
}

function getCookie(nombre) {
    const match = document.cookie.match(new RegExp(`(^| )${nombre}=([^;]+)`));
    return match ? match[2] : null;
}

const defaultCookiePreferences = {
    analytics: false,
    advertising: false,
    performance: false,
    functional: false
};

function getCookiePreferences() {
    const savedPreferences = getCookie('cookiePreferences');
    if (savedPreferences) {
        try {
            const preferences = JSON.parse(decodeURIComponent(savedPreferences));
            return { ...defaultCookiePreferences, ...preferences };
        } catch (error) {
            console.warn('No se pudieron leer las preferencias de cookies guardadas.', error);
        }
    }

    if (getCookie('cookiesAceptadas') === 'true') {
        return {
            analytics: true,
            advertising: true,
            performance: true,
            functional: true
        };
    }

    return { ...defaultCookiePreferences };
}

function saveCookiePreferences(preferences) {
    setCookie('cookiePreferences', encodeURIComponent(JSON.stringify(preferences)), 365);
    setCookie('cookiesAceptadas', 'true', 365);
    document.dispatchEvent(new CustomEvent('sirid:cookie-preferences-updated'));
}

document.addEventListener('DOMContentLoaded', () => {
    const banner = document.getElementById('cookieBanner');
    const settingsModalElement = document.getElementById('cookieSettingsModal');

    if (!banner || !settingsModalElement) return;

    if (!getCookie('cookiesAceptadas')) {
        banner.style.display = 'block';
    }

    const updateCookieControls = () => {
        const preferences = getCookiePreferences();
        document.getElementById('cookieAnalytics').checked = preferences.analytics;
        document.getElementById('cookieAdvertising').checked = preferences.advertising;
        document.getElementById('cookiePerformance').checked = preferences.performance;
        document.getElementById('cookieFunctional').checked = preferences.functional;
    };

    const openCookieSettings = () => {
        updateCookieControls();
        bootstrap.Modal.getOrCreateInstance(settingsModalElement).show();
    };

    document.getElementById('btnAceptarCookies').addEventListener('click', () => {
        saveCookiePreferences({
            analytics: true,
            advertising: true,
            performance: true,
            functional: true
        });
        window.siridTrack?.('cookie_consent', { analytics: true });
        banner.style.display = 'none';
    });

    document.getElementById('btnConfigCookies').addEventListener('click', openCookieSettings);
    document.querySelectorAll('[data-cookie-settings]').forEach((button) => {
        button.addEventListener('click', openCookieSettings);
    });

    document.getElementById('btnGuardarCookies').addEventListener('click', () => {
        saveCookiePreferences({
            analytics: document.getElementById('cookieAnalytics').checked,
            advertising: document.getElementById('cookieAdvertising').checked,
            performance: document.getElementById('cookiePerformance').checked,
            functional: document.getElementById('cookieFunctional').checked
        });
        window.siridTrack?.('cookie_preferences_saved', {
            analytics: document.getElementById('cookieAnalytics').checked
        });
        banner.style.display = 'none';
        bootstrap.Modal.getOrCreateInstance(settingsModalElement).hide();
    });
});

function enviarWhatsApp() {
    const nombre = document.getElementById('user_name')?.value.trim();
    const correo = document.getElementById('user_email')?.value.trim();
    const mensaje = document.getElementById('message')?.value.trim();
    if (!nombre || !mensaje) {
        alert('Por favor, ingresa tu nombre y mensaje antes de enviar por WhatsApp.');
        return;
    }
    const texto = `Hola equipo GymGo, soy ${nombre} (${correo}). ${mensaje}`;
    window.open(`https://wa.me/527721050282?text=${encodeURIComponent(texto)}`, '_blank', 'noopener');
}


    // ==========================================
    // 1. LÓGICA DE LA BARRA DE NAVEGACIÓN (LOGIN)
    // ==========================================
    const userName = localStorage.getItem('userName');
    const userNavContainer = document.getElementById('userNavContainer');

    if (userNavContainer) {
        const navLoginLink = document.getElementById('navLoginLink');
        if (userName && navLoginLink) {
            navLoginLink.href = 'pages/perfil.html';
            navLoginLink.innerHTML = '<i class="bi bi-person-circle"></i><span></span>';
            navLoginLink.querySelector('span').textContent = userName;
        }
        if (userName) {
            // Usuario logueado: mostrar sus acciones dentro del panel lateral.
            userNavContainer.innerHTML = `
                <div class="small text-white-50 mb-2 px-2"><i class="bi bi-person-circle me-2"></i>${userName}</div>
                <a class="action-link" href="pages/perfil.html"><i class="bi bi-person fs-5"></i><span>Mi perfil</span></a>
                <a class="action-link mt-2" href="#" id="logoutBtn"><i class="bi bi-door-open fs-5"></i><span>Cerrar sesión</span></a>
            `;

            // Darle vida al botón de cerrar sesión dentro del menú
            document.getElementById('logoutBtn').addEventListener('click', (e) => {
                e.preventDefault();
                localStorage.removeItem('token');
                localStorage.removeItem('userName');
                localStorage.removeItem('userData');
                window.location.reload(); 
            });
        } else {
            // Usuario NO logueado: Devolver el ícono normal con el enlace al login
            userNavContainer.innerHTML = `
                <a href="pages/login.html" class="action-link">
                    <i class="bi bi-person fs-5"></i>
                    <span>Iniciar sesión</span>
                </a>
            `;
        }
    }
