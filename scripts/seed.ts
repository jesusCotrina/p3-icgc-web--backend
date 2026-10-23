import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { env } from '../src/config/env';
import { slugify } from '../src/utils/slug';

const prisma = new PrismaClient();

/** Registra en la BD el logo que ya está en uploads/logo, si aún no existe. */
async function seedLogo(userId: string) {
  const dir = env.logoDir;
  if (!fs.existsSync(dir)) return null;

  const file = fs.readdirSync(dir).find((f) => /\.(jpe?g|png|webp|svg|avif)$/i.test(f));
  if (!file) return null;

  const existing = await prisma.media.findUnique({ where: { filename: file } });
  if (existing) return existing;

  const abs = path.join(dir, file);
  const stat = fs.statSync(abs);
  const ext = path.extname(file).toLowerCase();
  const mimeByExt: Record<string, string> = {
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.avif': 'image/avif',
  };

  return prisma.media.create({
    data: {
      kind: 'IMAGE',
      filename: file,
      originalName: file,
      mimeType: mimeByExt[ext] ?? 'image/jpeg',
      sizeBytes: BigInt(stat.size),
      relativePath: `logo/${file}`,
      alt: 'Logo del Instituto de Capacitación en Gestión Comunal',
      uploadedById: userId,
    },
  });
}

