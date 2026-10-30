/**
 * Carga (o actualiza) los cursos del catálogo, todos como "Próximamente", con
 * sus fotos de scripts/datos/cursos. Se puede correr varias veces: actualiza
 * por slug, no duplica. Para cambiar una foto, reemplaza el archivo en esa
 * carpeta (mismo nombre) y vuelve a correrlo.
 *
 *   Local:      npm run cargar:cursos
 *   Producción: docker compose -f docker-compose.prod.yml exec backend node dist/scripts/cargar-cursos.js
 *
 * Los cursos anteriores (fuera de esta lista) quedan ocultos, no se borran;
 * sus direcciones redirigen al curso nuevo (next.config.mjs de la web).
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { PrismaClient } from '@prisma/client';
import { env } from '../src/config/env';
import { revalidateWeb } from '../src/services/revalidate.service';

const prisma = new PrismaClient();
const DATOS = path.resolve(process.cwd(), 'scripts', 'datos', 'cursos');

/** Lo mismo para todos los cursos. */
const COMUN = {
  duration: '8 semanas',
  lectiveHours: 48,
  modality: 'En vivo por Zoom',
  mode: 'ONLINE' as const,
  material: 'Material digital descargable',
  certificate: 'Certificado del ICGC',
  audience: 'Dirigentes, comuneros y trabajadores de comunidades campesinas y empresas comunales',
  comingSoon: true,
  isPublished: true,
};

type Curso = {
  slug: string;
  name: string;
  summary: string;
  topics: string[];
  objective: string;
  alt: string;
  /** Solo uno lleva precio, para ver cómo queda en la web */
  price?: number;
};

const CURSOS: Curso[] = [
  {
    slug: 'gestion-normativa-y-liderazgo-comunal',
    name: 'Gestión, normativa y liderazgo comunal',
    summary:
      'Ley de Comunidades Campesinas, estatutos, reglamentos, funciones de los órganos de gobierno, participación comunal, transparencia, rendición de cuentas y toma de decisiones.',
    topics: [
      'Ley General de Comunidades Campesinas y su reglamento',
      'Estatuto y reglamentos internos: cómo elaborarlos y actualizarlos',
      'Asamblea general, junta directiva y comités: funciones y límites',
      'Convocatoria, quórum y validez de los acuerdos',
      'Participación comunal y liderazgo para dirigentes',
      'Transparencia y rendición de cuentas ante la asamblea',
      'Toma de decisiones y seguimiento de acuerdos',
    ],
    objective:
      'Al terminar podrás conducir la gestión de tu comunidad conforme a la ley y a su estatuto: asambleas válidas, órganos de gobierno que cumplen sus funciones y cuentas claras ante los comuneros.',
    alt: 'Comuneros y comuneras reunidos en una foto grupal al cierre de una capacitación en gestión comunal',
    price: 100,
  },
  {
    slug: 'constitucion-y-formalizacion-de-empresas-comunales',
    name: 'Constitución y formalización de empresas comunales',
    summary:
      'Requisitos, trámites, estructura organizacional y oportunidades de negocio para que la comunidad constituya y formalice su empresa comunal.',
    topics: [
      'Empresa comunal: qué es, modalidades y marco legal',
      'Requisitos y acuerdo de asamblea para constituirla',
      'Estatuto de la empresa y aporte de la comunidad',
      'Trámites ante notaría, SUNARP y SUNAT paso a paso',
      'Estructura organizacional y funciones del personal clave',
      'Identificación de oportunidades de negocio',
    ],
    objective:
      'Sabrás qué hace falta para constituir la empresa de tu comunidad, en qué orden hacer los trámites y cómo organizarla desde el primer día para que pueda contratar y crecer.',
    alt: 'Comuneros con sombrero junto a un asesor del ICGC en un terreno de la sierra',
  },
  {
    slug: 'administracion-de-empresas-comunales',
    name: 'Administración de empresas comunales',
    summary:
      'Gestión de personal, logística, control documentario y coordinación entre la gerencia, el directorio y la comunidad.',
    topics: [
      'Roles de la gerencia, el directorio y la asamblea comunal',
      'Gestión de personal: contratación, planillas y desempeño',
      'Logística: compras, almacén y control de equipos',
      'Control documentario y archivo de la empresa',
      'Informes de gestión para el directorio y la comunidad',
      'Coordinación y comunicación interna',
    ],
    objective:
      'Te permitirá ordenar el día a día de la empresa comunal: personal, compras, documentos e informes, con una coordinación clara entre la gerencia, el directorio y la comunidad.',
    alt: 'Dirigentes y gerentes sentados a una mesa de reunión de trabajo',
  },
  {
    slug: 'negociacion-y-manejo-de-conflictos',
    name: 'Negociación y manejo de conflictos',
    summary:
      'Mesas de diálogo, negociación de tierras, convenios y seguimiento de compromisos entre comunidades, empresas y Estado.',
    topics: [
      'Análisis del conflicto y de los actores involucrados',
      'Preparación de la comunidad para una mesa de diálogo',
      'Técnicas de negociación basada en intereses',
      'Negociación de tierras, servidumbres y usufructos',
      'Redacción de convenios y actas de acuerdo',
      'Seguimiento y cumplimiento de compromisos',
    ],
    objective:
      'Aprenderás a preparar y conducir una negociación con empresas y autoridades, a dejar los acuerdos por escrito y a hacer seguimiento para que se cumplan, sin fracturar a la comunidad.',
    alt: 'Dirigentes y asesores revisando mapas y documentos en una mesa de trabajo',
  },
  {
    slug: 'gestion-de-proyectos-comunales',
    name: 'Gestión de proyectos conforme a los reglamentos comunales',
    summary:
      'Planificación, oficina técnica, costos, presupuestos y control de calidad de proyectos, de acuerdo con los reglamentos de la comunidad.',
    topics: [
      'Ciclo del proyecto y reglamentos comunales aplicables',
      'Planificación: alcance, cronograma y recursos',
      'Oficina técnica: metrados, valorizaciones e informes',
      'Costos y presupuestos de obra',
      'Control de calidad (QA/QC) e indicadores',
      'Cierre y transferencia del proyecto a la comunidad',
    ],
    objective:
      'Podrás planificar y controlar un proyecto de la comunidad o de su empresa de principio a fin: costos, plazos y calidad, respetando lo que mandan los reglamentos comunales.',
    alt: 'Ingenieros con casco y chaleco revisando planos en plena obra',
  },
  {
    slug: 'licitaciones-y-administracion-de-contratos',
    name: 'Licitaciones y administración de contratos',
    summary:
      'Términos de referencia, propuestas técnicas y económicas, valorizaciones y gestión contractual con empresas mineras, privadas y el Estado.',
    topics: [
      'Cómo leer bases y términos de referencia',
      'Propuesta técnica: experiencia, personal y metodología',
      'Propuesta económica y estructura de costos',
      'Firma del contrato y garantías',
      'Valorizaciones, adicionales y ampliaciones de plazo',
      'Cierre del contrato y conformidad del servicio',
    ],
    objective:
      'Te prepara para que la empresa comunal compita en licitaciones con propuestas sólidas y administre sus contratos sin perder dinero en valorizaciones, adicionales o penalidades.',
    alt: 'Asesor del ICGC exponiendo un cuadro de compromisos proyectado ante dirigentes',
  },
  {
    slug: 'planeamiento-financiero-y-control-de-gestion',
    name: 'Planeamiento financiero y control de gestión',
    summary:
      'Presupuestos, flujo de caja, indicadores y administración de los recursos de la comunidad y su empresa.',
    topics: [
      'Estados financieros básicos para dirigentes',
      'Elaboración del presupuesto anual',
      'Flujo de caja y capital de trabajo',
      'Indicadores de gestión y tablero de control',
      'Control presupuestal y toma de decisiones',
      'Rendición de cuentas de los recursos',
    ],
    objective:
      'Aprenderás a planificar el dinero de la comunidad o de su empresa, a anticipar faltas de caja y a medir resultados con indicadores para decidir con datos.',
    alt: 'Trabajadores con chaleco en una sala de capacitación frente a una presentación proyectada',
  },
  {
    slug: 'seguridad-salud-ocupacional-y-gestion-ambiental',
    name: 'Seguridad, salud ocupacional y gestión ambiental',
    summary:
      'Prevención de riesgos, controles operativos y obligaciones aplicables a minería y construcción para empresas comunales que prestan servicios.',
    topics: [
      'Normativa de seguridad y salud en el trabajo en minería y construcción',
      'Identificación de peligros y evaluación de riesgos (IPERC)',
      'Controles operativos y equipos de protección personal',
      'Reporte e investigación de incidentes',
      'Obligaciones ambientales de la empresa comunal',
      'Inspecciones, auditorías y mejora continua',
    ],
    objective:
      'Te ayudará a que la empresa comunal cumpla las exigencias de seguridad, salud y ambiente que piden las mineras y constructoras para contratar, y a prevenir accidentes en sus operaciones.',
    alt: 'Trabajador con traje de protección y casco junto a volquetes en una vía minera',
  },
];

