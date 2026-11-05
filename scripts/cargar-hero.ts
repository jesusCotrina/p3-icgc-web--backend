/**
 * Carga las tres fotos de fábrica del hero del inicio en "Ajustes del sitio"
 * (tabla hero_slides), para que desde el gestor se puedan ver y reemplazar.
 * Si ya hay fotos cargadas, no toca nada.
 *
 *   Local:      npx tsx scripts/cargar-hero.ts
 *   Producción: docker compose -f docker-compose.prod.yml exec backend node dist/scripts/cargar-hero.js
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { PrismaClient } from '@prisma/client';
import { env } from '../src/config/env';
import { revalidateWeb } from '../src/services/revalidate.service';

const prisma = new PrismaClient();
const DATOS = path.resolve(process.cwd(), 'scripts', 'datos', 'hero');

// Mismo orden y mismos textos que frontend-web/src/app/page.tsx (HERO_SLIDES)
const FOTOS = [
  {
    archivo: 'linderaje-comunidad-campesina-yanacona.webp',
    alt: 'Comuneros de la comunidad campesina Yanacona recorriendo sus tierras durante el linderaje, con banderas y los Andes al fondo',
  },
  {
    archivo: 'charla-de-seguridad-equipo-en-los-andes.webp',
    alt: 'Equipo de trabajadores con casco y uniforme naranja reunidos en una charla de seguridad al pie de una montaña nevada',
  },
  {
    archivo: 'entrega-de-maquinaria-a-la-comunidad-hd.webp',
    alt: 'Ceremonia de entrega de volquetes y maquinaria pesada a una comunidad, con los asistentes sentados frente a los vehículos',
  },
];

/** Copia la foto a uploads/images (si falta) y la registra en Multimedia. */
async function registrarFoto(archivo: string, alt: string, userId: string | null) {
  const filename = `icgc-hero-${archivo}`;
  const destino = path.join(env.imagesDir, filename);
  if (!fs.existsSync(destino)) {
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    fs.copyFileSync(path.join(DATOS, archivo), destino);
  }
  const { width, height } = await sharp(destino).metadata();
  const datos = {
    kind: 'IMAGE' as const,
    originalName: archivo,
    mimeType: 'image/webp',
    sizeBytes: BigInt(fs.statSync(destino).size),
    relativePath: `images/${filename}`,
    width: width ?? null,
    height: height ?? null,
    alt,
  };
  return prisma.media.upsert({
    where: { filename },
    update: datos,
    create: { ...datos, filename, uploadedById: userId },
  });
}

async function main() {
  const existentes = await prisma.heroSlide.count();
  if (existentes > 0) {
    console.log(`   [ok] La portada ya tiene ${existentes} foto(s) cargadas desde el gestor; no se tocan.`);
    return;
  }

  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' }, select: { id: true } });
  for (const [i, f] of FOTOS.entries()) {
    const media = await registrarFoto(f.archivo, f.alt, admin?.id ?? null);
    await prisma.heroSlide.create({ data: { position: i + 1, mediaId: media.id, alt: f.alt } });
    console.log(`   [ok] Foto ${i + 1} de la portada: ${f.archivo}`);
  }

  revalidateWeb(['settings']);
  await new Promise((r) => setTimeout(r, 1500));
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
