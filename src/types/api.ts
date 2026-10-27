/**
 * Contratos compartidos entre backend, frontend-web y frontend-gestor.
 * Si cambias algo aquí, cópialo a:
 *   frontend-web/src/lib/types.ts
 *   frontend-gestor/src/lib/types.ts
 */

export type Role = 'ADMIN';
export type MediaKind = 'IMAGE' | 'VIDEO';
export type PostStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
export type BlockType =
  | 'PARAGRAPH'
  | 'HEADING'
  | 'IMAGE'
  | 'VIDEO'
  | 'QUOTE'
  | 'LIST'
  | 'EMBED'
  | 'DIVIDER';

export interface MediaDTO {
  id: string;
  kind: MediaKind;
  filename: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  relativePath: string;
  /** URL absoluta servida por el backend: PUBLIC_API_URL + /uploads/... */
  url: string;
  /** Miniatura de 320 px (solo imágenes) */
  thumbUrl: string | null;
  width: number | null;
  height: number | null;
  durationSec: number | null;
  alt: string | null;
  caption: string | null;
  createdAt: string;
}

export interface PostBlockDTO {
  id: string;
  position: number;
  type: BlockType;
  text: string | null;
  level: number | null;
  listStyle: string | null;
  media: MediaDTO | null;
  alt: string | null;
  caption: string | null;
  embedUrl: string | null;
}