/** Copia la foto a uploads/images (o la reemplaza si cambió) y la registra en Multimedia. */
async function registrarFoto(slug: string, alt: string, userId: string | null) {
  const origen = path.join(DATOS, `${slug}.webp`);
  const filename = `icgc-curso-${slug}.webp`;
  const destino = path.join(env.imagesDir, filename);
  fs.mkdirSync(env.imagesDir, { recursive: true });
  if (!fs.existsSync(destino) || fs.statSync(destino).size !== fs.statSync(origen).size) {
    fs.copyFileSync(origen, destino);
  }
  const { width, height } = await sharp(destino).metadata();
  const datos = {
    kind: 'IMAGE' as const,
    originalName: `${slug}.webp`,
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

  for (const [posicion, c] of CURSOS.entries()) {
    const foto = await registrarFoto(c.slug, c.alt, admin?.id ?? null);
    const datos = {
      ...COMUN,
      name: c.name,
      summary: c.summary,
      topics: c.topics,
      objective: c.objective,
      price: c.price ?? null,
      coverImageId: foto.id,
      coverAlt: c.alt,
      position: posicion + 1,
    };
    await prisma.course.upsert({ where: { slug: c.slug }, update: datos, create: { ...datos, slug: c.slug } });
    console.log(`   [ok] ${c.name}${c.price ? ` (S/ ${c.price})` : ''}`);
  }

  const anteriores = await prisma.course.updateMany({
    where: { slug: { notIn: CURSOS.map((c) => c.slug) }, isPublished: true },
    data: { isPublished: false },
  });
  console.log(`   [ok] Cursos anteriores ocultados: ${anteriores.count}`);

  revalidateWeb(['courses']);
  // Da tiempo a que salga el aviso a la web antes de cerrar
  await new Promise((r) => setTimeout(r, 1500));
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
