# Plan Técnico — Super App de Delivery P2P + Mototaxis

> Documento de arquitectura y plan de desarrollo por fases.
> Basado en `PRD_App_Delivery_Mototaxi.docx`. Plataforma: **Web App**. Roles: **Cliente, Conductor/Shopper, Admin**.
> Fecha: 2026-10-01

---

## 1. Visión del producto

Marketplace de tres lados que conecta **clientes** con **conductores/shoppers** (mototaxistas independientes) para dos servicios sobre una misma red:

1. **Delivery de compras** — el shopper entra a la tienda, compra con su propio capital y entrega. *100% independiente de los supermercados.*
2. **Traslado de personas (mototaxi)** — el mismo conductor, app y moneda interna.

El diferenciador operativo y de riesgo es el **sistema de Wallet con Escrow**: el dinero del cliente se congela en la plataforma y se libera al conductor al completar el servicio.

---

## 2. Decisiones de arquitectura

### 2.1 Stack recomendado

| Capa | Tecnología | Por qué |
|---|---|---|
| Frontend | **React + TypeScript + Vite**, TailwindCSS | Rápido, tipado, un solo lenguaje en todo el stack |
| Mapas / GPS | **Leaflet** (+ OpenStreetMap) o Mapbox | Tracking en tiempo real y rutas |
| Backend | **Node.js + NestJS (TypeScript)** | Estructura modular clara para un dominio con muchas reglas |
| Base de datos | **PostgreSQL** | Transacciones ACID — **imprescindible** para wallet/escrow |
| ORM | **Prisma** | Migraciones y tipado de la DB |
| Tiempo real | **WebSockets (Socket.IO)** | Feed de órdenes, tracking, chat |
| Auth | **JWT + refresh tokens**, control por rol (RBAC) | Separa cliente / conductor / admin |
| Pagos (cash-in/out) | Pasarela externa (stub en MVP) | Fondear y retirar de la Wallet |

> **Nota:** aunque el objetivo final puede ser móvil, la web app permite validar el modelo completo (incluido el escrow) antes de invertir en apps nativas. React Native después reutiliza gran parte de la lógica.

### 2.2 Estructura del repositorio (monorepo)

```
/apps
  /web-cliente      → PWA del cliente
  /web-conductor    → PWA del conductor/shopper
  /web-admin        → panel de administración
  /api              → backend NestJS
/packages
  /shared           → tipos, validaciones, utilidades compartidas
  /ui               → componentes de interfaz reutilizables
```

Las tres apps web pueden ser una sola PWA con rutas por rol en el MVP, y separarse después si crece.

---

## 3. El sistema de Wallet y Escrow (núcleo crítico)

Esta es la parte más delicada. Se modela como un **libro mayor de doble entrada (double-entry ledger)**: nunca se "edita un saldo"; se registran **movimientos** y el saldo es la suma. Esto da auditoría total y evita descuadres.

### 3.1 Estados del dinero en una orden

```
Cliente fondea Wallet ──▶ [DISPONIBLE]
       │
       ▼ (crea orden)
   [CONGELADO / ESCROW]  ← reservado, ni cliente ni conductor lo tocan
       │
       ├─▶ servicio completado ──▶ [LIBERADO al conductor]
       │                               │
       │                               ▼ cash-out ──▶ banco del conductor
       │
       └─▶ orden cancelada ──▶ [DEVUELTO a DISPONIBLE del cliente]
```

### 3.2 Reglas clave
- El **shopper paga en la tienda con su propio capital**. La plataforma le reembolsa (vía liberación del escrow) el costo de productos **+ tarifa de servicio**.
- Toda operación de wallet ocurre dentro de una **transacción de base de datos** (atómica): o se registra completa, o no se registra.
- Cada movimiento es **inmutable**; una corrección es un nuevo movimiento de signo contrario, nunca un borrado.

### 3.3 Edge cases del PRD mapeados al ledger
- **Producto agotado →** chat para acordar reemplazo; si cambia el monto, se recalcula el escrow.
- **Ticket real > estimado →** el cliente aprueba una **recarga extra** que se añade al escrow antes de liberar.
- **Ticket real < estimado →** se **reembolsa la diferencia** del escrow a `[DISPONIBLE]` del cliente.

---

## 4. Modelo de datos (entidades principales)

