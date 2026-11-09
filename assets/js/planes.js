/**
 * Tarjetas de planes de GymGo (precios reales de la API) con selector mensual / anual.
 * Uso: <div data-gymgo-plans data-base="pages/"></div>; data-base es la ruta hacia /pages desde la página actual.
 */
(function () {
    const CTA = { esencial: 'Probar 14 días gratis', pro: 'Empezar con Pro' };

    function card(plan, interval, base, trialDays) {
        const { escape, money } = window.GymGo;
        const price = plan[interval === 'year' ? 'yearly' : 'monthly'];
        const highlights = (plan.highlights || []).map((item) => `<li>${escape(item)}</li>`).join('');
        let priceHtml;
        let action;
        if (!plan.selfService || !price) {
            priceHtml = `<div class="pricing-price"><span class="price-text">A la medida</span></div>
                <p class="price-note">Cotización con hardware e instalación.</p>`;
            action = `<a href="${base}demo.html" class="btn-buy">Contactar ventas <i class="bi bi-arrow-right"></i></a>`;
        } else {
            const query = `plan=${encodeURIComponent(plan.code)}&interval=${interval}`;
            const target = window.GymGo.isSignedIn() ? `${base}pagos.html?${query}` : `${base}registro.html?${query}`;
            const label = window.GymGo.isSignedIn() ? `Elegir ${escape(plan.name)}` : (CTA[plan.code] || `Elegir ${escape(plan.name)}`);
            priceHtml = `<div class="pricing-price"><span class="price-text">${money(price.subtotal)}</span><span class="price-period">MXN + IVA ${window.GymGo.intervalLabel(interval)}</span></div>
                <p class="price-note">${money(price.total)} con IVA${interval === 'year' ? ' · pagas 10 meses, usas 12' : ''}</p>`;
            action = `<a href="${target}" class="btn-buy">${label} <i class="bi bi-arrow-right"></i></a>`;
        }
        return `
            <div class="col-lg-4 col-md-6">
                <article class="pricing-card ${plan.featured ? 'destacado' : ''}">
                    ${plan.featured ? '<span class="badge-popular"><i class="bi bi-star-fill"></i>MÁS ELEGIDO</span>' : ''}
                    <span class="plan-tag">Plan GymGo</span>
                    <h3>${escape(plan.name)}</h3>
                    <p class="pricing-description">${escape(plan.description)}</p>
                    ${priceHtml}
                    <ul class="feature-list">${highlights}</ul>
                    <div class="pricing-actions">${action}</div>
                    ${plan.code === 'esencial' && !window.GymGo.isSignedIn() ? `<p class="price-note text-center mb-0 mt-2">${trialDays} días gratis, sin tarjeta.</p>` : ''}
                </article>
            </div>`;
    }

    function errorState(message) {
        return `<div class="catalog-state"><i class="bi bi-wifi-off"></i>${window.GymGo.escape(message)}<br>
            <button type="button" class="btn-gg btn-gg-outline btn-gg-sm mt-3" data-plans-retry>Reintentar</button></div>`;
    }

    async function mount(root) {
        const base = root.dataset.base || '';
        const grid = root.querySelector('[data-plans-grid]');
        const toggle = root.querySelector('[data-plans-toggle]');
        let interval = new URLSearchParams(location.search).get('interval') === 'year' ? 'year' : 'month';
        let data;

        const render = () => {
            toggle?.querySelectorAll('button').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.interval === interval)));
            grid.setAttribute('aria-busy', 'false');
            grid.innerHTML = data.plans.map((plan) => card(plan, interval, base, data.trialDays)).join('');
        };

        const load = async () => {
            grid.setAttribute('aria-busy', 'true');
            try {
                data = await window.GymGo.api('/saas-plans', { auth: false });
                if (!data.plans?.length) {
                    grid.innerHTML = '<div class="catalog-state"><i class="bi bi-inbox"></i>Aún no hay planes publicados.</div>';
                    return;
                }
                render();
            } catch (error) {
                grid.setAttribute('aria-busy', 'false');
                grid.innerHTML = errorState('No se pudieron cargar los planes. Inténtalo de nuevo en un momento.');
            }
        };

        toggle?.addEventListener('click', (event) => {
            const button = event.target.closest('button[data-interval]');
            if (!button || !data) return;
            interval = button.dataset.interval;
            render();
        });
        grid.addEventListener('click', (event) => {
            if (event.target.closest('[data-plans-retry]')) load();
        });
        await load();
    }

    document.addEventListener('DOMContentLoaded', () => {
        document.querySelectorAll('[data-gymgo-plans]').forEach(mount);
    });
})();
