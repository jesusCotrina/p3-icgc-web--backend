/**
 * Actualiza el perfil del gerente general en Ajustes del sitio: resumen,
 * logros por trayectoria y formación especializada. No toca el nombre, el
 * cargo ni la foto (esos se cambian en el gestor). Se puede correr varias veces.
 *
 *   Local:      npm run cargar:lider
 *   Producción: docker compose -f docker-compose.prod.yml exec backend node dist/scripts/cargar-lider.js
 */
import { PrismaClient } from '@prisma/client';
import { revalidateWeb } from '../src/services/revalidate.service';

const prisma = new PrismaClient();

/** Título de la franja del líder en /nosotros. */
const TITULAR = 'Más de 12 años uniendo la ingeniería con la realidad comunal';

/**
 * Resumen en dos párrafos cortos. El primero es el que se muestra en el inicio.
 */
const RESUMEN = [
  'Ingeniero civil y magíster en Gerencia de Proyectos de Ingeniería, con más de 12 años liderando ' +
    'obras, operaciones y empresas en construcción y minería. Expresidente del directorio de una ' +
    'empresa comunal y comunero, une la experiencia técnica con el conocimiento directo de las ' +
    'comunidades y sus empresas.',
  'Asesora en negociación y licitación de proyectos, términos de referencia y presupuestos, ' +
    'gestión de conflictos sociales y mesas de diálogo, y capacita a dirigentes y equipos en ' +
    'gestión de empresas comunales.',
].join('\n\n');

/** Logros por trayectoria: el título va en "period" (así lo muestra la web). */
const TRAYECTORIA = [
  {
    period: 'Gerente de Operaciones y Proyectos',
    text: 'Dirigió operaciones y proyectos en empresas privadas y comunales de construcción y minería.',
  },
  {
    period: 'Residente y supervisor de obra',
    text: 'Condujo y supervisó la ejecución de obras, cuidando alcance, costos, plazos y calidad.',
  },
  {
    period: 'Presidente del directorio (dos periodos)',
    text: 'Lideró una empresa comunal y hoy es integrante de una comunidad campesina.',
  },
  {
    period: 'Negociación y licitaciones',
    text: 'Asesoría en negociación y licitación de proyectos, términos de referencia y presupuestos.',
  },
  {
    period: 'Conflictos sociales y diálogo',
    text: 'Gestión de conflictos sociales y participación en mesas de diálogo con empresas y Estado.',
  },
  {
    period: 'Docencia y capacitación',
    text: 'Capacitación de dirigentes, comuneros y equipos en gestión de empresas comunales.',
  },
];

const FORMACION = [
  'Gestión y Manejo de Conflictos Sociales — ESAN',
  'Derecho Minero y Derecho de la Construcción — Universidad Continental',
  'Reestructuración de Empresas y Evaluación de Gestión de Proyectos — UPC',
  'Planeamiento Financiero y Control de Gestión — USIL',
  'Gerencia en Diseño, Ejecución y Evaluación de Proyectos Sociales — UNI',
  'Administración de Proyectos y Contratos — IPAE Zegel',
  'Derecho (en curso) — Universidad Científica del Sur',
];

async function main() {
  const datos = {
    leaderHeadline: TITULAR,
    leaderBio: RESUMEN,
    leaderCareer: TRAYECTORIA,
    leaderEducation: FORMACION,
  };
  await prisma.siteSettings.upsert({
    where: { id: 'singleton' },
    update: datos,
    create: { id: 'singleton', ...datos },
  });
  console.log('   [ok] Perfil del gerente actualizado: resumen, trayectoria y formación');

  revalidateWeb(['settings']);
  // Da tiempo a que salga el aviso a la web antes de cerrar
  await new Promise((r) => setTimeout(r, 1500));
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
