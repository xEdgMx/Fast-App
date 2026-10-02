# Imagen de producción para la API (NestJS + Prisma + PostgreSQL/Neon).
FROM node:20-slim

WORKDIR /app

# openssl: requerido por los engines de Prisma
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Copiamos todo e instalamos (incluye devDeps para poder compilar con nest).
COPY . .
RUN npm install
# Generamos el cliente de Prisma apuntando al esquema de PRODUCCIÓN (Postgres).
RUN npx prisma generate --schema=prisma/schema.prod.prisma
RUN npm run build

ENV NODE_ENV=production
EXPOSE 3000

# db push (crea el esquema en Postgres) + seed-si-vacío + arranque
CMD ["sh", "entrypoint.sh"]
