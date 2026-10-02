# Despliegue en Render + Neon (gratis, sin tarjeta)

- **Render** aloja la API (gratis, sin tarjeta). Lee el código desde un repo de GitHub.
- **Neon** aloja la base de datos PostgreSQL (gratis, sin tarjeta, datos persistentes).

Archivos ya preparados en `apps/api/`: `Dockerfile`, `.dockerignore`, `entrypoint.sh`,
`prisma/schema.prod.prisma` (esquema Postgres). El local sigue en SQLite sin cambios.

## 1) Base de datos — Neon

1. Crea cuenta en **https://neon.tech** (puedes entrar con Google/GitHub).
2. Crea un proyecto (región cercana, p. ej. US East).
3. Copia la **connection string** (elige la *Pooled connection*). Se ve así:
   `postgresql://usuario:clave@ep-xxx-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require`
   Esa cadena es tu `DATABASE_URL`.

## 2) Código en GitHub

Render necesita el código en un repo. Si el repo es **público**, Render lo toma por URL
sin conectar tu cuenta de GitHub.

- Crea cuenta en **https://github.com** (si no tienes).
- Crea un repositorio **público** nuevo (p. ej. `super-app-delivery`).
- Sube el código (te guío con los comandos de `git push`).

## 3) Servicio web — Render

1. Crea cuenta en **https://render.com** (entra con GitHub o email; **no pide tarjeta**).
2. **New +** → **Web Service** → pega la URL pública de tu repo de GitHub.
3. Configura:
   - **Root Directory:** `apps/api`
   - **Runtime / Environment:** Docker (detecta el `Dockerfile` solo)
   - **Instance Type:** Free
   - **Health Check Path:** `/health`
4. En **Environment** agrega las variables:
   - `DATABASE_URL` = la connection string de Neon (paso 1)
   - `JWT_SECRET` = una cadena larga y aleatoria
   - (opcional) `PM_BANK`, `PM_PHONE`, `PM_CEDULA` = datos de Pago Móvil de la plataforma
5. **Create Web Service**. Render construye la imagen y despliega.

Al terminar, la app queda en `https://<tu-servicio>.onrender.com`
(páginas: `/app.html`, `/admin.html`, `/`). El primer arranque crea las tablas y
carga los usuarios demo automáticamente.

## Notas

- **Persistencia:** los datos viven en Neon, no en Render, así que sobreviven reinicios
  y nuevos despliegues.
- **Plan gratis de Render:** el servicio se "duerme" tras ~15 min sin tráfico; el primer
  acceso tras dormir tarda ~30–60 s en despertar. Normal en el plan gratis.
- **Actualizar:** haz `git push` y Render redesplega solo (auto-deploy).
- **Pagos reales:** cuando tengas el agregador (PagoFlash / Mega Soft / banco C2P),
  implementa su proveedor y cambia una línea en `payments.module.ts`.
