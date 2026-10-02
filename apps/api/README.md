# API — Super App Delivery (Fases 0–6 ✅)

Backend en **NestJS + Prisma**. Autenticación con roles (Fase 0), **Wallet con
ledger de doble entrada** (Fase 1), **flujo de compra con escrow** (Fase 2),
**tiempo real con WebSockets** (Fase 3), **vertical de mototaxi** (Fase 4),
**panel de administración** (Fase 5) y **pagos por Pago Móvil + endurecimiento**
(Fase 6: cash-in/out con pasarela abstraída, notificaciones, rate-limit, helmet).

## Requisitos
- Node.js 20+ (probado con v24)
- No necesitas instalar base de datos: en desarrollo usa **SQLite** (archivo local).
  En producción se cambia a PostgreSQL (ver `prisma/schema.prisma`).

## Puesta en marcha

Desde la raíz del repo:

```bash
npm install
```

Si la instalación bloqueó los scripts de Prisma (mensaje `allow-scripts`), genera
el cliente a mano una vez:

```bash
cd apps/api
npx prisma generate
```

Crea la base de datos, aplica la migración y carga los usuarios demo:

```bash
cd apps/api
npx prisma migrate dev
```

Arranca la API:

```bash
# desarrollo (recarga en caliente)
npm run start:dev --workspace apps/api

# o compilado
npm run api:build
npm run api:start
```

La API queda en `http://localhost:3000`. Demos web:
- `/` — wallet (login + fondear + ver saldo y ledger).
- `/app.html` — **flujo en vivo** (ábrelo en dos pestañas: cliente y conductor).
- `/admin.html` — **panel de administración** (entra con `admin@superapp.local`).

## Usuarios demo (seed)

| Rol       | Email                     | Contraseña     |
|-----------|---------------------------|----------------|
| ADMIN     | admin@superapp.local      | admin1234      |
| CLIENTE   | cliente@superapp.local    | cliente1234    |
| CONDUCTOR | conductor@superapp.local  | conductor1234  |

(Definidos en `prisma/seed.ts`.)

## Endpoints

| Método | Ruta                      | Auth        | Descripción                              |
|--------|---------------------------|-------------|------------------------------------------|
| GET    | `/health`                 | —           | Estado del servicio                      |
| POST   | `/auth/register`          | —           | Registro (CLIENTE o CONDUCTOR) + wallet  |
| POST   | `/auth/login`             | —           | Login, devuelve JWT                      |
| GET    | `/auth/me`                | JWT         | Usuario autenticado                      |
| GET    | `/wallet/me`              | JWT         | Saldo (disponible / congelado / total)   |
| GET    | `/wallet/me/ledger`       | JWT         | Movimientos del usuario                  |
| POST   | `/wallet/me/cash-in`      | JWT         | Fondear wallet (simula pasarela)         |
| GET    | `/wallet/:userId/ledger`  | JWT + ADMIN | Auditoría del ledger de un usuario       |

### Órdenes (Fase 2)

| Método | Ruta                             | Rol        | Descripción                                   |
|--------|----------------------------------|------------|-----------------------------------------------|
| POST   | `/orders`                        | CLIENTE    | Crear borrador + estimación                   |
| POST   | `/orders/:id/publish`            | CLIENTE    | Publicar: congela el escrow (HOLD)            |
| POST   | `/orders/:id/approve-extra`      | CLIENTE    | Aprobar recarga extra (ticket > estimado)     |
| POST   | `/orders/:id/confirm-delivery`   | CLIENTE    | Confirmar: libera el pago (RELEASE)           |
| GET    | `/orders/mine`                   | CLIENTE    | Mis órdenes                                   |
| GET    | `/orders/feed`                   | CONDUCTOR  | Órdenes publicadas disponibles                |
| GET    | `/orders/assigned`               | CONDUCTOR  | Mis órdenes activas (en curso)                |
| POST   | `/orders/:id/accept`             | CONDUCTOR  | Tomar una orden                               |
| POST   | `/orders/:id/start-shopping`     | CONDUCTOR  | Empezar la compra                             |
| POST   | `/orders/:id/start-trip`         | CONDUCTOR  | Iniciar el viaje (VIAJE)                       |
| POST   | `/orders/:id/items/:itemId`      | CONDUCTOR  | Marcar producto (comprado/agotado/reemplazo)  |
| POST   | `/orders/:id/finish-shopping`    | CONDUCTOR  | Cerrar compra; calcula diferencia             |
| POST   | `/orders/:id/deliver`            | CONDUCTOR  | Marcar entregado                              |
| POST   | `/orders/:id/cancel`             | participante | Cancelar (reembolsa si había escrow)        |
| POST   | `/orders/:id/messages`           | participante | Chat (p. ej. acordar reemplazos)            |
| GET    | `/orders/:id/messages`           | participante | Ver chat                                    |
| GET    | `/orders/:id/tracking`           | participante | Últimos puntos de ubicación                  |
| GET    | `/orders`                        | ADMIN      | Todas las órdenes                             |
| GET    | `/orders/:id`                    | participante | Detalle de una orden                        |

