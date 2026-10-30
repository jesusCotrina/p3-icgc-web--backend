import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { toCourseDTO } from '../services/mappers';
import { deleteMediaIfUnused } from '../services/media.service';
import { revalidateWeb } from '../services/revalidate.service';
import { asyncHandler, badRequest, notFound } from '../utils/http';
import { uniqueSlug } from '../utils/slug';

const include = { coverImage: true } as const;

/** Lista de textos libres (contenido del programa): se descartan los vacíos. */
const listaTextos = z
  .array(z.string().max(300))
  .max(30)
  .transform((items) => items.map((t) => t.trim()).filter(Boolean));

const courseSchema = z.object({
  name: z.string().trim().min(3, 'El nombre debe tener al menos 3 caracteres').max(150),
  slug: z.string().max(90).optional(),
  summary: z.string().trim().min(20, 'El resumen debe tener al menos 20 caracteres').max(600),
  duration: z.string().trim().min(1, 'Indica la duración').max(60),
  lectiveHours: z.coerce.number().int().min(1, 'Las horas lectivas deben ser mayores a 0').max(2000),
  modality: z.string().trim().min(1).max(80),
  mode: z.enum(['ONLINE', 'ONSITE', 'BLENDED']),
  material: z.string().trim().min(1).max(120),
  certificate: z.string().trim().min(1).max(120),
  audience: z.string().trim().min(3, 'Indica a quién va dirigido').max(300),
  topics: listaTextos.refine((t) => t.length > 0, 'Agrega al menos un tema al contenido del programa'),
  // Opcionales: si quedan vacíos, la ficha de /cursos no muestra ese bloque
  objective: z.string().trim().max(800).nullable().optional().transform((v) => v || null),
  instructor: z.string().trim().max(200).nullable().optional().transform((v) => v || null),
  /** Se anuncia en la web con el aviso "¡Próximamente!" */
  comingSoon: z.boolean().default(false),
  /** Precio en soles; vacío = la web muestra "Consultar" (p. ej. cursos que aún no abren) */
  price: z.preprocess(
    (v) => (v === '' || v === undefined ? null : v),
    z.coerce
      .number({ invalid_type_error: 'El precio debe ser un número' })
      .positive('El precio debe ser mayor que cero')
      .max(99999999)
      .nullable(),
  ),
  coverImageId: z.string().nullable().optional(),
  coverAlt: z.string().trim().max(300).nullable().optional(),
  position: z.coerce.number().int().min(0).default(0),
  isPublished: z.boolean().default(true),
});

/**
 * SEO: un curso publicado sin foto o sin alt deja una tarjeta rota y una
 * imagen sin describir para Google. Igual que en el blog, se exige antes de publicar.
 */
function exigirPortada(data: { isPublished?: boolean; coverImageId?: string | null; coverAlt?: string | null }) {
  if (!data.isPublished) return;
  if (!data.coverImageId) throw badRequest('Sube la foto del curso antes de publicarlo');
  if (!data.coverAlt?.trim()) throw badRequest('Describe la foto (texto alternativo) antes de publicar');
}

const slugLibre = (excluirId?: string) => async (s: string) => {
  const found = await prisma.course.findUnique({ where: { slug: s }, select: { id: true } });
  return Boolean(found && found.id !== excluirId);
};

// ───────────────────────────── Público ─────────────────────────────

export const listPublicCourses = asyncHandler(async (_req, res) => {
  const rows = await prisma.course.findMany({
    where: { isPublished: true },
    include,
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
  });
  res.json(rows.map(toCourseDTO));
});

/** Página propia del curso (/cursos/<slug>). 404 real si no existe o está oculto. */
export const getPublicCourse = asyncHandler(async (req, res) => {
  const row = await prisma.course.findFirst({
    where: { slug: req.params.slug!, isPublished: true },
    include,
  });
  if (!row) throw notFound('El curso no existe o no está publicado');
  res.json(toCourseDTO(row));
});

// ───────────────────────────── Gestor ─────────────────────────────

export const listCourses = asyncHandler(async (_req, res) => {
  const rows = await prisma.course.findMany({
    include,
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
  });
  res.json(rows.map(toCourseDTO));
});

export const getCourse = asyncHandler(async (req, res) => {
  const row = await prisma.course.findUnique({ where: { id: req.params.id! }, include });
  if (!row) throw notFound('El curso no existe');
  res.json(toCourseDTO(row));
});

export const createCourse = asyncHandler(async (req, res) => {
  const data = courseSchema.parse(req.body);
  exigirPortada(data);

  const slug = await uniqueSlug(data.slug || data.name, slugLibre());
  const row = await prisma.course.create({ data: { ...data, slug }, include });

  revalidateWeb(['courses']);
  res.status(201).json(toCourseDTO(row));
});

export const updateCourse = asyncHandler(async (req, res) => {
  const id = req.params.id!;
  const actual = await prisma.course.findUnique({ where: { id } });
  if (!actual) throw notFound('El curso no existe');

  const data = courseSchema.partial().parse(req.body);
  exigirPortada({ ...actual, ...data });

  const slug =
    data.slug !== undefined && data.slug !== actual.slug
      ? await uniqueSlug(data.slug || data.name || actual.name, slugLibre(id))
      : undefined;

  const row = await prisma.course.update({
    where: { id },
    data: { ...data, ...(slug ? { slug } : {}) },
    include,
  });

  // La foto anterior se borra del disco si ya no la usa nadie
  if (data.coverImageId !== undefined && actual.coverImageId !== row.coverImageId) {
    await deleteMediaIfUnused(actual.coverImageId);
  }

  revalidateWeb(['courses']);
  res.json(toCourseDTO(row));
});

export const deleteCourse = asyncHandler(async (req, res) => {
  const id = req.params.id!;
  const actual = await prisma.course.findUnique({ where: { id } });
  if (!actual) throw notFound('El curso no existe');

  await prisma.course.delete({ where: { id } });
  await deleteMediaIfUnused(actual.coverImageId);

  revalidateWeb(['courses']);
  res.json({ ok: true });
});
