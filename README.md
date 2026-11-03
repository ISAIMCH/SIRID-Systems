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

### Recibos de pago

Las órdenes registradas pueden descargarse como recibos PDF desde el modal de confirmación de `pages/pagos.html`. El backend genera el documento bajo demanda con los datos almacenados en MongoDB mediante el endpoint autenticado:

```text
GET /api/payments/:orderId/receipt
```

El recibo incluye cliente, orden, fecha, método de pago, productos, subtotal, IVA y total. Es un comprobante de operación de prueba y no sustituye una factura fiscal.

### Catálogo, compras y privacidad

La página principal muestra el catálogo activo desde `GET /api/catalog`, con búsqueda, precio en MXN, disponibilidad y garantía. El checkout conserva el estilo visual de GymGo, pero carga los productos del catálogo y el backend recalcula precios, IVA y stock antes de registrar una orden.

El registro solicita por separado la aceptación de términos y del aviso de privacidad. Las compras pagadas aparecen en el historial del perfil y permiten publicar una reseña asociada a la orden. Los pagos siguen siendo de demostración hasta sustituir el flujo simulado por Stripe Checkout/Elements o PayPal SDK y sus webhooks en producción.

## Estado

La interfaz usa Bootstrap 5 por CDN, Leaflet para el mapa de contacto y Chart.js para las graficas del dashboard.