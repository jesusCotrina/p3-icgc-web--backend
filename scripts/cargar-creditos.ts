/**
 * Pone los créditos (autor, fuente y enlace) a las fotos subidas desde el gestor,
 * para que la web los muestre como pie de foto en el blog y en /creditos.
 *
 * 1. Fotos conocidas (por su nombre original): autor y enlace al archivo en
 *    Wikimedia Commons, verificados uno por uno.
 * 2. Para el resto, si el caption tiene la forma
 *    "Foto: Autor, CC BY-SA 4.0, (vía) Wikimedia Commons", se reparte en autor y fuente.
 *
 * No toca las fotos que ya tienen autor cargado (lo que se edite en el gestor manda).
 *
 *   Local:      npx tsx scripts/cargar-creditos.ts
 *   Producción: docker compose -f docker-compose.prod.yml exec backend node dist/scripts/cargar-creditos.js
 */
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { revalidateWeb } from '../src/services/revalidate.service';

const prisma = new PrismaClient();

const COMMONS = 'https://commons.wikimedia.org/wiki/';

type Conocida = {
  /** Nombre original del archivo sin extensión (como se subió al gestor) */
  original: string;
  author: string;
  licencia: string;
  /** Página del archivo en Wikimedia Commons (null si no se ubicó el original) */
  pagina: string | null;
};

const CONOCIDAS: Conocida[] = [
  { original: 'callalli', author: 'Tobias Deml', licencia: 'CC BY-SA 4.0', pagina: 'File:Callalli-peru-mountains-city-aerial-view.jpg' },
  { original: 'hualla-2015', author: 'Melchorin', licencia: 'CC BY-SA 4.0', pagina: 'File:Hualla_Comunidad_Campesina_2015.JPG' },
  { original: 'hualla', author: 'Melchorin', licencia: 'CC BY-SA 4.0', pagina: 'File:Comunidad_campesina_de_Hualla.jpg' },
  { original: 'tiquihua-iglesia', author: 'Johnattan Rupire', licencia: 'CC BY-SA 4.0', pagina: 'File:Iglesia_de_la_comunidad_campesina_de_Tiquihua.jpg' },
  { original: 'andes-pueblo', author: 'TeshTesh', licencia: 'CC BY-SA 4.0', pagina: 'File:Culture_%26_sights_in_the_Andes,_southeastern_Peru.jpg' },
  { original: 'pisac-valle', author: 'Draceane', licencia: 'CC BY-SA 4.0', pagina: 'File:Pisac,_vista_del_valle,_2023_(01).jpg' },
  { original: 'andenes', author: 'Yanela Sharumi Ccalluco Vargas', licencia: 'CC BY-SA 4.0', pagina: 'File:Andenes_Inkilltambo.jpg' },
  { original: 'canal-pisac', author: 'Alexey Komarov', licencia: 'CC BY-SA 4.0', pagina: 'File:Irrigation_canal_in_Pisac,_Peru_2019-10-16-1.jpg' },
  { original: 'linderaje-010', author: 'Urielcaballeroquispitupa', licencia: 'CC BY-SA 4.0', pagina: 'File:Linderaje_010.jpg' },
  { original: 'linderaje-009', author: 'Urielcaballeroquispitupa', licencia: 'CC BY-SA 4.0', pagina: 'File:Linderaje_009.jpg' },
];

/** "Foto: Autor, CC BY-SA 4.0, vía Wikimedia Commons" → { author, licencia } */
const CAPTION_COMMONS = /^Foto:\s*(.+?),\s*(CC[^,]*?)\s*,\s*(?:v[ií]a\s+)?Wikimedia Commons\.?$/i;

const sinExtension = (nombre: string) => path.parse(nombre).name.toLowerCase();

async function main() {
  const fotos = await prisma.media.findMany({
    where: { kind: 'IMAGE' },
    select: { id: true, originalName: true, caption: true, author: true },
  });

  let puestas = 0;
  for (const foto of fotos) {
    if (foto.author) continue; // ya tiene créditos: se respetan

    const conocida = CONOCIDAS.find((c) => c.original === sinExtension(foto.originalName));
    const desdeCaption = foto.caption?.match(CAPTION_COMMONS);

    let datos: { author: string; source: string; sourceUrl: string | null } | null = null;
    if (conocida) {
      datos = {
        author: conocida.author,
        source: `Wikimedia Commons, ${conocida.licencia}`,
        sourceUrl: conocida.pagina ? COMMONS + conocida.pagina : null,
      };
    } else if (desdeCaption) {
      datos = { author: desdeCaption[1]!.trim(), source: `Wikimedia Commons, ${desdeCaption[2]!.trim()}`, sourceUrl: null };
    }
    if (!datos) continue;

    await prisma.media.update({ where: { id: foto.id }, data: datos });
    puestas++;
    console.log(`   [ok] ${foto.originalName}: ${datos.author} · ${datos.source}${datos.sourceUrl ? ' · ' + datos.sourceUrl : ''}`);
  }

  console.log(`\n   ${puestas} foto(s) con créditos nuevos de ${fotos.length} imágenes.`);
  if (puestas > 0) {
    revalidateWeb(['posts', 'courses', 'projects']);
    await new Promise((r) => setTimeout(r, 1500));
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
