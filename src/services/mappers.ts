import { env } from '../config/env';
import type {
  HeroSlideDTO,
  CourseDTO,
  MediaDTO,
  PostBlockDTO,
  PostDTO,
  PostSummaryDTO,
  ProjectDTO,
  SiteSettingsDTO,
  ContactMessageDTO,
} from '../types/api';

/** URL pública absoluta de un archivo subido. */
export function mediaUrl(relativePath: string): string {
  return `${env.PUBLIC_API_URL.replace(/\/+$/, '')}/uploads/${relativePath}`;
}

type MediaRow = {
  id: string;
  kind: 'IMAGE' | 'VIDEO';
  filename: string;
  originalName: string;
  mimeType: string;
  sizeBytes: bigint | number;
  relativePath: string;
  width: number | null;
  height: number | null;
  durationSec: number | null;
  alt: string | null;
  caption: string | null;
  // Opcionales: una fila parcial (p. ej. un select viejo) sigue sirviendo
  author?: string | null;
  source?: string | null;
  sourceUrl?: string | null;
  createdAt: Date;
};

export function toMediaDTO(m: MediaRow | null | undefined): MediaDTO | null {
  if (!m) return null;
  return {
    id: m.id,
    kind: m.kind,
    filename: m.filename,
    originalName: m.originalName,
    mimeType: m.mimeType,
    sizeBytes: Number(m.sizeBytes),
    relativePath: m.relativePath,
    url: mediaUrl(m.relativePath),
    // Miniatura liviana para listados (solo imágenes)
    thumbUrl:
      m.kind === 'IMAGE'
        ? `${env.PUBLIC_API_URL.replace(/\/+$/, '')}/api/public/media/${m.id}/thumb`
        : null,
    width: m.width,
    height: m.height,
    durationSec: m.durationSec,
    alt: m.alt,
    caption: m.caption,
    author: m.author ?? null,
    source: m.source ?? null,
    sourceUrl: m.sourceUrl ?? null,
    createdAt: m.createdAt.toISOString(),
  };
}

/* eslint-disable @typescript-eslint/no-explicit-any */
// Los tipos generados por Prisma dependen del `include` de cada consulta;
// tiparlos exactamente aquí duplicaría el esquema sin aportar seguridad real.

export function toBlockDTO(b: any): PostBlockDTO {
  return {
    id: b.id,
    position: b.position,
    type: b.type,
    text: b.text ?? null,
    level: b.level ?? null,
    listStyle: b.listStyle ?? null,
    media: toMediaDTO(b.media),
    alt: b.alt ?? null,
    caption: b.caption ?? null,
    embedUrl: b.embedUrl ?? null,
  };
}

