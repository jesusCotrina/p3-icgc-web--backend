/**
 * Carga (o actualiza) las experiencias reales del ICGC en "Proyectos", con sus
 * fotos de scripts/datos/proyectos. Se puede correr varias veces: actualiza
 * por slug, no duplica.
 *
 *   Local:      npm run cargar:proyectos
 *   Producción: docker compose -f docker-compose.prod.yml exec backend node dist/scripts/cargar-proyectos.js
 *
 * Los "Proyecto de ejemplo..." quedan ocultos (no se borran).
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { Prisma, PrismaClient } from '@prisma/client';
import { env } from '../src/config/env';
import { revalidateWeb } from '../src/services/revalidate.service';
import { slugify } from '../src/utils/slug';

const prisma = new PrismaClient();
const DATOS = path.resolve(process.cwd(), 'scripts', 'datos', 'proyectos');

type Experiencia = {
  title: string;
  company: string;
  community: string;
  location: string;
  region: string;
  /** Subtítulo del detalle; sin él se muestra la comunidad */
  headline?: string;
  /** Título de la lista de trabajos; sin él, "Servicios brindados" */
  itemsTitle?: string;
  objective: string;
  items: { title: string; description: string }[];
  foto: string;
  alt: string;
  /** Falta un dato (ubicación): se carga oculta para completarla en el gestor */
  oculta?: boolean;
};

const RAURA = 'Compañía Minera Raura S.A.';
const BUENAVENTURA = 'Compañía de Minas Buenaventura S.A.A.';
const ECOSERMUQ = 'Empresa de Servicios Múltiples de Quichas (ECOSERMUQ)';
const ECOSARC = 'Empresa Comunal de Servicios Múltiples Santa Rosa (ECOSARC)';
const ECOSERM_VIP =
  'Empresa Comunal de Servicios Múltiples de la Comunidad Campesina Virgen de las Nieves Villa Patari (ECOSERM VIP)';

