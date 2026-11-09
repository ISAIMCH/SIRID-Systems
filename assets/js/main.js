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

});

document.addEventListener('DOMContentLoaded', () => {

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
        const dashboardUrl = window.GYMGO_DASHBOARD_URL || 'pages/login.html';
        if (userName && navLoginLink) {
            navLoginLink.href = dashboardUrl;
            navLoginLink.innerHTML = '<i class="bi bi-speedometer2"></i><span>Mi panel</span>';
        }
        if (userName) {
            // Con sesión de GymGo: su panel, su plan y cerrar sesión.
            userNavContainer.innerHTML = `
                <div class="small text-white-50 mb-2 px-2"><i class="bi bi-person-circle me-2"></i><span data-user-name></span></div>
                <a class="action-link" href="${dashboardUrl}"><i class="bi bi-speedometer2 fs-5"></i><span>Mi panel</span></a>
                <a class="action-link mt-2" href="pages/pagos.html"><i class="bi bi-credit-card fs-5"></i><span>Mi plan y pagos</span></a>
                <a class="action-link mt-2" href="#" id="logoutBtn"><i class="bi bi-door-open fs-5"></i><span>Cerrar sesión</span></a>
            `;
            userNavContainer.querySelector('[data-user-name]').textContent = userName;

            document.getElementById('logoutBtn').addEventListener('click', (e) => {
                e.preventDefault();
                ['token', 'userName', 'userData', 'session'].forEach((key) => localStorage.removeItem(key));
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