export function toPostSummaryDTO(p: any): PostSummaryDTO {
  return {
    id: p.id,
    slug: p.slug,
    title: p.title,
    subtitle: p.subtitle ?? null,
    excerpt: p.excerpt,
    status: p.status,
    publishedAt: p.publishedAt ? p.publishedAt.toISOString() : null,
    readingMinutes: p.readingMinutes,
    wordCount: p.wordCount,
    views: p.views,
    featured: p.featured,
    coverImage: toMediaDTO(p.coverImage),
    coverAlt: p.coverAlt ?? null,
    category: p.category ? { id: p.category.id, slug: p.category.slug, name: p.category.name } : null,
    tags: (p.tags ?? []).map((t: any) => ({ id: t.id, slug: t.slug, name: t.name })),
    author: p.author ? { id: p.author.id, name: p.author.name } : null,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

export function toPostDTO(p: any): PostDTO {
  return {
    ...toPostSummaryDTO(p),
    metaTitle: p.metaTitle ?? null,
    metaDescription: p.metaDescription ?? null,
    canonicalUrl: p.canonicalUrl ?? null,
    noindex: p.noindex,
    focusKeyword: p.focusKeyword ?? null,
    blocks: (p.blocks ?? []).map(toBlockDTO),
  };
}

/** Fotos del hero del inicio (tabla hero_slides) ya ordenadas por posición. */
export function toHeroSlideDTO(h: { id: string; position: number; alt: string; media: any }): HeroSlideDTO {
  return { id: h.id, position: h.position, alt: h.alt, media: toMediaDTO(h.media)! };
}

export function toSettingsDTO(s: any, heroSlides: Parameters<typeof toHeroSlideDTO>[0][] = []): SiteSettingsDTO {
  return {
    heroSlides: heroSlides.map(toHeroSlideDTO),
    siteName: s.siteName,
    tagline: s.tagline,
    defaultMetaDescription: s.defaultMetaDescription,
    siteUrl: s.siteUrl,
    logo: toMediaDTO(s.logo),
    logoAlt: s.logoAlt,
    ogImage: toMediaDTO(s.ogImage),
    email: s.email ?? null,
    phone: s.phone ?? null,
    whatsapp: s.whatsapp ?? null,
    address: s.address ?? null,
    city: s.city ?? null,
    country: s.country ?? null,
    facebookUrl: s.facebookUrl ?? null,
    instagramUrl: s.instagramUrl ?? null,
    youtubeUrl: s.youtubeUrl ?? null,
    linkedinUrl: s.linkedinUrl ?? null,
    tiktokUrl: s.tiktokUrl ?? null,
    googleAnalyticsId: s.googleAnalyticsId ?? null,
    googleSiteVerification: s.googleSiteVerification ?? null,
    clientSatisfaction: s.clientSatisfaction,
    yearsExperience: s.yearsExperience,
    projectsAdvised: s.projectsAdvised,
    regionsServed: s.regionsServed,
    leaderName: s.leaderName ?? null,
    leaderRole: s.leaderRole ?? null,
    leaderHeadline: s.leaderHeadline ?? null,
    leaderBio: s.leaderBio ?? null,
    leaderPhoto: toMediaDTO(s.leaderPhoto),
    leaderPhotoAlt: s.leaderPhotoAlt ?? null,
    leaderCareer: Array.isArray(s.leaderCareer) ? s.leaderCareer : [],
    leaderEducation: s.leaderEducation ?? [],
    updatedAt: s.updatedAt.toISOString(),
  };
}

/** `include` reutilizable para traer un post completo. */
export const postInclude = {
  coverImage: true,
  category: true,
  tags: true,
  author: { select: { id: true, name: true } },
  blocks: { include: { media: true }, orderBy: { position: 'asc' } },
} as const;

export const postSummaryInclude = {
  coverImage: true,
  category: true,
  tags: true,
  author: { select: { id: true, name: true } },
} as const;

export function toCourseDTO(c: any): CourseDTO {
  return {
    id: c.id,
    slug: c.slug,
    name: c.name,
    summary: c.summary,
    duration: c.duration,
    lectiveHours: c.lectiveHours,
    modality: c.modality,
    mode: c.mode,
    material: c.material,
    certificate: c.certificate,
    audience: c.audience,
    topics: c.topics ?? [],
    objective: c.objective ?? null,
    instructor: c.instructor ?? null,
    comingSoon: Boolean(c.comingSoon),
    // Prisma devuelve Decimal: al JSON va como número
    price: c.price == null ? null : Number(c.price),
    coverImage: toMediaDTO(c.coverImage),
    coverAlt: c.coverAlt ?? null,
    position: c.position,
    isPublished: c.isPublished,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

export function toProjectDTO(p: any): ProjectDTO {
  return {
    id: p.id,
    slug: p.slug,
    title: p.title,
    company: p.company ?? '',
    duration: p.duration,
    status: p.status,
    capital: p.capital,
    location: p.location,
    community: p.community,
    implementingEntity: p.implementingEntity,
    area: p.area,
    headline: p.headline ?? '',
    itemsTitle: p.itemsTitle ?? '',
    objective: p.objective,
    items: Array.isArray(p.items) ? p.items : [],
    achievements: p.achievements ?? [],
    communitiesBenefited: p.communitiesBenefited,
    region: p.region,
    latitude: p.latitude ?? null,
    longitude: p.longitude ?? null,
    coverImage: toMediaDTO(p.coverImage),
    coverAlt: p.coverAlt ?? null,
    position: p.position,
    isPublished: p.isPublished,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

export function toContactMessageDTO(m: any): ContactMessageDTO {
  return {
    id: m.id,
    firstName: m.firstName,
    lastName: m.lastName,
    email: m.email,
    phone: m.phone,
    message: m.message ?? null,
    readAt: m.readAt ? m.readAt.toISOString() : null,
    createdAt: m.createdAt.toISOString(),
  };
}
