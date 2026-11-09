# SIRID Systems

Plataforma B2B SaaS para gimnasios: monitorea afluencia, automatiza el acceso y convierte datos de sensores IoT en decisiones operativas.

## Estructura

- `index.html`: landing page comercial.
- `pages/`: demo, precios, autenticacion, registro, dashboard y contacto.
- `assets/`: estilos y logica compartida del frontend.
- `data/`: configuracion estatica de sucursales.
- `backend/`: API Node.js + Express para autenticacion.

## Uso local

```bash
npm install
npm run local:user
npm start
```

Abre `http://localhost:3000/pages/login.html`. Express sirve el frontend y la API desde el mismo puerto, por lo que no necesitas Live Server.

Copia `backend/.env.example` a `backend/.env`, configura `MONGO_URI` y `JWT_SECRET`, y cambia `LOCAL_MODE=true` para las pruebas locales. En producción debe permanecer en `false`.

El usuario de prueba se crea con `npm run local:user`:

```text
Correo: demo@gymgo.local
Contraseña: GymGoLocal123!
```

Para reponer el inventario local sin borrar planes ni cambiar sus identificadores:

```bash
npm run local:stock -- 10
```

El número final indica cuántas unidades quedarán disponibles en cada plan activo.

### Dashboard administrativo

El panel de operación está disponible en `pages/admin.html`. Usa datos reales de MongoDB para mostrar ingresos, órdenes, catálogo, inventario, usuarios y reseñas. El acceso está protegido por JWT y requiere que la cuenta tenga el rol `Admin`; el usuario local creado con `npm run local:user` ya utiliza ese rol.

Desde el panel se pueden crear, editar y eliminar productos, actualizar existencias y moderar reseñas. Las operaciones administrativas se validan también en el backend, por lo que ocultar la página no es la única medida de protección.

Después de actualizar el código del backend, reinicia `npm start` para que Express cargue las rutas nuevas. Si el dashboard muestra un error HTTP 404, normalmente significa que sigue ejecutándose una instancia anterior del servidor.

Para producción, elimina `LOCAL_MODE` o configúralo como `false`, y usa valores reales para las URLs públicas y las credenciales.

### Publicación en GitHub Pages

GitHub Pages aloja el frontend estático mediante `.github/workflows/pages.yml`. En GitHub entra a `Settings > Pages`, selecciona `GitHub Actions` como fuente y publica la rama `main`; cada push posterior desplegará automáticamente la interfaz.

La API no se ejecuta en GitHub Pages. Debe permanecer desplegada en Render u otro hosting Node.js. Para producción configura en Render:

```text
FRONTEND_PUBLIC_URL=https://TU_USUARIO.github.io/TU_REPOSITORIO
FRONTEND_ORIGINS=https://TU_USUARIO.github.io
```

La aplicación detecta el dominio de GitHub Pages y usa `https://sirid-systems.onrender.com` como API. Si la API cambia de dominio, actualiza `assets/js/config.js`.

### Seguridad y compatibilidad

La API usa JWT, bcrypt, validación de datos en servidor, control de rol `Admin`, reserva segura de inventario, cabeceras HTTP de seguridad y CORS restringido a los orígenes configurados. No subas `backend/.env`, contraseñas, claves JWT ni credenciales de Stripe/PayPal al repositorio.

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

La interfaz usa Bootstrap 5 por CDN, Leaflet para el mapa de contacto y Chart.js para las graficas del dashboard.