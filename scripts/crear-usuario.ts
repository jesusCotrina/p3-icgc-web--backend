/**
 * Crea (o reactiva) un usuario administrador del gestor con el correo y la
 * contraseña que se le pasan. Si el correo ya existe, le cambia la contraseña.
 *
 *   Local:      npx tsx scripts/crear-usuario.ts correo@dominio.com 'Contraseña' 'Nombre'
 *   Producción: docker compose -f docker-compose.prod.yml exec backend \
 *                 node dist/scripts/crear-usuario.js correo@dominio.com 'Contraseña' 'Nombre'
 *
 * La contraseña debe tener al menos 8 caracteres. El nombre es opcional.
 */
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const [correo, password, nombre] = process.argv.slice(2);
  const email = (correo ?? '').trim().toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Indica un correo válido.');
  if (!password || password.length < 8) {
    throw new Error('La contraseña debe tener al menos 8 caracteres.');
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const usuario = await prisma.user.upsert({
    where: { email },
    update: { passwordHash, isActive: true, ...(nombre ? { name: nombre } : {}) },
    create: { email, passwordHash, name: nombre || 'Administrador ICGC', role: 'ADMIN' },
  });

  console.log(`\n   [ok] Usuario listo: ${usuario.email} (${usuario.name})`);
  console.log('   Ya puede entrar al gestor con esa contraseña.\n');
}

main()
  .catch((err) => {
    console.error('\nNo se pudo crear el usuario:', (err as Error).message, '\n');
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
