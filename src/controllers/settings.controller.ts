import sharp from 'sharp';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { toRelativePath } from '../middleware/upload';
import { toMediaDTO, toSettingsDTO } from '../services/mappers';
import { deleteMediaIfUnused } from '../services/media.service';
import { revalidateWeb } from '../services/revalidate.service';
import { asyncHandler, badRequest } from '../utils/http';

const SINGLETON_ID = 'singleton';

const settingsInclude = { logo: true, ogImage: true, leaderPhoto: true } as const;

/** Devuelve la fila única, creándola con los valores por defecto la primera vez. */
async function getOrCreateSettings() {
  const existing = await prisma.siteSettings.findUnique({
    where: { id: SINGLETON_ID },
    include: settingsInclude,
  });
  if (existing) return existing;

  return prisma.siteSettings.create({
    data: { id: SINGLETON_ID },
    include: settingsInclude,
  });
}

export const getSettings = asyncHandler(async (_req, res) => {
  const settings = await getOrCreateSettings();
  res.json(toSettingsDTO(settings));
});

const updateSchema = z.object({
  siteName: z.string().min(2).max(160).optional(),
  tagline: z.string().max(200).optional(),
  defaultMetaDescription: z
    .string()
    .max(320, 'La meta descripción no debería pasar de 320 caracteres')
    .optional(),
  siteUrl: z.string().url('La URL del sitio no es válida').optional(),
  logoAlt: z.string().max(200).optional(),
  ogImageMediaId: z.string().nullable().optional(),

  email: z.string().email().nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
  whatsapp: z.string().max(40).nullable().optional(),
  address: z.string().max(200).nullable().optional(),
  city: z.string().max(80).nullable().optional(),
  country: z.string().max(80).nullable().optional(),

  facebookUrl: z.string().url().nullable().optional().or(z.literal('')),
  instagramUrl: z.string().url().nullable().optional().or(z.literal('')),
  youtubeUrl: z.string().url().nullable().optional().or(z.literal('')),
  linkedinUrl: z.string().url().nullable().optional().or(z.literal('')),
  tiktokUrl: z.string().url().nullable().optional().or(z.literal('')),

  // Tag Manager (GTM-…) o Analytics (G-…): la web lo escribe dentro de un <script>
  googleAnalyticsId: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^(GTM|G|AW)-[A-Z0-9]{4,20}$/, 'El código de Google debe tener la forma GTM-XXXXXXX o G-XXXXXXXXXX')
    .nullable()
    .optional(),
  googleSiteVerification: z.string().max(200).nullable().optional(),

  // Cifras del hero. Enteros: el frontend se encarga del "+" y de animarlas.
  yearsExperience: z.coerce.number().int().min(0).max(200).optional(),
  projectsAdvised: z.coerce.number().int().min(0).max(100000).optional(),
  regionsServed: z.coerce.number().int().min(0).max(200).optional(),

  // Franja del líder en /nosotros
  leaderName: z.string().trim().max(120).nullable().optional(),
  leaderRole: z.string().trim().max(120).nullable().optional(),
  leaderHeadline: z.string().trim().max(160).nullable().optional(),
  leaderBio: z.string().trim().max(2000).nullable().optional(),
  leaderPhotoMediaId: z.string().nullable().optional(),
  leaderPhotoAlt: z.string().trim().max(300).nullable().optional(),
  leaderCareer: z
    .array(z.object({ period: z.string().trim().max(60), text: z.string().trim().max(400) }))
    .max(30)
    .transform((items) => items.filter((i) => i.period || i.text))
    .optional(),
  leaderEducation: z
    .array(z.string().max(200))
    .max(30)
    .transform((items) => items.map((t) => t.trim()).filter(Boolean))
    .optional(),
});

export const updateSettings = asyncHandler(async (req, res) => {
  const data = updateSchema.parse(req.body);
  const anterior = await getOrCreateSettings();

  // SEO: la foto del líder también necesita su texto alternativo
  const fotoLider = data.leaderPhotoMediaId !== undefined ? data.leaderPhotoMediaId : anterior.leaderPhotoMediaId;
  const altLider = data.leaderPhotoAlt !== undefined ? data.leaderPhotoAlt : anterior.leaderPhotoAlt;
  if (fotoLider && !altLider?.trim()) throw badRequest('Describe la foto del líder (texto alternativo)');

  // Los inputs vacíos del formulario llegan como "": los guardamos como null
  const normalized = Object.fromEntries(
    Object.entries(data).map(([key, value]) => [key, value === '' ? null : value]),
  );

  const settings = await prisma.siteSettings.update({
    where: { id: SINGLETON_ID },
    data: normalized,
    include: settingsInclude,
  });

  // La foto anterior del líder se borra del disco si ya no la usa nadie
  if (data.leaderPhotoMediaId !== undefined && anterior.leaderPhotoMediaId !== settings.leaderPhotoMediaId) {
    await deleteMediaIfUnused(anterior.leaderPhotoMediaId);
  }

  revalidateWeb(['settings']);
  res.json(toSettingsDTO(settings));
});

/**
 * Sube el logo de la empresa y lo deja activo en la web pública.
 * El archivo vive en el servidor (uploads/logo) y la referencia en la BD.
 */
export const uploadLogoHandler = asyncHandler(async (req, res) => {
  const file = req.file;
  if (!file) throw badRequest('No se recibió ninguna imagen');

  let width: number | null = null;
  let height: number | null = null;
  try {
    const meta = await sharp(file.path).metadata();
    width = meta.width ?? null;
    height = meta.height ?? null;
  } catch {
    // SVG: sharp no siempre da dimensiones, no es bloqueante
  }

  const alt =
    typeof req.body.alt === 'string' && req.body.alt.trim()
      ? req.body.alt.trim()
      : 'Logo del Instituto de Capacitación en Gestión Comunal';

  const media = await prisma.media.create({
    data: {
      kind: 'IMAGE',
      filename: file.filename,
      originalName: file.originalname,
      mimeType: file.mimetype,
      sizeBytes: BigInt(file.size),
      relativePath: toRelativePath(file.path),
      width,
      height,
      alt,
      uploadedById: req.user?.sub ?? null,
    },
  });

  await getOrCreateSettings();
  const settings = await prisma.siteSettings.update({
    where: { id: SINGLETON_ID },
    data: { logoMediaId: media.id, logoAlt: alt },
    include: settingsInclude,
  });

  revalidateWeb(['settings']);
  res.status(201).json({ logo: toMediaDTO(media), settings: toSettingsDTO(settings) });
});
