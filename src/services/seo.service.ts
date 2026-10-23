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
    errors.push({ field: 'title', message: 'El título es obligatorio', level: 'error' });
  }
  if (!post.slug.trim()) {
    errors.push({ field: 'slug', message: 'El slug (URL) es obligatorio', level: 'error' });
  }
  if (!post.excerpt.trim()) {
    errors.push({
      field: 'excerpt',
      message: 'El resumen es obligatorio: es lo que se ve en el listado y al compartir en redes',
      level: 'error',
    });
  }

  const desc = (post.metaDescription ?? '').trim();
  if (!desc) {
    errors.push({
      field: 'metaDescription',
      message: 'La meta descripción es obligatoria: es el texto que Google muestra bajo el título',
      level: 'error',
    });
  } else if (desc.length < 50) {
    errors.push({
      field: 'metaDescription',
      message: `La meta descripción es demasiado corta (${desc.length} caracteres). Mínimo 50, ideal ${DESC_MIN}-${DESC_MAX}`,
      level: 'error',
    });
  }

  if (!post.coverImageId) {
    errors.push({
      field: 'coverImage',
      message: 'Falta la imagen de portada: sin ella el artículo se comparte sin miniatura',
      level: 'error',
    });
  } else if (!(post.coverAlt ?? '').trim()) {
    errors.push({
      field: 'coverAlt',
      message: 'La imagen de portada necesita texto alternativo (alt)',
      level: 'error',
    });
  }

  const imagesWithoutAlt = post.blocks.filter(
    (b) => b.type === 'IMAGE' && !(b.alt ?? '').trim(),
  ).length;
  if (imagesWithoutAlt > 0) {
    errors.push({
      field: 'blocks',
      message: `${imagesWithoutAlt} imagen(es) del contenido no tienen texto alternativo (alt)`,
      level: 'error',
    });
  }

  const emptyText = post.blocks.filter(
    (b) => ['PARAGRAPH', 'HEADING', 'QUOTE', 'LIST'].includes(b.type) && !(b.text ?? '').trim(),
  ).length;
  if (emptyText > 0) {
    errors.push({
      field: 'blocks',
      message: `Hay ${emptyText} bloque(s) de texto vacíos. Elimínalos o complétalos`,
      level: 'error',
    });
  }

  // ── Avisos ──
  const metaTitle = (post.metaTitle ?? post.title).trim();
  if (metaTitle.length > TITLE_MAX) {
    warnings.push({
      field: 'metaTitle',
      message: `El título SEO tiene ${metaTitle.length} caracteres; Google corta cerca de ${TITLE_MAX}`,
      level: 'warning',
    });
  }
  if (desc.length > DESC_MAX) {
    warnings.push({
      field: 'metaDescription',
      message: `La meta descripción tiene ${desc.length} caracteres; se recomienda no pasar de ${DESC_MAX}`,
      level: 'warning',
    });
  }

  if (post.wordCount < MIN_WORDS) {
    warnings.push({
      field: 'content',
      message: `El artículo tiene ${post.wordCount} palabras. Por debajo de ${MIN_WORDS} suele considerarse contenido superficial`,
      level: 'warning',
    });
  }

  const headings = post.blocks.filter((b) => b.type === 'HEADING');
  if (headings.length === 0) {
    warnings.push({
      field: 'blocks',
      message: 'El artículo no tiene subtítulos (H2). Dividir el texto ayuda a Google y al lector',
      level: 'warning',
    });
  }
  const badHeading = headings.find((h) => h.level !== 2 && h.level !== 3);
  if (badHeading) {
    warnings.push({
      field: 'blocks',
      message: 'Los subtítulos deben ser H2 o H3. El H1 está reservado para el título del artículo',
      level: 'warning',
    });
  }
  // Un H3 antes de cualquier H2 rompe la jerarquía
  const firstLevel = headings[0]?.level;
  if (firstLevel === 3) {
    warnings.push({
      field: 'blocks',
      message: 'El primer subtítulo es un H3: la jerarquía debería empezar en H2',
      level: 'warning',
    });
  }

  const keyword = (post.focusKeyword ?? '').trim().toLowerCase();
  if (!keyword) {
    warnings.push({
      field: 'focusKeyword',
      message: 'No definiste una palabra clave objetivo, así no podemos verificar su uso',
      level: 'warning',
    });
  } else {
    if (!post.title.toLowerCase().includes(keyword)) {
      warnings.push({
        field: 'title',
        message: `La palabra clave "${keyword}" no aparece en el título`,
        level: 'warning',
      });
    }
    if (!post.slug.toLowerCase().includes(keyword.replace(/\s+/g, '-'))) {
      warnings.push({
        field: 'slug',
        message: `La palabra clave "${keyword}" no aparece en la URL`,
        level: 'warning',
      });
    }
    if (!desc.toLowerCase().includes(keyword)) {
      warnings.push({
        field: 'metaDescription',
        message: `La palabra clave "${keyword}" no aparece en la meta descripción`,
        level: 'warning',
      });
    }
  }

  if (post.slug.length > 70) {
    warnings.push({
      field: 'slug',
      message: 'La URL es muy larga; las URLs cortas y descriptivas rinden mejor',
      level: 'warning',
    });
  }

  const videosWithoutCaption = post.blocks.filter(
    (b) => b.type === 'VIDEO' && !(b.caption ?? '').trim(),
  ).length;
  if (videosWithoutCaption > 0) {
    warnings.push({
      field: 'blocks',
      message: `${videosWithoutCaption} video(s) sin descripción. El texto que los acompaña es lo que Google puede leer`,
      level: 'warning',
    });
  }

  // 100 - 20 por error - 5 por aviso
  const score = Math.max(0, Math.min(100, 100 - errors.length * 20 - warnings.length * 5));

  return { score, canPublish: errors.length === 0, errors, warnings };
}
