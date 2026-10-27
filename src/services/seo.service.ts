import type { BlockType } from '@prisma/client';

export type SeoIssue = {
  field: string;
  message: string;
  /** `error` impide publicar; `warning` solo avisa en el editor. */
  level: 'error' | 'warning';
};

export type SeoAudit = {
  /** 0-100. El gestor lo muestra como semáforo. */
  score: number;
  canPublish: boolean;
  errors: SeoIssue[];
  warnings: SeoIssue[];
};

type AuditableBlock = {
  type: BlockType;
  text?: string | null;
  level?: number | null;
  alt?: string | null;
  caption?: string | null;
  mediaId?: string | null;
};

export type AuditablePost = {
  title: string;
  slug: string;
  excerpt: string;
  metaTitle?: string | null;
  metaDescription?: string | null;
  focusKeyword?: string | null;
  coverImageId?: string | null;
  coverAlt?: string | null;
  wordCount: number;
  blocks: AuditableBlock[];
};

const MIN_WORDS = 300;
const TITLE_MAX = 60;
const DESC_MIN = 120;
const DESC_MAX = 160;

/**
 * Reglas de SEO que todo artículo debe cumplir antes de salir a Google.
 * Los `error` bloquean la publicación: preferimos un borrador a una URL
 * indexada con metadata pobre, porque desindexar y recuperar ranking cuesta.
 */
export function auditPost(post: AuditablePost): SeoAudit {
  const errors: SeoIssue[] = [];
  const warnings: SeoIssue[] = [];

  // ── Bloqueantes ──
  if (!post.title.trim()) {
    errors.push({ field: 'title', message: 'Ponle un título al artículo', level: 'error' });
  }
  if (!post.slug.trim()) {
    errors.push({
      field: 'slug',
      message: 'Falta la dirección del artículo: escribe un título y se crea sola',
      level: 'error',
    });
  }
  if (!post.excerpt.trim()) {
    errors.push({
      field: 'excerpt',
      message: 'Escribe un resumen o el primer párrafo: es lo que la gente ve antes de abrir el artículo',
      level: 'error',
    });
  }

  // Sin descripción para Google, se usa el resumen (igual que hace la web)
  const desc = (post.metaDescription || post.excerpt || '').trim();
  if (!desc) {
    errors.push({
      field: 'metaDescription',
      message: 'Falta el texto que Google muestra debajo del título',
      level: 'error',
    });
  } else if (desc.length < 50) {
    errors.push({
      field: 'metaDescription',
      message: `El texto para Google es muy corto (${desc.length} letras). Escribe al menos 50; lo ideal es entre ${DESC_MIN} y ${DESC_MAX}`,
      level: 'error',
    });
  }

  if (!post.coverImageId) {
    errors.push({
      field: 'coverImage',
      message: 'Sube una imagen de portada: sin ella el artículo se ve vacío al compartirlo',
      level: 'error',
    });
  } else if (!(post.coverAlt ?? '').trim()) {
    errors.push({
      field: 'coverAlt',
      message: 'Describe en una frase qué se ve en la imagen de portada',
      level: 'error',
    });
  }

  const imagesWithoutAlt = post.blocks.filter(
    (b) => b.type === 'IMAGE' && !(b.alt ?? '').trim(),
  ).length;
  if (imagesWithoutAlt > 0) {
    errors.push({
      field: 'blocks',
      message: `Describe qué se ve en ${imagesWithoutAlt === 1 ? '1 imagen' : `${imagesWithoutAlt} imágenes`} del artículo`,
      level: 'error',
    });
  }

  const emptyText = post.blocks.filter(
    (b) => ['PARAGRAPH', 'HEADING', 'QUOTE', 'LIST'].includes(b.type) && !(b.text ?? '').trim(),
  ).length;
  if (emptyText > 0) {
    errors.push({
      field: 'blocks',
      message: `Hay ${emptyText === 1 ? '1 bloque vacío' : `${emptyText} bloques vacíos`}: escríbelos o bórralos`,
      level: 'error',
    });
  }

  // ── Avisos ──
  const metaTitle = (post.metaTitle ?? post.title).trim();
  if (metaTitle.length > TITLE_MAX) {
    warnings.push({
      field: 'metaTitle',
      message: `El título para Google es largo (${metaTitle.length} letras): Google corta cerca de ${TITLE_MAX}`,
      level: 'warning',
    });
  }
  if (desc.length > DESC_MAX) {
    warnings.push({
      field: 'metaDescription',
      message: `El texto para Google es largo (${desc.length} letras): Google corta cerca de ${DESC_MAX}`,
      level: 'warning',
    });
  }

  if (post.wordCount < MIN_WORDS) {
    warnings.push({
      field: 'content',
      message: `El artículo tiene ${post.wordCount} palabras. Con más de ${MIN_WORDS} Google lo valora más`,
      level: 'warning',
    });
  }

  const headings = post.blocks.filter((b) => b.type === 'HEADING');
  if (headings.length === 0) {
    warnings.push({
      field: 'blocks',
      message: 'Agrega algún subtítulo: separa el texto y se lee mejor',
      level: 'warning',
    });
  }
  const badHeading = headings.find((h) => h.level !== 2 && h.level !== 3);
  if (badHeading) {
    warnings.push({
      field: 'blocks',
      message: 'Usa solo subtítulos de tamaño grande o mediano',
      level: 'warning',
    });
  }
  // Un H3 antes de cualquier H2 rompe la jerarquía
  const firstLevel = headings[0]?.level;
  if (firstLevel === 3) {
    warnings.push({
      field: 'blocks',
      message: 'El primer subtítulo debería ser grande; los medianos van dentro de él',
      level: 'warning',
    });
  }

  const keyword = (post.focusKeyword ?? '').trim().toLowerCase();
  if (!keyword) {
    warnings.push({
      field: 'focusKeyword',
      message: 'Escribe cómo te buscaría la gente en Google (por ejemplo: gestión comunal)',
      level: 'warning',
    });
  } else {
    if (!post.title.toLowerCase().includes(keyword)) {
      warnings.push({
        field: 'title',
        message: `Usa "${keyword}" en el título`,
        level: 'warning',
      });
    }
    if (!post.slug.toLowerCase().includes(keyword.replace(/\s+/g, '-'))) {
      warnings.push({
        field: 'slug',
        message: `Usa "${keyword}" en el título para que también quede en la dirección`,
        level: 'warning',
      });
    }
    if (!desc.toLowerCase().includes(keyword)) {
      warnings.push({
        field: 'metaDescription',
        message: `Usa "${keyword}" en el texto para Google`,
        level: 'warning',
      });
    }
  }

  if (post.slug.length > 70) {
    warnings.push({
      field: 'slug',
      message: 'El título es muy largo y la dirección queda larga: intenta acortarlo',
      level: 'warning',
    });
  }

  const videosWithoutCaption = post.blocks.filter(
    (b) => b.type === 'VIDEO' && !(b.caption ?? '').trim(),
  ).length;
  if (videosWithoutCaption > 0) {
    warnings.push({
      field: 'blocks',
      message: `Agrega una descripción a ${videosWithoutCaption === 1 ? '1 video' : `${videosWithoutCaption} videos`}: Google no puede ver el video, solo leer el texto`,
      level: 'warning',
    });
  }

  // 100 - 20 por error - 5 por aviso
  const score = Math.max(0, Math.min(100, 100 - errors.length * 20 - warnings.length * 5));

  return { score, canPublish: errors.length === 0, errors, warnings };
}
