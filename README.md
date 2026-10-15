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

Para producción, elimina `LOCAL_MODE` o configúralo como `false`, y usa valores reales para las URLs públicas y las credenciales.

### Recibos de pago

Las órdenes registradas pueden descargarse como recibos PDF desde el modal de confirmación de `pages/pagos.html`. El backend genera el documento bajo demanda con los datos almacenados en MongoDB mediante el endpoint autenticado:

```text
GET /api/payments/:orderId/receipt
```

El recibo incluye cliente, orden, fecha, método de pago, productos, subtotal, IVA y total. Es un comprobante de operación de prueba y no sustituye una factura fiscal.

## Estado

La interfaz usa Bootstrap 5 por CDN, Leaflet para el mapa de contacto y Chart.js para las graficas del dashboard.