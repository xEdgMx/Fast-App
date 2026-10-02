#!/bin/sh
set -e

# Crea/actualiza el esquema en la base de datos PostgreSQL (Neon).
npx prisma db push --schema=prisma/schema.prod.prisma --skip-generate

# Carga los usuarios demo solo si la base está vacía (primer arranque).
if node -e "const {PrismaClient}=require('@prisma/client');(async()=>{const p=new PrismaClient();const n=await p.user.count();await p.\$disconnect();process.exit(n>0?0:1)})().catch(()=>process.exit(1))"; then
  echo "La base ya tiene datos; se omite el seed."
else
  echo "Base vacía: ejecutando seed inicial..."
  npx ts-node prisma/seed.ts || echo "Seed falló (continuando)."
fi

exec node dist/main.js
