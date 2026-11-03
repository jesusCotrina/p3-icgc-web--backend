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
  comingSoon: true,
  isPublished: true,
};

type Curso = {
  slug: string;
  name: string;
  summary: string;
  topics: string[];
  /** Qué aprenderá el alumno, un aprendizaje por línea */
  objective: string[];
  /** A quién va dirigido, un público por línea */
  audience: string[];
  /** Archivo en scripts/datos/cursos (sin .webp). Nombre nuevo = foto nueva: evita caché */
  foto: string;
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
    objective: [
      'Aplicar la Ley General de Comunidades Campesinas y su reglamento en la gestión diaria',
      'Elaborar y actualizar el estatuto y los reglamentos internos de la comunidad',
      'Convocar y conducir asambleas válidas, con quórum y acuerdos bien registrados',
      'Distinguir las funciones y los límites de la asamblea, la junta directiva y los comités',
      'Rendir cuentas con transparencia y tomar decisiones con respaldo de los comuneros',
    ],
    audience: [
      'Presidentes, directivos y miembros de la junta directiva comunal',
      'Integrantes de comités especializados y fiscales de la comunidad',
      'Comuneros y comuneras empadronados que participan en la asamblea',
      'Nuevos dirigentes que asumen el cargo por primera vez',
      'Profesionales y técnicos que asesoran a comunidades campesinas',
      'Funcionarios públicos y de empresas que se relacionan con comunidades',
    ],
    foto: 'asamblea-comunal-gestion',
    alt: 'Asamblea comunal en un salón de la sierra: dos facilitadores muestran un documento y los comuneros levantan la mano para votar',
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
    objective: [
      'Elegir el tipo de empresa comunal que mejor se adapta a tu comunidad',
      'Cumplir los requisitos y trámites de constitución, en el orden correcto',
      'Redactar el estatuto y definir la estructura de gobierno de la empresa',
      'Organizar la administración desde el primer día para poder contratar y crecer',
      'Identificar oportunidades de negocio con empresas privadas y el Estado',
    ],
    audience: [
      'Directivos comunales que impulsan la creación de una empresa comunal',
      'Comuneros y comuneras interesados en emprender desde la comunidad',
      'Gerentes y administradores designados para la nueva empresa',
      'Contadores, abogados y asesores de comunidades campesinas',
      'Organizaciones y programas que promueven el desarrollo económico comunal',
    ],
    foto: 'organizando-empresa-comunal',
    alt: 'Asesora y tres comuneros revisan en una mesa el organigrama de su empresa comunal, con una laptop y carpetas',
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
    objective: [
      'Organizar el personal: contratos, planillas, horarios y evaluación',
      'Manejar compras, almacén y logística con control de costos',
      'Llevar el control documentario y los informes a la comunidad',
      'Coordinar con claridad entre la gerencia, el directorio y la asamblea',
      'Cumplir las obligaciones laborales, tributarias y legales de la empresa',
    ],
    audience: [
      'Gerentes y administradores de empresas comunales',
      'Miembros del directorio y de la junta de vigilancia',
      'Responsables de personal, logística y administración',
      'Asistentes administrativos y de oficina técnica',
      'Dirigentes comunales que supervisan a la empresa',
    ],
    foto: 'equipo-coordinando-empresa-comunal',
    alt: 'Equipo de una empresa comunal trabajando en su oficina: dos personas frente a una laptop y otras revisando archivadores y documentos',
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
    objective: [
      'Preparar una negociación: información, objetivos, equipo y estrategia',
      'Conducir mesas de diálogo y negociar tierras, servidumbres y convenios',
      'Redactar acuerdos claros y hacer seguimiento al cumplimiento de los compromisos',
      'Prevenir y manejar conflictos sin fracturar a la comunidad',
      'Conocer el marco legal de la consulta, los derechos colectivos y el ambiente',
    ],
    audience: [
      'Presidentes y directivos comunales que negocian con empresas y el Estado',
      'Integrantes de comisiones negociadoras y mesas de diálogo',
      'Gerentes de empresas comunales que firman convenios y contratos',
      'Profesionales de relaciones comunitarias de empresas mineras y constructoras',
      'Funcionarios públicos que participan en procesos de diálogo',
    ],
    foto: 'dialogo-comunitario-tierras',
    alt: 'Mesa de diálogo entre comuneros con sombrero y representantes de una empresa, con un mapa de tierras sobre la mesa',
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
    objective: [
      'Planificar un proyecto de principio a fin: alcance, cronograma y responsables',
      'Elaborar y revisar expedientes técnicos, costos y presupuestos',
      'Organizar la oficina técnica y controlar avance, calidad y plazos',
      'Cumplir los reglamentos de la comunidad en cada etapa del proyecto',
      'Informar a la asamblea con reportes claros y sustentados',
    ],
    audience: [
      'Directivos comunales y comités de obras y proyectos',
      'Gerentes y jefes de proyecto de empresas comunales',
      'Residentes, supervisores y personal de oficina técnica',
      'Ingenieros, técnicos y profesionales que trabajan con comunidades',
      'Responsables de proyectos financiados con fondos comunales, mineros o públicos',
    ],
    foto: 'planificacion-comunitaria-agua-rural',
    alt: 'Cuatro personas con casco y chaleco revisan planos sobre una mesa en la obra de un reservorio de agua en la sierra',
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
    objective: [
      'Interpretar términos de referencia, bases y alcances de trabajo',
      'Preparar propuestas técnicas y económicas competitivas',
      'Administrar el contrato: valorizaciones, adicionales, ampliaciones y penalidades',
      'Cumplir los requisitos de homologación y documentación que exigen las empresas',
      'Cerrar contratos sin pérdidas y cuidando la relación comercial',
    ],
    audience: [
      'Gerentes y responsables comerciales de empresas comunales',
      'Personal de oficina técnica que prepara propuestas y valorizaciones',
      'Directivos comunales que aprueban contratos y convenios',
      'Administradores de contratos con empresas mineras, privadas y el Estado',
      'Profesionales y asesores de empresas comunales',
    ],
    foto: 'preparando-licitacion-en-equipo',
    alt: 'Asesora señala documentos de una licitación mientras cuatro dirigentes comunales revisan carpetas y una laptop',
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
    objective: [
      'Elaborar el presupuesto anual de la comunidad o de su empresa',
      'Proyectar el flujo de caja y anticipar los meses de falta de dinero',
      'Definir indicadores y tableros de control para medir resultados',
      'Administrar los fondos comunales con registros claros y auditables',
      'Presentar informes financieros entendibles para la asamblea',
    ],
    audience: [
      'Tesoreros, presidentes y directivos de comunidades campesinas',
      'Gerentes, administradores y contadores de empresas comunales',
      'Miembros del directorio y de la junta de vigilancia',
      'Comités que administran fondos comunales y aportes de empresas',
      'Asesores y profesionales de apoyo a comunidades',
    ],
    foto: 'planificacion-financiera-comunidad',
    alt: 'Asesora muestra en una laptop gráficos financieros a una pareja de comuneros, con calculadora y reportes sobre la mesa',
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
    objective: [
      'Identificar peligros, evaluar riesgos y aplicar controles operativos',
      'Cumplir las obligaciones de seguridad y salud que exigen mineras y constructoras',
      'Implementar el plan de manejo ambiental y responder ante incidentes',
      'Preparar a la empresa para auditorías, homologaciones e inspecciones',
      'Promover una cultura de prevención entre los trabajadores',
    ],
    audience: [
      'Gerentes y supervisores de empresas comunales que prestan servicios a minería y construcción',
      'Responsables de seguridad, salud ocupacional y medio ambiente',
      'Jefes de cuadrilla, capataces y trabajadores de campo',
      'Directivos comunales que supervisan operaciones en su territorio',
      'Profesionales que preparan a la empresa para homologaciones y auditorías',
    ],
    foto: 'capacitacion-seguridad-muestreo-ambiental',
    alt: 'Capacitación en campo junto a un río: un instructor con casco y guantes enseña a tomar muestras de agua a seis trabajadores con chalecos',
  },
];

/** Copia la foto a uploads/images (o la reemplaza si cambió) y la registra en Multimedia. */
async function registrarFoto(foto: string, alt: string, userId: string | null) {
  const origen = path.join(DATOS, `${foto}.webp`);
  const filename = `icgc-curso-${foto}.webp`;
  const destino = path.join(env.imagesDir, filename);
  fs.mkdirSync(env.imagesDir, { recursive: true });
  if (!fs.existsSync(destino) || fs.statSync(destino).size !== fs.statSync(origen).size) {
    fs.copyFileSync(origen, destino);
  }
  const { width, height } = await sharp(destino).metadata();
  const datos = {
    kind: 'IMAGE' as const,
    originalName: `${foto}.webp`,
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
    const foto = await registrarFoto(c.foto, c.alt, admin?.id ?? null);
    const datos = {
      ...COMUN,
      name: c.name,
      summary: c.summary,
      topics: c.topics,
      objective: c.objective.join('\n'),
      audience: c.audience.join('\n'),
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
