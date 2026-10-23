import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { postInclude, postSummaryInclude, toPostDTO, toPostSummaryDTO } from '../services/mappers';
import { auditPost } from '../services/seo.service';
import { asyncHandler, badRequest, notFound } from '../utils/http';
import { slugify, uniqueSlug } from '../utils/slug';
import { revalidateWeb } from '../services/revalidate.service';
import { countWords, readingMinutes } from '../utils/reading';

// ───────────────────────────── Esquemas ─────────────────────────────

const blockSchema = z
  .object({
    type: z.enum(['PARAGRAPH', 'HEADING', 'IMAGE', 'VIDEO', 'QUOTE', 'LIST', 'EMBED', 'DIVIDER']),
    text: z.string().max(20000).nullable().optional(),
    level: z.number().int().min(2).max(3).nullable().optional(),
    listStyle: z.enum(['bullet', 'number']).nullable().optional(),
    mediaId: z.string().nullable().optional(),
    alt: z.string().max(300).nullable().optional(),
    caption: z.string().max(500).nullable().optional(),
    embedUrl: z.string().url('La URL del video embebido no es válida').nullable().optional(),
  })
  .superRefine((block, ctx) => {
    if ((block.type === 'IMAGE' || block.type === 'VIDEO') && !block.mediaId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['mediaId'],
        message: `Un bloque de tipo ${block.type} necesita un archivo subido`,
      });
    }
    if (block.type === 'EMBED' && !block.embedUrl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['embedUrl'],
        message: 'Un bloque embebido necesita la URL del video',
      });
    }
  });

const basePostSchema = z.object({
  title: z.string().min(3, 'El título debe tener al menos 3 caracteres').max(200),
  subtitle: z.string().max(300).nullable().optional(),
  slug: z.string().max(90).optional(),
  excerpt: z.string().max(400).default(''),

  metaTitle: z.string().max(120).nullable().optional(),
  metaDescription: z.string().max(320).nullable().optional(),
  canonicalUrl: z.string().url().nullable().optional(),
  noindex: z.boolean().default(false),
  focusKeyword: z.string().max(100).nullable().optional(),

  coverImageId: z.string().nullable().optional(),
  coverAlt: z.string().max(300).nullable().optional(),

  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).default('DRAFT'),
  featured: z.boolean().default(false),

  categoryId: z.string().nullable().optional(),
  /** Nombres de etiquetas; se crean si no existen */
  tags: z.array(z.string().min(1).max(50)).max(10).default([]),

  blocks: z.array(blockSchema).max(300).default([]),
});

const createSchema = basePostSchema;
const updateSchema = basePostSchema.partial();

const listQuerySchema = z.object({
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED', 'ALL']).default('ALL'),
  q: z.string().max(120).optional(),
  categoryId: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.enum(['recent', 'oldest', 'views', 'title']).default('recent'),
});

// ───────────────────────────── Helpers ─────────────────────────────

function orderByFor(sort: string): Prisma.PostOrderByWithRelationInput {
  switch (sort) {
    case 'oldest':
      return { createdAt: 'asc' };
    case 'views':
      return { views: 'desc' };
    case 'title':
      return { title: 'asc' };
    default:
      return { updatedAt: 'desc' };
  }
}

/** Resumen automático a partir del primer párrafo, si el admin no escribió uno. */
function autoExcerpt(blocks: { type: string; text?: string | null }[]): string {
  const first = blocks.find((b) => b.type === 'PARAGRAPH' && (b.text ?? '').trim());
  const text = (first?.text ?? '').trim().replace(/\s+/g, ' ');
  if (!text) return '';
  return text.length <= 200 ? text : `${text.slice(0, 197).trimEnd()}...`;
}

/** Conecta/crea las etiquetas por nombre y devuelve el `set` para Prisma. */
async function resolveTags(names: string[]) {
  const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  const tags = await Promise.all(
    unique.map((name) => {
      const slug = slugify(name);
      return prisma.tag.upsert({
        where: { slug },
        update: { name },
        create: { slug, name },
      });
    }),
  );
  return tags.map((t) => ({ id: t.id }));
}

// ───────────────────────────── Handlers ─────────────────────────────