// En este orden se muestran: los 6 primeros van al inicio. Las experiencias
// que comparten foto no quedan juntas en la grilla.
const EXPERIENCIAS: Experiencia[] = [
  {
    title: 'Minera Raura y la Comunidad Campesina de Quichas',
    company: RAURA,
    community: 'Comunidad Campesina de Quichas',
    location: 'Oyón, Lima',
    region: 'lima',
    headline: 'Asesoría integral a la Comunidad Campesina de Quichas',
    objective:
      'Fortalecemos la gestión de la comunidad y promovemos oportunidades para su población y sus empresas, con respeto a sus derechos y enfoque de sostenibilidad.',
    items: [
      {
        title: 'Fortalecimiento de la gestión comunal',
        description:
          'Asesoría a la directiva en organización, toma de decisiones y seguimiento de acuerdos conforme a la normativa comunal.',
      },
      {
        title: 'Mesas de diálogo y negociación',
        description:
          'Acompañamiento en negociaciones con Minera Raura y entidades del Estado, revisión de convenios y seguimiento de compromisos.',
      },
      {
        title: 'Coordinación de servicios con Minera Raura',
        description:
          'Asesoría en reuniones sobre transporte de concentrado, regado de vías y cantera, abordando condiciones operativas, tarifas y contratos.',
      },
      {
        title: 'Seguimiento y control de la gestión',
        description:
          'Reuniones semanales con las áreas de la comunidad para evaluar avances y definir mejoras, responsables y plazos.',
      },
      {
        title: 'Asesoría técnica, administrativa y legal',
        description:
          'Soporte a las áreas de la comunidad en operaciones, administración, contratos y cumplimiento de obligaciones.',
      },
      {
        title: 'Gestión ambiental y seguridad laboral',
        description:
          'Revisión documental y seguimiento de observaciones para orientar el cumplimiento de normas ambientales, de seguridad y salud en el trabajo.',
      },
    ],
    foto: 'proyecto-1-hd.webp',
    alt: 'Volquetes en la vía de la Comunidad Campesina de Quichas, con un trabajador con traje de protección junto a los conos de seguridad',
  },
  {
    title: 'Minera Raura y la empresa comunal ECOSERMUQ de Quichas',
    company: RAURA,
    community: ECOSERMUQ,
    location: 'Oyón, Lima',
    region: 'lima',
    headline: 'Gestión de Proyectos y Operaciones en ECOSERMUQ',
    objective:
      'Durante su desempeño como gerente de Proyectos y Operaciones, impulsó el desarrollo sostenible de ECOSERMUQ y su consolidación como socio estratégico de Minera Raura.',
    itemsTitle: 'Principales responsabilidades y aportes',
    items: [
      {
        title: 'Dirección de proyectos y operaciones',
        description:
          'Gestión de movimiento de tierras, obras civiles, mantenimiento de vías, estabilidad hidrológica, geosintéticos, tuberías HDPE y trabajos en la PTARI y pozos de lodos, con control de costos, plazos, calidad y seguridad.',
      },
      {
        title: 'Desarrollo empresarial',
        description:
          'Fortalecimiento de la organización y eficiencia operativa, promoviendo oportunidades de negocio y relaciones comerciales sostenibles.',
      },
      {
        title: 'Gestión de servicios y contratos',
        description:
          'Revisión de contratos, términos de referencia y alcances, y coordinación con Minera Raura para atender requerimientos y cumplir compromisos.',
      },
      {
        title: 'Residencia de obras y servicios',
        description:
          'Conducción técnica en campo y coordinación del personal, asumiendo funciones de residente cuando fue necesario.',
      },
      {
        title: 'Diálogo y negociación empresarial',
        description:
          'Participación en mesas de diálogo con Minera Raura, sustentando propuestas para ampliar oportunidades de negocio y mejorar condiciones comerciales.',
      },
      {
        title: 'Remediación Anamaray',
        description:
          'Gestión de los trabajos ejecutados por ECOSERMUQ para la Compañía de Minas Buenaventura en el proyecto de remediación Anamaray.',
      },
    ],
    foto: 'proyecto-2-hd.webp',
    alt: 'Excavadora cargando material en un volquete dentro de una operación minera en la sierra',
  },
  {
    title: 'Minas Buenaventura y la Comunidad Campesina Santa Rosa de Colquijirca',
    company: BUENAVENTURA,
    community: 'Comunidad Campesina Santa Rosa de Colquijirca',
    location: 'Tinyahuarco, Pasco',
    region: 'pasco',
    headline:
      'Participación en la Comisión Negociadora de Santa Rosa de Colquijirca con Compañía de Minas Buenaventura',
    objective:
      'Comisión negociadora, aportando experiencia profesional al fortalecimiento de la gestión y representación comunal.',
    itemsTitle: 'Principales responsabilidades y aportes',
    items: [
      {
        title: 'Negociación de tierras y convenio marco',
        description:
          'Participación en la comisión encargada de negociar las tierras comunales y concertar las condiciones para la suscripción del convenio marco con la Compañía de Minas Buenaventura.',
      },
      {
        title: 'Oportunidades para la comunidad y su empresa comunal',
        description:
          'Reuniones orientadas a promover oportunidades de negocio y colaboración para fortalecer la empresa comunal y generar beneficios sostenibles para la comunidad.',
      },
    ],
    foto: 'proyecto-3-reunion-colquijirca.webp',
    alt: 'Reunión de trabajo con dirigentes de la Comunidad Campesina Santa Rosa de Colquijirca, sentados a una mesa larga en una sala de reuniones',
  },
  {
    title: 'Minas Buenaventura y la empresa comunal ECOSARC de Santa Rosa',
    company: BUENAVENTURA,
    community: ECOSARC,
    location: 'Tinyahuarco, Pasco',
    region: 'pasco',
    headline: 'Gestión Empresarial en la Empresa Comunal Santa Rosa — ECOSARC',
    objective:
      'Experiencia en la gestión y fortalecimiento de ECOSARC, empresa comunal prestadora de servicios para Compañía de Minas Buenaventura, impulsando su competitividad y la generación de oportunidades sostenibles para la comunidad.',
    itemsTitle: 'Principales responsabilidades y aportes',
    items: [
      {
        title: 'Gestión de operaciones y proyectos',
        description:
          'Gestión de trabajos en tajo abierto, movimiento de tierras, bombeo, geosintéticos, tuberías HDPE, remediación y obras civiles; y alquiler de maquinaria de línea amarilla, volquetes, camionetas, servicios generales y luminarias.',
      },
      {
        title: 'Negociaciones y oportunidades de negocio',
        description:
          'Negociaciones para diversificar los rubros de la empresa, ampliar servicios y generar empleo local, fortaleciendo la gestión contractual y las relaciones comerciales con la minera.',
      },
      {
        title: 'Gobierno y fortalecimiento empresarial',
        description:
          'Conducción del Directorio durante dos periodos y actualización del estatuto según las necesidades de la empresa, promoviendo el cumplimiento normativo y una gestión ordenada y sostenible.',
      },
    ],
    foto: 'proyecto-4-hd.webp',
    alt: 'Excavadora Caterpillar trabajando en el talud de una operación minera',
  },
  {
    title: 'Minera El Brocal y la empresa comunal ECOSARC de Santa Rosa',
    company: 'Sociedad Minera El Brocal S.A.A.',
    community: ECOSARC,
    location: 'Tinyahuarco, Pasco',
    region: 'pasco',
    headline: 'Gestión Empresarial en la Empresa Comunal Santa Rosa — ECOSARC',
    objective:
      'Experiencia en la gestión y fortalecimiento de ECOSARC, prestadora de servicios para Minera El Brocal, impulsando el desarrollo de sus operaciones y nuevas oportunidades de negocio.',
    itemsTitle: 'Principales responsabilidades y aportes',
    items: [
      {
        title: 'Gestión de operaciones y proyectos',
        description:
          'Gestión y consolidación de trabajos en tajo abierto, bombeo, instalación de geosintéticos y tuberías HDPE, remediación y obras civiles.',
      },
      {
        title: 'Negociaciones y oportunidades de negocio',
        description:
          'Liderazgo de reuniones y negociaciones para ampliar servicios, fortalecer la gestión contractual y afianzar las relaciones comerciales con Minera El Brocal.',
      },
      {
        title: 'Gobierno y fortalecimiento empresarial',
        description:
          'Conducción del Directorio durante dos periodos, promoviendo el cumplimiento de los estatutos y la normativa aplicable, así como una gestión ordenada y orientada al desarrollo sostenible.',
      },
    ],
    foto: 'proyecto-5-hd.webp',
    alt: 'Trabajador instalando geomembrana en el fondo de una poza de gran tamaño',
  },
  {
    title: 'Paltarumi y la Comunidad Campesina de Pararín',
    company: 'Paltarumi S.A.C.',
    community: 'Comunidad Campesina de Pararín',
    location: 'Huarmey, Áncash',
    region: 'ancash',
    headline: 'Capacitación en Gestión Empresarial en la Comunidad Campesina de Pararín',
    objective:
      'Por encargo de Paltarumi S.A.C., brindamos charlas en las distintas bases de la Comunidad Campesina de Pararín para fortalecer su organización y gestión empresarial, compartiendo experiencias exitosas y estrategias de negociación.',
    itemsTitle: 'Principales responsabilidades y aportes',
    items: [
      {
        title: 'Constitución y reactivación de la empresa comunal',
        description:
          'Capacitación sobre requisitos, marco normativo y procedimientos para constituir o reactivar la empresa comunal.',
      },
      {
        title: 'Revisión de estatutos y recomendaciones',
        description:
          'Revisión de los estatutos vigentes de la comunidad y su empresa comunal, con recomendaciones técnicas y legales para su actualización conforme a sus necesidades y la normativa aplicable.',
      },
      {
        title: 'Procedimientos administrativos para el funcionamiento',
        description:
          'Orientación sobre trámites, documentación y requisitos administrativos necesarios para el funcionamiento de la empresa comunal.',
      },
      {
        title: 'Experiencias exitosas y estrategias de negociación',
        description:
          'Presentación de experiencias de empresas comunales exitosas y estrategias de negociación con empresas privadas de la zona de influencia, promoviendo oportunidades de negocio y relaciones comerciales sostenibles.',
      },
    ],
    foto: 'proyecto-6-hd.webp',
    alt: 'Foto grupal de comuneros y comuneras de Pararín al cierre de una capacitación',
  },
  {
    title: 'Hochschild Mining y la empresa comunal ECOSERM VIP',
    company: 'Hochschild Mining (Perú) S.A.C.',
    community: ECOSERM_VIP,
    location: 'Por confirmar',
    region: 'arequipa',
    objective:
      'Asesoría en la constitución y formalización de ECOSERM VIP y acompañamiento en negociaciones con Hochschild Mining para promover oportunidades de negocio.',
    items: [
      {
        title: 'Constitución y formalización de ECOSERM VIP',
        description: 'Asesoría para constituir y formalizar la empresa comunal.',
      },
      {
        title: 'Negociaciones con Hochschild Mining',
        description: 'Acompañamiento en las negociaciones para promover oportunidades de negocio.',
      },
    ],
    foto: 'proyecto-7-hd.webp',
    alt: 'Dirigentes y asesores revisando mapas y documentos en una mesa de trabajo',
    oculta: true,
  },
  {
    title: 'Minas Buenaventura y la empresa comunal ECOSERMUQ de Quichas',
    company: BUENAVENTURA,
    community: ECOSERMUQ,
    location: 'Oyón, Lima',
    region: 'lima',
    objective:
      'Gerencia de Proyectos y Operaciones de ECOSERMUQ: soporte al desarrollo empresarial y liderazgo en la gestión de proyectos, operaciones y servicios vinculados a la Compañía de Minas Buenaventura.',
    items: [
      {
        title: 'Gerencia de proyectos y operaciones',
        description: 'Dirección de los proyectos y las operaciones de la empresa comunal.',
      },
      {
        title: 'Desarrollo empresarial',
        description: 'Soporte al crecimiento y la organización de ECOSERMUQ como empresa.',
      },
      {
        title: 'Servicios para el sector minero',
        description: 'Gestión de los servicios que la empresa comunal presta a la Compañía de Minas Buenaventura.',
      },
    ],
    foto: 'proyecto-2-hd.webp',
    alt: 'Excavadora cargando material en un volquete dentro de una operación minera en la sierra',
  },
  {
    title: 'Minera Ares y la empresa comunal ECOSERM VIP',
    company: 'Compañía Minera Ares S.A.C.',
    community: ECOSERM_VIP,
    location: 'Por confirmar',
    region: 'arequipa',
    objective:
      'Asesoría en la constitución y formalización de ECOSERM VIP y acompañamiento en negociaciones con la Compañía Minera Ares para promover oportunidades de negocio.',
    items: [
      {
        title: 'Constitución y formalización de ECOSERM VIP',
        description: 'Asesoría para constituir y formalizar la empresa comunal.',
      },
      {
        title: 'Negociaciones con la Compañía Minera Ares',
        description: 'Acompañamiento en las negociaciones para promover oportunidades de negocio.',
      },
    ],
    foto: 'proyecto-7-hd.webp',
    alt: 'Dirigentes y asesores revisando mapas y documentos en una mesa de trabajo',
    oculta: true,
  },
];

