import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

/**
 * Usuarios de demostración. Las contraseñas viven solo aquí (archivo semilla
 * de desarrollo), no se imprimen en consola.
 */
const DEMO_USERS = [
  {
    email: 'plataforma@superapp.local',
    name: 'Plataforma (comisiones)',
    role: 'ADMIN',
    password: 'plataforma-interno-no-login',
    kycStatus: 'APPROVED',
  },
  {
    email: 'admin@superapp.local',
    name: 'Administrador',
    role: 'ADMIN',
    password: 'admin1234',
    kycStatus: 'APPROVED',
  },
  {
    email: 'cliente@superapp.local',
    name: 'Cliente Demo',
    role: 'CLIENTE',
    password: 'cliente1234',
    kycStatus: 'APPROVED',
  },
  {
    email: 'conductor@superapp.local',
    name: 'Conductor Demo',
    role: 'CONDUCTOR',
    password: 'conductor1234',
    kycStatus: 'APPROVED',
  },
];

async function main() {
  for (const u of DEMO_USERS) {
    const passwordHash = await bcrypt.hash(u.password, 10);
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: {
        email: u.email,
        name: u.name,
        role: u.role,
        kycStatus: u.kycStatus,
        passwordHash,
        wallet: { create: {} },
      },
    });
    console.log(`  ✓ ${u.role.padEnd(9)} ${user.email}`);
  }
  console.log('\nSeed completado. Credenciales en prisma/seed.ts (DEMO_USERS).');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