async function main() {
  console.log('\nSembrando datos iniciales...\n');

  // ── Administrador ──
  const email = env.ADMIN_EMAIL.toLowerCase();
  const passwordHash = await bcrypt.hash(env.ADMIN_PASSWORD, 12);

  const admin = await prisma.user.upsert({
    where: { email },
    update: { name: env.ADMIN_NAME, isActive: true },
    create: { email, passwordHash, name: env.ADMIN_NAME, role: 'ADMIN' },
  });
  console.log(`   [ok] Administrador: ${admin.email}`);

  // ── Logo ──
  const logo = await seedLogo(admin.id);
  if (logo) console.log(`   [ok] Logo registrado: ${logo.relativePath}`);

  // ── Configuración del sitio ──
  // Datos generales de la empresa. Todos los campos de contacto y redes se
  // guardan aunque esten vacios: el gestor los muestra igual para rellenarlos.
  const datosGenerales = {
    siteName: 'Instituto de Capacitación en Gestión Comunal',
    tagline:
      'Consultoría especializada y capacitación en gestión comunal, licitaciones y ejecución ' +
      'de proyectos de infraestructura para comunidades y organizaciones.',
    defaultMetaDescription:
      'Instituto de Capacitación en Gestión Comunal (ICGC): asesoría en licitaciones y ejecución ' +
      'de proyectos de infraestructura, y cursos para comunidades y organizaciones del Perú.',
    email: 'informes@icgc.edu.pe',
    phone: '+51 999 999 999',
    // Sin numero todavia: los botones de WhatsApp caen a la pagina de contacto
    // hasta que se cargue desde el gestor.
    whatsapp: null,
    address: null,
    city: 'Lima',
    country: 'PE',
    facebookUrl: null,
    instagramUrl: null,
    linkedinUrl: null,
    tiktokUrl: null,
    youtubeUrl: null,
    yearsExperience: 10,
    projectsAdvised: 50,
    regionsServed: 3,
  };

  await prisma.siteSettings.upsert({
    where: { id: 'singleton' },
    // En una BD ya creada refrescamos los textos y las cifras, pero respetamos
    // lo que el admin haya cargado: contacto y redes no se pisan.
    update: {
      siteName: datosGenerales.siteName,
      tagline: datosGenerales.tagline,
      defaultMetaDescription: datosGenerales.defaultMetaDescription,
      yearsExperience: datosGenerales.yearsExperience,
      projectsAdvised: datosGenerales.projectsAdvised,
      regionsServed: datosGenerales.regionsServed,
      ...(logo ? { logoMediaId: logo.id } : {}),
    },
    create: {
      id: 'singleton',
      siteUrl: 'http://localhost:3000',
      logoMediaId: logo?.id ?? null,
      ...datosGenerales,
    },
  });
  console.log('   [ok] Configuración del sitio');

  // ── Categorías ──
  const categories = [
    {
      name: 'Gestión Comunal',
      description: 'Herramientas y buenas prácticas para la administración de comunidades.',
    },
    {
      name: 'Capacitación',
      description: 'Cursos, diplomados y programas formativos del instituto.',
    },
    {
      name: 'Normativa',
      description: 'Marco legal aplicable a comunidades campesinas y nativas.',
    },
    { name: 'Noticias ICGC', description: 'Novedades y actividades del instituto.' },
  ];

  for (const c of categories) {
    await prisma.category.upsert({
      where: { slug: slugify(c.name) },
      update: { description: c.description },
      create: { slug: slugify(c.name), name: c.name, description: c.description },
    });
  }
  console.log(`   [ok] ${categories.length} categorías`);

  // ── Artículo de ejemplo (cumple la auditoría SEO) ──
  const categoria = await prisma.category.findUnique({
    where: { slug: slugify('Gestión Comunal') },
  });
  const slug = 'que-es-la-gestion-comunal-y-por-que-importa';

  const yaExiste = await prisma.post.findUnique({ where: { slug } });
  if (!yaExiste) {
    await prisma.post.create({
      data: {
        slug,
        title: 'Qué es la gestión comunal y por qué importa en el Perú',
        subtitle: 'Una introducción práctica para dirigentes y profesionales',
        excerpt:
          'La gestión comunal articula la organización, el territorio y los recursos de una ' +
          'comunidad. Te explicamos sus pilares y por qué capacitarse marca la diferencia.',
        metaTitle: 'Qué es la gestión comunal y por qué importa | ICGC',
        metaDescription:
          'Descubre qué es la gestión comunal, cuáles son sus pilares y por qué la capacitación ' +
          'de dirigentes fortalece a las comunidades campesinas y nativas del Perú.',
        focusKeyword: 'gestión comunal',
        status: 'PUBLISHED',
        publishedAt: new Date(),
        featured: true,
        coverImageId: logo?.id ?? null,
        coverAlt: 'Dirigentes comunales en una sesión de capacitación del ICGC',
        wordCount: 320,
        readingMinutes: 2,
        authorId: admin.id,
        categoryId: categoria?.id ?? null,
        blocks: {
          create: [
            {
              position: 0,
              type: 'PARAGRAPH',
              text:
                'La gestión comunal es el conjunto de prácticas con las que una comunidad organiza ' +
                'su territorio, administra sus recursos y toma decisiones colectivas. En el Perú ' +
                'involucra a miles de comunidades campesinas y nativas, cada una con su asamblea, ' +
                'su junta directiva y sus acuerdos internos.',
            },
            {
              position: 1,
              type: 'HEADING',
              level: 2,
              text: 'Los tres pilares de la gestión comunal',
            },
            {
              position: 2,
              type: 'PARAGRAPH',
              text:
                'Toda gestión comunal sólida se apoya en tres pilares: una organización con roles ' +
                'claros, un manejo transparente de los recursos y un vínculo permanente con las ' +
                'instituciones del Estado. Cuando uno falla, los otros dos se debilitan.',
            },
            {
              position: 3,
              type: 'LIST',
              listStyle: 'bullet',
              text:
                'Organización: asamblea, junta directiva y comités especializados\n' +
                'Recursos: padrón actualizado, libro de actas y rendición de cuentas\n' +
                'Articulación: convenios, proyectos y representación ante el Estado',
            },
            {
              position: 4,
              type: 'HEADING',
              level: 2,
              text: 'Por qué capacitarse marca la diferencia',
            },
            {
              position: 5,
              type: 'PARAGRAPH',
              text:
                'Un dirigente capacitado reduce conflictos internos, formula mejores proyectos y ' +
                'negocia en mejores condiciones. El ICGC acompaña ese proceso con programas ' +
                'diseñados desde la realidad de las comunidades, no desde el escritorio.',
            },
            {
              position: 6,
              type: 'QUOTE',
              text:
                'Una comunidad que documenta sus acuerdos es una comunidad que defiende su territorio.',
            },
          ],
        },
      },
    });
    console.log('   [ok] Artículo de ejemplo publicado');
  }

  console.log('\nListo. Credenciales del gestor:');
  console.log(`   Correo     : ${env.ADMIN_EMAIL}`);
  console.log(`   Contraseña : ${env.ADMIN_PASSWORD}\n`);
}

main()
  .catch((e) => {
    console.error('\nError al sembrar datos:\n', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
