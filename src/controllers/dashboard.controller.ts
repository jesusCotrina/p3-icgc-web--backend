import { prisma } from '../lib/prisma';
import { getSystemStats, getUploadsSize } from '../services/system.service';
import { postSummaryInclude, toPostSummaryDTO } from '../services/mappers';
import { asyncHandler } from '../utils/http';
import type { DashboardStatsDTO } from '../types/api';

/**
 * Datos del home del gestor: cuántas publicaciones hay y cómo está el servidor
 * (CPU, RAM y disco). Las métricas del servidor salen de system.service, que
 * detecta si corre en Windows o Linux y usa la estrategia que corresponde.
 */
export const getDashboard = asyncHandler(async (_req, res) => {
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [
    totalPosts,
    published,
    drafts,
    archived,
    publishedThisMonth,
    viewsAgg,
    categories,
    tags,
    mediaCount,
    imagesCount,
    videosCount,
    uploadsSizeBytes,
    server,
    recent,
  ] = await Promise.all([
    prisma.post.count(),
    prisma.post.count({ where: { status: 'PUBLISHED' } }),
    prisma.post.count({ where: { status: 'DRAFT' } }),
    prisma.post.count({ where: { status: 'ARCHIVED' } }),
    prisma.post.count({ where: { status: 'PUBLISHED', publishedAt: { gte: startOfMonth } } }),
    prisma.post.aggregate({ _sum: { views: true } }),
    prisma.category.count(),
    prisma.tag.count(),
    prisma.media.count(),
    prisma.media.count({ where: { kind: 'IMAGE' } }),
    prisma.media.count({ where: { kind: 'VIDEO' } }),
    getUploadsSize(),
    getSystemStats(),
    prisma.post.findMany({
      include: postSummaryInclude,
      orderBy: { updatedAt: 'desc' },
      take: 5,
    }),
  ]);

  const payload: DashboardStatsDTO = {
    content: {
      totalPosts,
      published,
      drafts,
      archived,
      totalViews: viewsAgg._sum.views ?? 0,
      publishedThisMonth,
      categories,
      tags,
      mediaCount,
      imagesCount,
      videosCount,
      uploadsSizeBytes,
    },
    server: {
      os: {
        platform: server.os.platform,
        isWindows: server.os.isWindows,
        isLinux: server.os.isLinux,
        prettyName: server.os.prettyName,
        arch: server.os.arch,
        hostname: server.os.hostname,
        uptimeSec: server.os.uptimeSec,
      },
      cpu: server.cpu,
      memory: server.memory,
      disk: server.disk,
      runtime: server.runtime,
    },
    recentPosts: recent.map(toPostSummaryDTO),
  };

  res.json(payload);
});

/** Endpoint ligero para refrescar solo las métricas del servidor cada pocos segundos. */
export const getServerStats = asyncHandler(async (_req, res) => {
  const stats = await getSystemStats();
  res.json(stats);
});
