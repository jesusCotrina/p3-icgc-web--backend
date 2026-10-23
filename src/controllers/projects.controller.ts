import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { toProjectDTO } from '../services/mappers';
import { deleteMediaIfUnused } from '../services/media.service';
import { revalidateWeb } from '../services/revalidate.service';
import { PERU_REGIONS } from '../types/api';
import { asyncHandler, badRequest, notFound } from '../utils/http';
import { uniqueSlug } from '../utils/slug';

const include = { coverImage: true } as const;
const REGION_IDS = PERU_REGIONS.map((r) => r.id) as [string, ...string[]];

const texto = (campo: string, max = 200) =>
  z.string().trim().min(1, `Completa: ${campo}`).max(max);

const projectSchema = z
  .object({
    title: z.string().trim().min(5, 'El título debe tener al menos 5 caracteres').max(200),
    slug: z.string().max(90).optional(),
    duration: texto('duración', 100),
    status: z.enum(['IN_PROGRESS', 'COMPLETED', 'IN_FORMULATION', 'STOPPED']),
    capital: texto('capital', 60),
    location: texto('ubicación'),
    community: texto('comunidad'),
    implementingEntity: texto('entidad implementadora'),
    area: texto('área que abarca', 120),
    objective: z.string().trim().min(20, 'El objetivo debe tener al menos 20 caracteres').max(800),
    achievements: z
      .array(z.string().max(300))
      .max(30)
      .transform((items) => items.map((t) => t.trim()).filter(Boolean)),
    communitiesBenefited: z.coerce.number().int().min(0).max(10000),
    region: z.enum(REGION_IDS, { errorMap: () => ({ message: 'Elige la región del proyecto' }) }),
    // Perú está entre las latitudes 0 y -19 y las longitudes -68 y -82
    latitude: z.number().min(-19).max(0.5).nullable().optional(),
    longitude: z.number().min(-82).max(-68).nullable().optional(),
    coverImageId: z.string().nullable().optional(),
    coverAlt: z.string().trim().max(300).nullable().optional(),
    position: z.coerce.number().int().min(0).default(0),
    isPublished: z.boolean().default(true),
  });

function validarPublicacion(data: {
  isPublished?: boolean;
  coverImageId?: string | null;
  coverAlt?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}) {
  // Las dos coordenadas van juntas o ninguna
  if ((data.latitude == null) !== (data.longitude == null)) {
    throw badRequest('Completa la latitud y la longitud, o deja ambas vacías');
  }
  if (!data.isPublished) return;
  if (!data.coverImageId) throw badRequest('Sube la foto del proyecto antes de publicarlo');
  if (!data.coverAlt?.trim()) throw badRequest('Describe la foto (texto alternativo) antes de publicar');
}

const slugLibre = (excluirId?: string) => async (s: string) => {
  const found = await prisma.project.findUnique({ where: { slug: s }, select: { id: true } });
  return Boolean(found && found.id !== excluirId);
};

// Las cifras del hero y el mapa salen de los proyectos: se revalidan juntos
const TAGS = ['projects'];

// ───────────────────────────── Público ─────────────────────────────

export const listPublicProjects = asyncHandler(async (_req, res) => {
  const rows = await prisma.project.findMany({
    where: { isPublished: true },
    include,
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
  });
  res.json(rows.map(toProjectDTO));
});

// ───────────────────────────── Gestor ─────────────────────────────

export const listProjects = asyncHandler(async (_req, res) => {
  const rows = await prisma.project.findMany({
    include,
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
  });
  res.json(rows.map(toProjectDTO));
});

export const getProject = asyncHandler(async (req, res) => {
  const row = await prisma.project.findUnique({ where: { id: req.params.id! }, include });
  if (!row) throw notFound('El proyecto no existe');
  res.json(toProjectDTO(row));
});

export const createProject = asyncHandler(async (req, res) => {
  const data = projectSchema.parse(req.body);
  validarPublicacion(data);

  const slug = await uniqueSlug(data.slug || data.title, slugLibre());
  const row = await prisma.project.create({ data: { ...data, slug }, include });

  revalidateWeb(TAGS);
  res.status(201).json(toProjectDTO(row));
});

export const updateProject = asyncHandler(async (req, res) => {
  const id = req.params.id!;
  const actual = await prisma.project.findUnique({ where: { id } });
  if (!actual) throw notFound('El proyecto no existe');

  const data = projectSchema.partial().parse(req.body);
  validarPublicacion({ ...actual, ...data });

  const slug =
    data.slug !== undefined && data.slug !== actual.slug
      ? await uniqueSlug(data.slug || data.title || actual.title, slugLibre(id))
      : undefined;

  const row = await prisma.project.update({
    where: { id },
    data: { ...data, ...(slug ? { slug } : {}) },
    include,
  });

  if (data.coverImageId !== undefined && actual.coverImageId !== row.coverImageId) {
    await deleteMediaIfUnused(actual.coverImageId);
  }

  revalidateWeb(TAGS);
  res.json(toProjectDTO(row));
});

export const deleteProject = asyncHandler(async (req, res) => {
  const id = req.params.id!;
  const actual = await prisma.project.findUnique({ where: { id } });
  if (!actual) throw notFound('El proyecto no existe');

  await prisma.project.delete({ where: { id } });
  await deleteMediaIfUnused(actual.coverImageId);

  revalidateWeb(TAGS);
  res.json({ ok: true });
});