/** Copia la foto a uploads/images (si falta) y la registra en Multimedia. */
async function registrarFoto(archivo: string, alt: string, userId: string | null) {
  const filename = `icgc-${archivo}`;
  const destino = path.join(env.imagesDir, filename);
  if (!fs.existsSync(destino)) {
    fs.mkdirSync(env.imagesDir, { recursive: true });
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
  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' }, select: { id: true } });

  for (const [posicion, e] of EXPERIENCIAS.entries()) {
    const foto = await registrarFoto(e.foto, e.alt, admin?.id ?? null);
    const slug = slugify(e.title);
    const datos = {
      title: e.title,
      company: e.company,
      community: e.community,
      location: e.location,
      region: e.region,
      headline: e.headline ?? '',
      itemsTitle: e.itemsTitle ?? '',
      objective: e.objective,
      items: e.items as Prisma.InputJsonValue,
      coverImageId: foto.id,
      coverAlt: e.alt,
      position: posicion + 1,
      isPublished: !e.oculta,
      status: 'COMPLETED' as const,
    };
    await prisma.project.upsert({ where: { slug }, update: datos, create: { ...datos, slug } });
    console.log(`   [ok] ${e.oculta ? '(oculto) ' : ''}${e.title}`);
  }

  const ejemplos = await prisma.project.updateMany({
    where: { title: { startsWith: 'Proyecto de ejemplo', mode: 'insensitive' }, isPublished: true },
    data: { isPublished: false },
  });
  console.log(`   [ok] Proyectos de ejemplo ocultados: ${ejemplos.count}`);

  revalidateWeb(['projects']);
  // Da tiempo a que salga el aviso a la web antes de cerrar
  await new Promise((r) => setTimeout(r, 1500));
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
