import { execSync } from 'child_process';
import { existsSync, rmSync } from 'fs';
import { join } from 'path';

/** Crea una base de datos SQLite limpia para las pruebas antes de ejecutarlas. */
export default function globalSetup(): void {
  const dbFile = join(__dirname, '..', 'prisma', 'test.db');
  if (existsSync(dbFile)) rmSync(dbFile);

  execSync('npx prisma migrate deploy', {
    cwd: join(__dirname, '..'),
    env: { ...process.env, DATABASE_URL: `file:${dbFile}` },
    stdio: 'inherit',
  });
}