export const listPosts = asyncHandler(async (req, res) => {
  const { status, q, categoryId, page, pageSize, sort } = listQuerySchema.parse(req.query);

  const where: Prisma.PostWhereInput = {
    ...(status !== 'ALL' ? { status } : {}),
    ...(categoryId ? { categoryId } : {}),
    ...(q
      ? {
          OR: [
            { title: { contains: q, mode: 'insensitive' as const } },
            { excerpt: { contains: q, mode: 'insensitive' as const } },
            { slug: { contains: q, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.post.findMany({
      where,
      include: postSummaryInclude,
      orderBy: orderByFor(sort),
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

export const getPost = asyncHandler(async (req, res) => {
  const post = await prisma.post.findUnique({
    where: { id: req.params.id! },
    include: postInclude,
  });
  if (!post) throw notFound('El artículo no existe');

  const dto = toPostDTO(post);
  res.json({ ...dto, seo: auditPost({ ...post, blocks: post.blocks }) });
});

export const createPost = asyncHandler(async (req, res) => {
  const data = createSchema.parse(req.body);

  const slug = await uniqueSlug(data.slug || data.title, async (s) => {
    const found = await prisma.post.findUnique({ where: { slug: s }, select: { id: true } });
    return Boolean(found);
  });

  const excerpt = data.excerpt.trim() || autoExcerpt(data.blocks);
  const words = countWords(data.blocks, data.title, data.subtitle ?? '');

  // Publicar exige pasar la auditoría SEO. Un borrador puede estar incompleto.
  if (data.status === 'PUBLISHED') {
    const audit = auditPost({ ...data, slug, excerpt, wordCount: words });
    if (!audit.canPublish) {
      throw badRequest('El artículo no cumple los requisitos mínimos de SEO para publicarse', audit);
    }
  }

  const tags = await resolveTags(data.tags);

  const post = await prisma.post.create({
    data: {
      slug,
      title: data.title,
      subtitle: data.subtitle ?? null,
      excerpt,
      metaTitle: data.metaTitle ?? null,
      metaDescription: data.metaDescription ?? null,
      canonicalUrl: data.canonicalUrl ?? null,
      noindex: data.noindex,
      focusKeyword: data.focusKeyword ?? null,
      coverImageId: data.coverImageId ?? null,
      coverAlt: data.coverAlt ?? null,
      status: data.status,
      featured: data.featured,
      publishedAt: data.status === 'PUBLISHED' ? new Date() : null,
      wordCount: words,
      readingMinutes: readingMinutes(words),
      authorId: req.user?.sub ?? null,
      categoryId: data.categoryId ?? null,
      tags: { connect: tags },
      blocks: {
        create: data.blocks.map((b, index) => ({
          position: index,
          type: b.type,
          text: b.text ?? null,
          level: b.type === 'HEADING' ? (b.level ?? 2) : null,
          listStyle: b.listStyle ?? null,
          mediaId: b.mediaId ?? null,
          alt: b.alt ?? null,
          caption: b.caption ?? null,
          embedUrl: b.embedUrl ?? null,
        })),
      },
    },
    include: postInclude,
  });

  revalidateWeb(['posts', 'categories']);
  res.status(201).json(toPostDTO(post));
});

export const updatePost = asyncHandler(async (req, res) => {
  const id = req.params.id!;
  const data = updateSchema.parse(req.body);

  const existing = await prisma.post.findUnique({ where: { id }, include: postInclude });
  if (!existing) throw notFound('El artículo no existe');

  // Si cambia el slug manualmente, respetamos el valor pero garantizamos unicidad
  let slug = existing.slug;
  if (data.slug && slugify(data.slug) !== existing.slug) {
    slug = await uniqueSlug(data.slug, async (s) => {
      const found = await prisma.post.findFirst({
        where: { slug: s, NOT: { id } },
        select: { id: true },
      });
      return Boolean(found);
    });
  }

  const blocks = data.blocks ?? existing.blocks;
  const title = data.title ?? existing.title;
  const subtitle = data.subtitle !== undefined ? data.subtitle : existing.subtitle;
  const words = countWords(blocks, title, subtitle ?? '');
  const excerpt = (data.excerpt ?? existing.excerpt).trim() || autoExcerpt(blocks);
  const status = data.status ?? existing.status;

  if (status === 'PUBLISHED') {
    const audit = auditPost({
      title,
      slug,
      excerpt,
      metaTitle: data.metaTitle !== undefined ? data.metaTitle : existing.metaTitle,
      metaDescription:
        data.metaDescription !== undefined ? data.metaDescription : existing.metaDescription,
      focusKeyword: data.focusKeyword !== undefined ? data.focusKeyword : existing.focusKeyword,
      coverImageId: data.coverImageId !== undefined ? data.coverImageId : existing.coverImageId,
      coverAlt: data.coverAlt !== undefined ? data.coverAlt : existing.coverAlt,
      wordCount: words,
      blocks,
    });
    if (!audit.canPublish) {
      throw badRequest('El artículo no cumple los requisitos mínimos de SEO para publicarse', audit);
    }
  }

  const tags = data.tags ? await resolveTags(data.tags) : undefined;

  // Los bloques se reemplazan en bloque dentro de una transacción:
  // reordenar in-place chocaría con el índice único (postId, position).
  const post = await prisma.$transaction(async (tx) => {
    if (data.blocks) {
      await tx.postBlock.deleteMany({ where: { postId: id } });
    }

    return tx.post.update({
      where: { id },
      data: {
        slug,
        title,
        subtitle,
        excerpt,
        ...(data.metaTitle !== undefined ? { metaTitle: data.metaTitle } : {}),
        ...(data.metaDescription !== undefined ? { metaDescription: data.metaDescription } : {}),
        ...(data.canonicalUrl !== undefined ? { canonicalUrl: data.canonicalUrl } : {}),
        ...(data.noindex !== undefined ? { noindex: data.noindex } : {}),
        ...(data.focusKeyword !== undefined ? { focusKeyword: data.focusKeyword } : {}),
        ...(data.coverImageId !== undefined ? { coverImageId: data.coverImageId } : {}),
        ...(data.coverAlt !== undefined ? { coverAlt: data.coverAlt } : {}),
        ...(data.featured !== undefined ? { featured: data.featured } : {}),
        ...(data.categoryId !== undefined ? { categoryId: data.categoryId } : {}),
        status,
        // Solo fijamos publishedAt la primera vez: preservar la fecha original
        // evita que Google vea el artículo como contenido nuevo en cada edición.
        publishedAt:
          status === 'PUBLISHED' ? (existing.publishedAt ?? new Date()) : existing.publishedAt,
        wordCount: words,
        readingMinutes: readingMinutes(words),
        ...(tags ? { tags: { set: tags } } : {}),
        ...(data.blocks
          ? {
              blocks: {
                create: data.blocks.map((b, index) => ({
                  position: index,
                  type: b.type,
                  text: b.text ?? null,
                  level: b.type === 'HEADING' ? (b.level ?? 2) : null,
                  listStyle: b.listStyle ?? null,
                  mediaId: b.mediaId ?? null,
                  alt: b.alt ?? null,
                  caption: b.caption ?? null,
                  embedUrl: b.embedUrl ?? null,
                })),
              },
            }
          : {}),
      },
      include: postInclude,
    });
  });

  revalidateWeb(['posts', 'categories']);
  res.json(toPostDTO(post));
});

const statusSchema = z.object({
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']),
});

/** Atajo del listado: publicar / despublicar sin abrir el editor. */
export const changeStatus = asyncHandler(async (req, res) => {
  const id = req.params.id!;
  const { status } = statusSchema.parse(req.body);

  const existing = await prisma.post.findUnique({ where: { id }, include: postInclude });
  if (!existing) throw notFound('El artículo no existe');

  if (status === 'PUBLISHED') {
    const audit = auditPost({ ...existing, blocks: existing.blocks });
    if (!audit.canPublish) {
      throw badRequest('El artículo no cumple los requisitos mínimos de SEO para publicarse', audit);
    }
  }

  const post = await prisma.post.update({
    where: { id },
    data: {
      status,
      publishedAt: status === 'PUBLISHED' ? (existing.publishedAt ?? new Date()) : existing.publishedAt,
    },
    include: postInclude,
  });

  revalidateWeb(['posts', 'categories']);
  res.json(toPostDTO(post));
});

export const getPostSeo = asyncHandler(async (req, res) => {
  const post = await prisma.post.findUnique({
    where: { id: req.params.id! },
    include: { blocks: true },
  });
  if (!post) throw notFound('El artículo no existe');

  res.json(auditPost({ ...post, blocks: post.blocks }));
});

export const deletePost = asyncHandler(async (req, res) => {
  // Los bloques caen por onDelete: Cascade; los archivos subidos se conservan
  // porque pueden estar reutilizados en otro artículo.
  await prisma.post.delete({ where: { id: req.params.id! } });
  revalidateWeb(['posts', 'categories']);
  res.json({ ok: true, message: 'Artículo eliminado' });
});

// ───────────────────────── Categorías ─────────────────────────

export const listCategories = asyncHandler(async (_req, res) => {
  const rows = await prisma.category.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { posts: true } } },
  });
  res.json(
    rows.map((c) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      description: c.description,
      postCount: c._count.posts,
    })),
  );
});

const categorySchema = z.object({
  name: z.string().min(2).max(80),
  description: z.string().max(300).nullable().optional(),
  slug: z.string().max(80).optional(),
});

export const createCategory = asyncHandler(async (req, res) => {
  const data = categorySchema.parse(req.body);
  const slug = await uniqueSlug(data.slug || data.name, async (s) => {
    const found = await prisma.category.findUnique({ where: { slug: s }, select: { id: true } });
    return Boolean(found);
  });

  const category = await prisma.category.create({
    data: { slug, name: data.name, description: data.description ?? null },
  });
  revalidateWeb(['posts', 'categories']);
  res.status(201).json(category);
});

export const deleteCategory = asyncHandler(async (req, res) => {
  await prisma.category.delete({ where: { id: req.params.id! } });
  revalidateWeb(['posts', 'categories']);
  res.json({ ok: true, message: 'Categoría eliminada' });
});
