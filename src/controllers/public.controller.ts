import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import {
  mediaUrl,
  postInclude,
  postSummaryInclude,
  toPostDTO,
  toPostSummaryDTO,
  toSettingsDTO,
} from '../services/mappers';
import { asyncHandler, notFound } from '../utils/http';

/**
 * API que consume frontend-web. Solo expone contenido PUBLICADO.
 * Todo lo que sale de aquí se renderiza en el servidor de Next.js,
 * así Googlebot lo ve en el HTML inicial.
 */

// Función y no constante: la fecha tiene que ser la de cada consulta. Como
// constante se congelaba al arrancar el servidor y los posts publicados
// después no aparecían hasta reiniciarlo.
const publishedWhere = (): Prisma.PostWhereInput => ({
  status: 'PUBLISHED',
  publishedAt: { lte: new Date() },
});

const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(9),
  category: z.string().optional(),
  tag: z.string().optional(),
  q: z.string().max(120).optional(),
  featured: z.coerce.boolean().optional(),
});

export const listPublicPosts = asyncHandler(async (req, res) => {
  const { page, pageSize, category, tag, q, featured } = listQuery.parse(req.query);

  const where: Prisma.PostWhereInput = {
    ...publishedWhere(),
    ...(category ? { category: { slug: category } } : {}),
    ...(tag ? { tags: { some: { slug: tag } } } : {}),
    ...(featured ? { featured: true } : {}),
    ...(q
      ? {
          OR: [
            { title: { contains: q, mode: 'insensitive' as const } },
            { excerpt: { contains: q, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.post.findMany({
      where,
      include: postSummaryInclude,
      // Siempre del más reciente al más antiguo (los destacados se piden aparte)
      orderBy: { publishedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.post.count({ where }),
  ]);

  res.json({
    items: rows.map(toPostSummaryDTO),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  });
});

export const getPublicPost = asyncHandler(async (req, res) => {
  const slug = req.params.slug!;

  const post = await prisma.post.findFirst({
    where: { slug, ...publishedWhere() },
    include: postInclude,
  });
  if (!post) throw notFound('El artículo no existe o aún no está publicado');

  // Artículos relacionados: misma categoría, para enlazado interno (SEO)
  const related = await prisma.post.findMany({
    where: {
      ...publishedWhere(),
      NOT: { id: post.id },
      ...(post.categoryId ? { categoryId: post.categoryId } : {}),
    },
    include: postSummaryInclude,
    orderBy: { publishedAt: 'desc' },
    take: 3,
  });

  res.json({ post: toPostDTO(post), related: related.map(toPostSummaryDTO) });
});

/** Contador de visitas. Se llama desde el cliente para no romper el caché del SSR. */
export const incrementViews = asyncHandler(async (req, res) => {
  const slug = req.params.slug!;
  await prisma.post.updateMany({ where: { slug, status: 'PUBLISHED' }, data: { views: { increment: 1 } } });
  res.json({ ok: true });
});

export const listPublicCategories = asyncHandler(async (_req, res) => {
  const rows = await prisma.category.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { posts: { where: publishedWhere() } } } },
  });

  res.json(
    rows
      .filter((c) => c._count.posts > 0)
      .map((c) => ({
        id: c.id,
        slug: c.slug,
        name: c.name,
        description: c.description,
        postCount: c._count.posts,
      })),
  );
});

export const getPublicSettings = asyncHandler(async (_req, res) => {
  const heroSlides = await prisma.heroSlide.findMany({ include: { media: true }, orderBy: { position: 'asc' } });
  const settings = await prisma.siteSettings.findUnique({
    where: { id: 'singleton' },
    include: { logo: true, ogImage: true, leaderPhoto: true },
  });

  if (!settings) {
    const created = await prisma.siteSettings.create({
      data: { id: 'singleton' },
      include: { logo: true, ogImage: true, leaderPhoto: true },
    });
    res.json(toSettingsDTO(created, heroSlides));
    return;
  }

  res.json(toSettingsDTO(settings, heroSlides));
});

/**
 * Alimenta sitemap.xml de Next.js: slugs y fechas de todo lo indexable.
 * Excluimos los posts marcados con noindex para no pedirle a Google que
 * rastree URLs que luego le decimos que no indexe.
 */
export const getSitemapData = asyncHandler(async (_req, res) => {
  const [posts, categories] = await Promise.all([
    prisma.post.findMany({
      where: { ...publishedWhere(), noindex: false },
      select: {
        slug: true,
        updatedAt: true,
        publishedAt: true,
        coverImage: { select: { relativePath: true } },
      },
      orderBy: { publishedAt: 'desc' },
    }),
    // Solo categorías con artículos publicados: una categoría vacía es una
    // página sin contenido que no conviene ofrecerle a Google
    prisma.category.findMany({
      where: { posts: { some: publishedWhere() } },
      select: { slug: true },
      orderBy: { name: 'asc' },
    }),
  ]);

  res.json({
    posts: posts.map((p) => ({
      slug: p.slug,
      updatedAt: p.updatedAt.toISOString(),
      publishedAt: p.publishedAt?.toISOString() ?? null,
      // Para el sitemap de imágenes (Google Imágenes)
      image: p.coverImage ? mediaUrl(p.coverImage.relativePath) : null,
    })),
    categories: categories.map((c) => c.slug),
  });
});
