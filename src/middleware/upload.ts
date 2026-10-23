import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import multer from 'multer';
import type { Request } from 'express';
import { env } from '../config/env';
import { slugify } from '../utils/slug';
import { badRequest } from '../utils/http';

// Las carpetas deben existir antes de que multer escriba
for (const dir of [env.uploadDir, env.imagesDir, env.videosDir, env.logoDir]) {
  fs.mkdirSync(dir, { recursive: true });
}

const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif', 'image/svg+xml'];
const VIDEO_MIMES = ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime', 'video/x-matroska'];

/**
 * Nombre en disco: slug del original + timestamp + aleatorio.
 * Evita colisiones, no revela rutas y mantiene algo legible para auditar.
 */
function buildFilename(originalName: string): string {
  const ext = path.extname(originalName).toLowerCase();
  const base = slugify(path.basename(originalName, ext)).slice(0, 40) || 'archivo';
  const stamp = Date.now().toString(36);
  const rand = crypto.randomBytes(4).toString('hex');
  return `${base}-${stamp}-${rand}${ext}`;
}

function storageFor(dir: string) {
  return multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, dir),
    filename: (_req, file, cb) => cb(null, buildFilename(file.originalname)),
  });
}

function filterFor(allowed: string[], label: string) {
  return (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
      return;
    }
    cb(badRequest(`Tipo de archivo no permitido para ${label}: ${file.mimetype}`));
  };
}

/** Imágenes del blog y de portada. Límite: MAX_IMAGE_SIZE_MB (10 MB por defecto). */
export const uploadImage = multer({
  storage: storageFor(env.imagesDir),
  limits: { fileSize: env.maxImageBytes, files: 1 },
  fileFilter: filterFor(IMAGE_MIMES, 'imágenes'),
});

/** Videos del blog. Límite: MAX_VIDEO_SIZE_MB (500 MB por defecto). */
export const uploadVideo = multer({
  storage: storageFor(env.videosDir),
  limits: { fileSize: env.maxVideoBytes, files: 1 },
  fileFilter: filterFor(VIDEO_MIMES, 'videos'),
});

/** Logo de la empresa: va a su propia carpeta para ubicarlo fácil en el servidor. */
export const uploadLogo = multer({
  storage: storageFor(env.logoDir),
  limits: { fileSize: env.maxImageBytes, files: 1 },
  fileFilter: filterFor(IMAGE_MIMES, 'el logo'),
});

/** Ruta relativa con "/" siempre, para que la URL sea válida también en Windows. */
export function toRelativePath(absolutePath: string): string {
  return path.relative(env.uploadDir, absolutePath).split(path.sep).join('/');
}

/**
 * Borra el archivo del disco sin reventar si ya no existe.
 *
 * En Windows un archivo recién leído puede seguir bloqueado unos instantes
 * (EBUSY/EPERM): `rm` reintenta, y si aun así falla se registra y se sigue,
 * porque la fila ya se borró y un archivo suelto no debe tumbar la petición.
 */
export async function removeFile(relativePath: string): Promise<void> {
  const target = path.join(env.uploadDir, ...relativePath.split('/'));
  // Defensa contra path traversal en el nombre guardado
  if (!target.startsWith(env.uploadDir)) return;
  try {
    await fs.promises.rm(target, { force: true, maxRetries: 5, retryDelay: 200 });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[uploads] No se pudo borrar ${relativePath}:`, (err as Error).message);
  }
}
