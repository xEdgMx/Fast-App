# Imagen de producción para la API (NestJS + Prisma + SQLite en volumen).
FROM node:20-slim

WORKDIR /app

# openssl: requerido por los engines de Prisma
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Copiamos todo e instalamos (incluye devDeps para poder compilar con nest).
COPY . .
RUN npm install
RUN npx prisma generate
RUN npm run build

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# migrate deploy + seed-si-vacío + arranque (ver entrypoint.sh)
CMD ["sh", "entrypoint.sh"]