export interface PostSummaryDTO {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  excerpt: string;
  status: PostStatus;
  publishedAt: string | null;
  readingMinutes: number;
  wordCount: number;
  views: number;
  featured: boolean;
  coverImage: MediaDTO | null;
  coverAlt: string | null;
  category: { id: string; slug: string; name: string } | null;
  tags: { id: string; slug: string; name: string }[];
  author: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface PostDTO extends PostSummaryDTO {
  metaTitle: string | null;
  metaDescription: string | null;
  canonicalUrl: string | null;
  noindex: boolean;
  focusKeyword: string | null;
  blocks: PostBlockDTO[];
}

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface SiteSettingsDTO {
  siteName: string;
  tagline: string;
  defaultMetaDescription: string;
  siteUrl: string;
  logo: MediaDTO | null;
  logoAlt: string;
  ogImage: MediaDTO | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  facebookUrl: string | null;
  instagramUrl: string | null;
  youtubeUrl: string | null;
  linkedinUrl: string | null;
  tiktokUrl: string | null;
  googleAnalyticsId: string | null;
  googleSiteVerification: string | null;
  /** Cifras del hero: solo el numero, el "+" lo pone el frontend */
  yearsExperience: number;
  projectsAdvised: number;
  regionsServed: number;
  /** Franja del líder en /nosotros: sin nombre no se muestra */
  leaderName: string | null;
  leaderRole: string | null;
  leaderHeadline: string | null;
  leaderBio: string | null;
  leaderPhoto: MediaDTO | null;
  leaderPhotoAlt: string | null;
  leaderCareer: CareerItem[];
  updatedAt: string;
}

/** Un paso de la trayectoria del líder. */
export interface CareerItem {
  period: string;
  text: string;
}

/** Mensaje del formulario de contacto. */
export interface ContactMessageDTO {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  message: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface DashboardStatsDTO {
  content: {
    totalPosts: number;
    published: number;
    drafts: number;
    archived: number;
    totalViews: number;
    publishedThisMonth: number;
    categories: number;
    tags: number;
    mediaCount: number;
    imagesCount: number;
    videosCount: number;
    uploadsSizeBytes: number;
  };
  server: {
    os: {
      platform: string;
      isWindows: boolean;
      isLinux: boolean;
      prettyName: string;
      arch: string;
      hostname: string;
      uptimeSec: number;
    };
    cpu: {
      cores: number;
      model: string;
      speedMhz: number;
      usagePercent: number;
      loadAvg: [number, number, number] | null;
    };
    memory: {
      totalBytes: number;
      freeBytes: number;
      usedBytes: number;
      usedPercent: number;
    };
    disk: {
      path: string;
      totalBytes: number;
      freeBytes: number;
      usedBytes: number;
      usedPercent: number;
      source: string;
    };
    runtime: {
      node: string;
      pid: number;
      processUptimeSec: number;
      processMemoryBytes: number;
    };
  };
  recentPosts: PostSummaryDTO[];
}

export interface LoginResponseDTO {
  token: string;
  user: { id: string; email: string; name: string; role: Role };
}

// ─────────────────────────── Regiones del Perú ───────────────────────────

/**
 * Las 25 regiones (departamentos + Callao). El id es el que usa el mapa de la
 * web (frontend-web/src/lib/peru-mapa.ts): minúsculas, sin tildes, con guiones.
 */
export const PERU_REGIONS = [
  { id: 'amazonas', name: 'Amazonas' },
  { id: 'ancash', name: 'Áncash' },
  { id: 'apurimac', name: 'Apurímac' },
  { id: 'arequipa', name: 'Arequipa' },
  { id: 'ayacucho', name: 'Ayacucho' },
  { id: 'cajamarca', name: 'Cajamarca' },
  { id: 'callao', name: 'Callao' },
  { id: 'cusco', name: 'Cusco' },
  { id: 'huancavelica', name: 'Huancavelica' },
  { id: 'huanuco', name: 'Huánuco' },
  { id: 'ica', name: 'Ica' },
  { id: 'junin', name: 'Junín' },
  { id: 'la-libertad', name: 'La Libertad' },
  { id: 'lambayeque', name: 'Lambayeque' },
  { id: 'lima', name: 'Lima' },
  { id: 'loreto', name: 'Loreto' },
  { id: 'madre-de-dios', name: 'Madre de Dios' },
  { id: 'moquegua', name: 'Moquegua' },
  { id: 'pasco', name: 'Pasco' },
  { id: 'piura', name: 'Piura' },
  { id: 'puno', name: 'Puno' },
  { id: 'san-martin', name: 'San Martín' },
  { id: 'tacna', name: 'Tacna' },
  { id: 'tumbes', name: 'Tumbes' },
  { id: 'ucayali', name: 'Ucayali' },
] as const;

export type PeruRegionId = (typeof PERU_REGIONS)[number]['id'];

// ─────────────────────────── Cursos ───────────────────────────

export type CourseMode = 'ONLINE' | 'ONSITE' | 'BLENDED';

export interface CourseDTO {
  id: string;
  slug: string;
  name: string;
  summary: string;
  duration: string;
  lectiveHours: number;
  modality: string;
  mode: CourseMode;
  material: string;
  certificate: string;
  audience: string;
  topics: string[];
  /** "¿Para qué te sirve?" */
  objective: string | null;
  /** Dictado por */
  instructor: string | null;
  /** Aún no abre inscripciones: la web muestra "¡Próximamente!" */
  comingSoon: boolean;
  /** Precio en soles; null = no se muestra */
  price: number | null;
  coverImage: MediaDTO | null;
  coverAlt: string | null;
  position: number;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
}

// ─────────────────────────── Proyectos ───────────────────────────

export type ProjectStatus = 'IN_PROGRESS' | 'COMPLETED' | 'IN_FORMULATION' | 'STOPPED';

/** Cómo se lee cada estado en la web y en el gestor. */
export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  IN_PROGRESS: 'En ejecución',
  COMPLETED: 'Concluido',
  IN_FORMULATION: 'En formulación',
  STOPPED: 'Paralizado',
};

export interface ProjectDTO {
  id: string;
  slug: string;
  title: string;
  duration: string;
  status: ProjectStatus;
  capital: string;
  location: string;
  community: string;
  implementingEntity: string;
  area: string;
  objective: string;
  achievements: string[];
  communitiesBenefited: number;
  region: string;
  latitude: number | null;
  longitude: number | null;
  coverImage: MediaDTO | null;
  coverAlt: string | null;
  position: number;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
}
