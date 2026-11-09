# SIRID Systems

Plataforma B2B SaaS para gimnasios: monitorea afluencia, automatiza el acceso y convierte datos de sensores IoT en decisiones operativas.

## Estructura

- `index.html`: landing page comercial.
- `pages/`: demo, precios, login, registro, pagos y contacto.
- `assets/`: estilos y logica compartida del frontend.
- `data/`: configuracion estatica de sucursales.
- `backend/`: servidor Express para desarrollo local (archivos estáticos).

## Uso local

```bash
npm install
npm start
```

Abre `http://localhost:3000`. `backend/server.js` solo sirve los archivos estáticos en local; la web es de marketing y no tiene base de datos ni cuentas propias. Login, registro, planes y pagos usan la API de GymGo (ver "Planes y pagos de GymGo").

### Publicación en GitHub Pages

GitHub Pages aloja el frontend estático mediante `.github/workflows/pages.yml`. En GitHub entra a `Settings > Pages`, selecciona `GitHub Actions` como fuente y publica la rama `main`; cada push posterior desplegará automáticamente la interfaz.

La web no necesita servidor propio en producción. La API de GymGo debe tener el dominio de la web en `CORS_ORIGINS`; si cambia de dominio, actualiza `assets/js/config.js`.

### Seguridad y compatibilidad

La web no guarda cuentas ni pagos: la autenticación, los roles y los cobros los valida la API de GymGo. No subas archivos `.env` ni credenciales de Stripe/PayPal al repositorio.

Antes de entregar, comprueba el flujo principal en Chrome, Edge, Firefox y Safari: navegación, precios, registro de gimnasio, login, pago con tarjeta, OXXO y PayPal, pago exitoso y dashboard. Repite la prueba en móvil y escritorio; GitHub Pages sirve el frontend, pero la compatibilidad también depende de la API desplegada.

### Google Analytics

1. Crea una propiedad web en Google Analytics y copia el identificador `G-XXXXXXXXXX`.
2. Colócalo en `assets/js/config.js`, por ejemplo: `window.SIRID_GA_ID = 'G-XXXXXXXXXX';`.
3. El script `assets/js/analytics.js` solo carga Google Analytics después de aceptar la categoría de cookies analíticas.
4. Publica de nuevo en GitHub Pages y verifica visitas en el informe `Tiempo real`.

### Planes y pagos de GymGo

Los dueños de gimnasio compran su plan directamente contra la API de GymGo (repo `SIRID-SystemsAppMovil`, carpeta `api/`); el backend de esta web ya no registra usuarios ni pagos.

1. `pages/precios.html` (y la sección de planes del inicio) carga `GET /api/saas-plans`: Esencial, Pro y Cadena, mensual o anual, con IVA desglosado.
2. `pages/registro.html` crea la organización con `POST /api/organizations/signup`. El gimnasio queda activo con 14 días de prueba de Esencial y la sesión se guarda con las mismas claves que el dashboard.
3. `pages/pagos.html` cobra con Stripe Checkout (tarjeta con renovación automática u OXXO por un periodo) o con los botones de PayPal; la API captura y verifica la orden de PayPal.
4. `pages/pago-exitoso.html` consulta `GET /api/subscription` hasta que el webhook de Stripe o la captura de PayPal activan el plan; el regreso del navegador nunca activa nada.

`assets/js/config.js` define `GYMGO_API_URL` (local: `http://localhost:4000`) y `GYMGO_DASHBOARD_URL`. En producción, el origen de la web debe estar en `CORS_ORIGINS` de la API de GymGo: además de CORS, la API solo acepta URLs de regreso de Stripe de esos orígenes.

Para probar en local, arranca la API de GymGo con `PORT=4000` y las llaves de prueba de Stripe (`sk_test_…`) y PayPal Sandbox en su `.env`; el webhook se reenvía con `stripe listen --forward-to localhost:4000/api/subscription/webhook`. Tarjeta de prueba: `4242 4242 4242 4242`.

## Estado

La interfaz usa Bootstrap 5 por CDN, Leaflet para el mapa de contacto y la API de GymGo para cuentas y pagos.