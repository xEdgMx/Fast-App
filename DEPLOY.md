# Despliegue en Fly.io

La app se despliega con **Fly.io**: gratis para un piloto, mantiene la base de datos
en un **volumen persistente** (los datos no se borran), soporta WebSockets (tiempo
real) y la región **Miami (mia)** da baja latencia hacia Venezuela.

Archivos ya preparados (en `apps/api/`): `Dockerfile`, `.dockerignore`,
`entrypoint.sh`, `fly.toml`.

## Lo que haces TÚ (una sola vez)

1. **Instalar flyctl** (si no está):
   - Windows (PowerShell): `iwr https://fly.io/install.ps1 -useb | iex`
2. **Crear cuenta / iniciar sesión** (abre el navegador):
   ```
   fly auth signup   # o: fly auth login
   ```
   Fly pide una tarjeta para verificar identidad, pero el plan de arranque es gratuito.

Avísame cuando hayas hecho `fly auth login`. El resto lo corro yo (o puedes copiar
los comandos de abajo).

## Lo que hago YO (o tú, copiando)

Desde `apps/api/`:

```bash
# 1) Crear la app (elige un nombre único; edita 'app' en fly.toml si está tomado)
fly apps create superapp-delivery-pf

# 2) Crear el volumen para la base de datos (1 GB, misma región)
fly volumes create data --region mia --size 1 --yes

# 3) Secretos (NO van en el código)
fly secrets set JWT_SECRET="<una-cadena-larga-y-aleatoria>"
# Datos de Pago Móvil de la plataforma (para recibir fondeos). Opcional ahora:
fly secrets set PM_BANK="0102" PM_PHONE="0414-XXXXXXX" PM_CEDULA="J-XXXXXXXXX"

# 4) Desplegar (Fly construye la imagen en la nube; no necesitas Docker local)
fly deploy --remote-only
```

Al terminar, la app queda en `https://superapp-delivery-pf.fly.dev` (o el nombre
que hayas usado). Páginas: `/app.html`, `/admin.html`, `/`.

## Notas

- **Persistencia:** la base SQLite vive en `/data/prod.db` dentro del volumen; sobrevive
  reinicios y nuevos despliegues. El primer arranque corre las migraciones y carga los
  usuarios demo.
- **Ahorro:** la máquina se suspende cuando no hay tráfico y se reactiva sola al entrar
  (el primer acceso tras un rato puede tardar unos segundos).
- **Actualizar la app:** tras cambios, `fly deploy --remote-only` otra vez.
- **Producción real:** cuando tengas el agregador de pagos (PagoFlash / Mega Soft /
  banco C2P), se implementa su proveedor y se cambia una línea en `payments.module.ts`.
  Para mayor escala, se puede migrar de SQLite a PostgreSQL (Fly Postgres o Neon).