```
User            id, rol(cliente|conductor|admin), nombre, teléfono, email, estado_kyc
Wallet          id, user_id, saldo_disponible, saldo_congelado   (derivados del ledger)
LedgerEntry     id, wallet_id, tipo(cash_in|hold|release|refund|cash_out|fee),
                monto, order_id, created_at   (inmutable)
Order           id, cliente_id, conductor_id, tipo(compra|viaje), estado,
                monto_estimado, monto_final, direccion_entrega, created_at
OrderItem       id, order_id, nombre, cantidad, precio_estimado, precio_real, estado
Trip            id, order_id, origen, destino, distancia, tarifa   (para mototaxi)
TrackingPoint   id, order_id, lat, lng, timestamp
ChatMessage     id, order_id, from_user_id, texto, created_at
```

### Estados de una orden
`creada → publicada(feed) → aceptada → en_tienda/en_camino → entregada/finalizada → cerrada`
(+ `cancelada`, `en_disputa`)

---

## 5. Funcionalidades por rol

### 👤 Cliente
- Registro / login, gestión de perfil.
- **Wallet:** fondear (cash-in), ver saldo disponible/congelado, historial.
- **Pedir compra:** crear lista de productos, ver estimación (productos + tarifa), lanzar al feed.
- **Pedir mototaxi:** origen/destino, estimación de tarifa.
- **Tracking en tiempo real** en mapa.
- **Chat** con el conductor (reemplazos, coordinación).
- Aprobar recargas extra / recibir reembolsos.
- Confirmar entrega → libera el pago.

### 🏍️ Conductor / Shopper
- Registro + verificación (KYC básico).
- **Feed de órdenes** disponibles cerca (compras y viajes).
- Aceptar orden, ver lista e instrucciones.
- Marcar **producto sin stock** → abre chat.
- Capturar monto real del ticket (foto/entrada manual).
- Enviar su ubicación (tracking).
- Finalizar servicio → recibe fondos en Wallet.
- **Cash-out** a cuenta bancaria + historial de ganancias.

### 🛠️ Admin
- Dashboard: órdenes activas, GMV, usuarios, conductores en línea.
- Gestión de usuarios y conductores (aprobar KYC, suspender).
- **Gestión de disputas** (poder de liberar/revertir escrow con registro).
- Configurar **tarifas y comisiones** de la plataforma.
- Auditoría del ledger (ver todos los movimientos).

---

## 6. Plan de desarrollo por fases

### Fase 0 — Cimientos (semana 1)
- Monorepo, PostgreSQL + Prisma, esquema base, NestJS, auth con JWT + roles.
- **Entregable:** registro/login funcionando para los 3 roles.

### Fase 1 — Wallet & Ledger (semana 2)
- Ledger de doble entrada, cash-in (simulado), saldos disponible/congelado.
- Pruebas de concurrencia y atomicidad.
- **Entregable:** un cliente fondea y ve su saldo; movimientos auditables.

### Fase 2 — Flujo de compra end-to-end (semanas 3–4)
- Crear lista → estimación → escrow (hold) → feed → aceptar → entregar → liberar.
- Edge cases: sin stock, diferencia de precio, cancelación.
- **Entregable:** una compra completa de principio a fin entre dos usuarios.

### Fase 3 — Tiempo real (semana 5)
- WebSockets: feed en vivo, tracking en mapa, chat.
- **Entregable:** el cliente ve al conductor moverse y chatea con él.

### Fase 4 — Vertical mototaxi (semana 6)
- Flujo de viaje (origen/destino, tarifa, mismo escrow y wallet).
- **Entregable:** pedir y completar un traslado.

### Fase 5 — Panel Admin + disputas (semana 7)
- Dashboard, KYC, tarifas, gestión de disputas, auditoría.
- **Entregable:** operación supervisable.

### Fase 6 — Endurecimiento (semana 8)
- Pasarela de pago real (cash-in/out), seguridad, notificaciones, pruebas.
- **Entregable:** candidato a piloto.

---

## 7. Riesgos y puntos a definir

| Tema | Decisión pendiente |
|---|---|
| **Pasarela de pago** | ¿Cuál? (define cash-in/out real y comisiones). En MVP va simulada. |
| **KYC de conductores** | Nivel de verificación requerido legalmente en el país de operación. |
| **Capital del shopper** | ¿Qué pasa si el conductor no tiene efectivo para pagar la compra? (¿límite de orden según historial?) |
| **Comisión de la plataforma** | % sobre tarifa, ¿también sobre productos? |
| **Zona de operación** | Ciudad inicial define el piloto y la carga de mapas. |
| **Manejo de disputas** | Política clara de a quién favorece el escrow en conflicto. |

---

## 8. Siguiente paso sugerido

Arrancar por **Fase 0 + Fase 1**, porque el Wallet/Escrow es el componente de mayor riesgo técnico y todo lo demás depende de él. Con eso funcionando, el resto son flujos sobre una base sólida.
