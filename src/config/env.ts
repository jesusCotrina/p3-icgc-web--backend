import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

// Carga .env del backend y, si no existe, el de la raíz del monorepo
dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), '..', '.env') });

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL es obligatorio'),

  JWT_SECRET: z.string().min(16, 'JWT_SECRET debe tener al menos 16 caracteres'),
  JWT_EXPIRES_IN: z.string().default('7d'),

  ADMIN_EMAIL: z.string().email().default('admin@icgc.edu.pe'),
  ADMIN_PASSWORD: z.string().min(8).default('Admin123!'),
  ADMIN_NAME: z.string().default('Administrador ICGC'),

  CORS_ORIGINS: z.string().default('http://localhost:3000,http://localhost:5173'),

  UPLOAD_DIR: z.string().default('uploads'),
  MAX_IMAGE_SIZE_MB: z.coerce.number().positive().default(10),
  MAX_VIDEO_SIZE_MB: z.coerce.number().positive().default(500),
  PUBLIC_API_URL: z.string().default('http://localhost:4000'),

  /// Ruta cuyo espacio libre se reporta en el dashboard. Vacío = raíz del SO.
  DISK_PATH: z.string().optional(),

  /// Endpoint de la web que regenera páginas al publicar (vacío = desactivado)
  WEB_REVALIDATE_URL: z.string().url().optional().or(z.literal('')),
  /// Secreto compartido con frontend-web para ese endpoint
  REVALIDATE_SECRET: z.string().optional(),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('\n❌ Variables de entorno inválidas:\n');
  for (const issue of parsed.error.issues) {
    // eslint-disable-next-line no-console
    console.error(`   • ${issue.path.join('.')}: ${issue.message}`);
  }
  console.error('\nRevisa tu archivo .env (puedes copiar .env.example).\n');
  process.exit(1);
}

const raw = parsed.data;

// path.resolve normaliza separadores, así funciona igual en Windows y Linux
const uploadDir = path.resolve(process.cwd(), raw.UPLOAD_DIR);

export const env = {
  ...raw,
  isProd: raw.NODE_ENV === 'production',
  isDev: raw.NODE_ENV === 'development',
  corsOrigins: raw.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean),
  uploadDir,
  imagesDir: path.join(uploadDir, 'images'),
  videosDir: path.join(uploadDir, 'videos'),
  logoDir: path.join(uploadDir, 'logo'),
  maxImageBytes: raw.MAX_IMAGE_SIZE_MB * 1024 * 1024,
  maxVideoBytes: raw.MAX_VIDEO_SIZE_MB * 1024 * 1024,
} as const;

export type Env = typeof env;
