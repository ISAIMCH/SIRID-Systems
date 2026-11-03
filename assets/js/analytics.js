(function () {
    const measurementId = window.SIRID_GA_ID;
    if (!measurementId || !/^G-[A-Z0-9]+$/i.test(measurementId)) return;

    function hasAnalyticsConsent() {
        const match = document.cookie.match(/(?:^|; )cookiePreferences=([^;]+)/);
        if (!match) return false;
        try {
            return JSON.parse(decodeURIComponent(match[1])).analytics === true;
        } catch (error) {
            return false;
        }
    }

    function loadAnalytics() {
        if (!hasAnalyticsConsent() || window.gtag) return;
        const script = document.createElement('script');
        script.async = true;
        script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
        document.head.appendChild(script);
        window.dataLayer = window.dataLayer || [];
        window.gtag = function () { window.dataLayer.push(arguments); };
        window.gtag('js', new Date());
        window.gtag('config', measurementId, { anonymize_ip: true });
    }

    window.siridTrack = function (eventName, parameters = {}) {
        if (window.gtag && hasAnalyticsConsent()) window.gtag('event', eventName, parameters);
    };

    document.addEventListener('DOMContentLoaded', loadAnalytics);
    document.addEventListener('sirid:cookie-preferences-updated', loadAnalytics);
})();
