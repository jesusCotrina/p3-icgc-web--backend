import path from 'node:path';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import sharp from 'sharp';
import { env } from './config/env';
import { router } from './routes';
import { errorHandler, notFoundHandler } from './middleware/error';
import { prisma } from './lib/prisma';

// sharp mantiene abiertos los archivos que mide en su caché. En Windows eso
// los bloquea y no se pueden borrar (EBUSY) al eliminar una imagen.
sharp.cache({ files: 0 });

/**
 * ¿El origen está permitido? Acepta valores exactos y comodines con "*",
 * p. ej. https://mi-web*.vercel.app para cubrir las vistas previas de Vercel.
 */
function origenPermitido(origin: string): boolean {
  return env.corsOrigins.some((permitido) => {
    if (!permitido.includes('*')) return permitido === origin;
    const patron = permitido
      .split('*')
      .map((parte) => parte.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
      .join('[a-z0-9-]*');
    return new RegExp(`^${patron}$`, 'i').test(origin);
  });
}

const app = express();

// Detrás de Nginx/Traefik en producción: necesario para que el rate limit
// y req.ip vean la IP real del visitante.
app.set('trust proxy', 1);

app.use(
  helmet({
    // Las imágenes y videos se sirven a Next.js y al gestor desde otro origen
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: false,
  }),
);

app.use(
  cors({
    origin(origin, callback) {
      // Sin origin = Postman, curl o SSR de Next.js: se permite
      if (!origin || origenPermitido(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error(`Origen no permitido por CORS: ${origin}`));
    },
    credentials: true,
  }),
);

app.use(compression());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(morgan(env.isDev ? 'dev' : 'combined'));

/**
 * Archivos subidos. Caché larga porque el nombre en disco lleva hash:
 * si cambia el archivo, cambia la URL. Imágenes rápidas = mejor LCP = mejor SEO.
 */
app.use(
  '/uploads',
  express.static(env.uploadDir, {
    maxAge: env.isProd ? '30d' : 0,
    immutable: env.isProd,
    index: false,
    setHeaders(res) {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      // Habilita que el navegador pida rangos del video (seek sin descargar todo)
      res.setHeader('Accept-Ranges', 'bytes');
    },
  }),
);

app.use('/api', router);

app.get('/', (_req, res) => {
  res.json({
    name: 'ICGC API',
    description: 'API del Instituto de Capacitación en Gestión Comunal',
    docs: '/api/health',
  });
});

app.use(notFoundHandler);
app.use(errorHandler);

const server = app.listen(env.PORT, () => {
  const lines = [
    '',
    '  ╔══════════════════════════════════════════════╗',
    '  ║   ICGC — API                                 ║',
    '  ╚══════════════════════════════════════════════╝',
    `  Entorno   : ${env.NODE_ENV}`,
    `  URL       : http://localhost:${env.PORT}`,
    `  Uploads   : ${env.uploadDir}`,
    `  Sistema   : ${process.platform} (${process.arch})`,
    `  CORS      : ${env.corsOrigins.join(', ')}`,
    '',
  ];
  // eslint-disable-next-line no-console
  console.log(lines.join('\n'));
});

// Cierre ordenado: evita conexiones colgadas al reiniciar el contenedor
async function shutdown(signal: string) {
  // eslint-disable-next-line no-console
  console.log(`\n${signal} recibido, cerrando...`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

export { app };