### Mototaxi / Viajes (Fase 4)

| Método | Ruta               | Rol     | Descripción                               |
|--------|--------------------|---------|-------------------------------------------|
| POST   | `/trips/estimate`  | CLIENTE | Previsualiza distancia (Haversine) y tarifa |
| POST   | `/trips`           | CLIENTE | Crea un viaje (borrador); luego se publica  |

Un viaje es una `Order` de `type = VIAJE`: reutiliza publish/accept/deliver/confirm,
el escrow (congela la tarifa), el tracking y el chat. La tarifa = `banderazo + por_km`.

### Pagos — Pago Móvil (Fase 6)

| Método | Ruta                                  | Descripción                                   |
|--------|---------------------------------------|-----------------------------------------------|
| POST   | `/payments/cash-in`                   | Inicia fondeo; devuelve instrucciones + referencia |
| POST   | `/payments/cash-in/:reference/confirm`| Confirma el fondeo (simula webhook) → acredita wallet |
| POST   | `/payments/cash-out`                  | Retiro a Pago Móvil (debita wallet)           |
| GET    | `/payments/mine`                      | Mis movimientos de pago                        |

**Pasarela abstraída:** la interfaz `PaymentProvider` desacopla el proveedor. Hoy
usa `PagoMovilSandboxProvider` (imita el flujo venezolano: referencia → webhook).
Para producción, implementar la misma interfaz con **PagoFlash / Mega Soft / Pago
Móvil C2P** de un banco y cambiar una línea en `payments.module.ts`. Datos de la
cuenta receptora por env: `PM_BANK`, `PM_PHONE`, `PM_CEDULA`.

**Endurecimiento:** `helmet` (cabeceras), rate-limit global (`@nestjs/throttler`,
120 req/min por IP) y aviso si `JWT_SECRET` es el de desarrollo.

### Administración (Fase 5 — solo ADMIN)

| Método | Ruta                          | Descripción                                   |
|--------|-------------------------------|-----------------------------------------------|
| GET    | `/admin/dashboard`            | Métricas: GMV, ganancias, activas, disputas   |
| GET    | `/admin/users?role=`          | Usuarios con rol, KYC, estado y saldo         |
| POST   | `/admin/users/:id/kyc`        | Aprobar/rechazar KYC                          |
| POST   | `/admin/users/:id/active`     | Suspender/reactivar usuario                   |
| GET    | `/admin/disputes`             | Órdenes en disputa                            |
| POST   | `/admin/orders/:id/resolve`   | Resolver disputa: `RELEASE` o `REFUND`        |
| GET    | `/admin/orders`               | Todas las órdenes                             |
| GET    | `/admin/config`               | Tarifas y comisión vigentes                   |
| PUT    | `/admin/config`               | Cambiar comisión / tarifas (persistido)       |

Las disputas (`POST /orders/:id/dispute`, abierta por un participante) dejan la
orden `EN_DISPUTA`; el admin libera el escrow al conductor (menos comisión) o lo
reembolsa al cliente. La configuración de tarifas/comisión se guarda en la tabla
`Setting` y la usa el motor de órdenes en caliente.

### Tiempo real (Fase 3 — WebSocket Socket.IO)

Conexión autenticada con el JWT (`io(url, { auth: { token } })`). Eventos:

| Evento (dirección)        | Descripción                                        |
|---------------------------|----------------------------------------------------|
| `order:subscribe` (→)     | Suscribirse a las novedades de una orden propia    |
| `chat` (↔)                | Enviar/recibir mensajes de la orden                |
| `tracking` (↔)            | El conductor emite su ubicación; los demás la ven  |
| `feed:refresh` (←)        | A los conductores: el feed cambió                  |
| `order:update` (←)        | A los participantes: la orden cambió de estado     |

**Economía del escrow:** al publicar se congela `items estimados + tarifa`. Al
confirmar la entrega se liquida: el conductor recibe `items reales + tarifa − comisión`,
la plataforma cobra la comisión (20% de la tarifa por defecto) y el excedente se
reembolsa al cliente. Si el ticket supera el escrow, el cliente debe aprobar la recarga.

## Pruebas

```bash
npm run test --workspace apps/api
```

18 pruebas: atomicidad del ledger; flujo de compra con todos los edge cases
(reembolso de excedente, recarga extra, producto agotado, cancelación, fondos
insuficientes); flujo de viaje (mototaxi); disputas (RELEASE/REFUND); y pagos
(cash-in idempotente, cash-out con saldo insuficiente).

## Notas de diseño

- **Saldos derivados:** el saldo nunca se almacena; se calcula sumando los deltas
  del ledger. Esto evita condiciones de carrera de "lost update".
- **Montos en céntimos** (enteros) para no tener errores de coma flotante.
- `postTransaction()` en `wallet.service.ts` es la base reutilizable del **escrow**
  (hold / release / refund) que implementa la Fase 2.
