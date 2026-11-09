// Índice de las páginas legales: resalta la sección visible al desplazarse.
document.addEventListener('DOMContentLoaded', () => {
    const links = [...document.querySelectorAll('.legal-toc a[href^="#"]')];
    const sections = links.map((link) => document.querySelector(link.getAttribute('href'))).filter(Boolean);
    if (!('IntersectionObserver' in window) || !sections.length) return;
    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            links.forEach((link) => {
                const active = link.getAttribute('href') === `#${entry.target.id}`;
                link.classList.toggle('active', active);
                if (active) link.setAttribute('aria-current', 'true'); else link.removeAttribute('aria-current');
            });
        });
    }, { rootMargin: '-30% 0px -60% 0px' });
    sections.forEach((section) => observer.observe(section));
});
