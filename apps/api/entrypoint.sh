#!/bin/sh
set -e

# Aplica las migraciones a la base de datos del volumen.
npx prisma migrate deploy

# Carga los usuarios demo solo si la base está vacía (primer arranque).
if node -e "const {PrismaClient}=require('@prisma/client');(async()=>{const p=new PrismaClient();const n=await p.user.count();await p.\$disconnect();process.exit(n>0?0:1)})().catch(()=>process.exit(1))"; then
  echo "La base ya tiene datos; se omite el seed."
else
  echo "Base vacía: ejecutando seed inicial..."
  npx prisma db seed || echo "Seed falló (continuando)."
fi

exec node dist/main.js
