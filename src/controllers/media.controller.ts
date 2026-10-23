import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { removeFile, toRelativePath } from '../middleware/upload';
import { toMediaDTO } from '../services/mappers';
import { asyncHandler, badRequest, notFound } from '../utils/http';

/** Lee ancho/alto de una imagen. Necesario para que <Image> no cause CLS (Core Web Vitals). */
async function readImageSize(absPath: string): Promise<{ width: number | null; height: number | null }> {
  try {
    const meta = await sharp(absPath).metadata();
    return { width: meta.width ?? null, height: meta.height ?? null };
  } catch {
    // SVG u otro formato que sharp no mide: no es un error fatal
    return { width: null, height: null };
  }
}

export const uploadImageHandler = asyncHandler(async (req, res) => {
  const file = req.file;
  if (!file) throw badRequest('No se recibió ningún archivo');

  const { width, height } = await readImageSize(file.path);
  const alt = typeof req.body.alt === 'string' ? req.body.alt.trim() : '';
  const caption = typeof req.body.caption === 'string' ? req.body.caption.trim() : '';

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
      alt: alt || null,
      caption: caption || null,
      uploadedById: req.user?.sub ?? null,
    },
  });

  res.status(201).json(toMediaDTO(media));
});

export const uploadVideoHandler = asyncHandler(async (req, res) => {
  const file = req.file;
  if (!file) throw badRequest('No se recibió ningún archivo');

  const caption = typeof req.body.caption === 'string' ? req.body.caption.trim() : '';

  const media = await prisma.media.create({
    data: {
      kind: 'VIDEO',
      filename: file.filename,
      originalName: file.originalname,
      mimeType: file.mimetype,
      sizeBytes: BigInt(file.size),
      relativePath: toRelativePath(file.path),
      caption: caption || null,
      uploadedById: req.user?.sub ?? null,
    },
  });

  res.status(201).json(toMediaDTO(media));
});

const listQuery = z.object({
  kind: z.enum(['IMAGE', 'VIDEO']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(24),
});

export const listMedia = asyncHandler(async (req, res) => {
  const { kind, page, pageSize } = listQuery.parse(req.query);
  const where = kind ? { kind } : {};

  const [rows, total] = await Promise.all([
    prisma.media.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.media.count({ where }),
  ]);

  res.json({
    items: rows.map(toMediaDTO),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  });
});

const updateMediaSchema = z.object({
  alt: z.string().max(300).nullable().optional(),
  caption: z.string().max(500).nullable().optional(),
});

export const updateMedia = asyncHandler(async (req, res) => {
  const data = updateMediaSchema.parse(req.body);
  const media = await prisma.media.update({ where: { id: req.params.id! }, data });
  res.json(toMediaDTO(media));
});

export const deleteMedia = asyncHandler(async (req, res) => {
  const id = req.params.id!;
  const media = await prisma.media.findUnique({ where: { id } });
  if (!media) throw notFound('El archivo no existe');

  // Primero la fila (las relaciones quedan en SetNull), luego el archivo físico
  await prisma.media.delete({ where: { id } });
  await removeFile(media.relativePath);

  res.json({ ok: true, message: 'Archivo eliminado' });
});

/** Diagnóstico: detecta filas cuyo archivo ya no está en disco. */
export const checkOrphans = asyncHandler(async (_req, res) => {
  const all = await prisma.media.findMany({ select: { id: true, relativePath: true } });
  const { env } = await import('../config/env');

  const missing: string[] = [];
  for (const m of all) {
    const abs = path.join(env.uploadDir, ...m.relativePath.split('/'));
    try {
      await fs.access(abs);
    } catch {
      missing.push(m.id);
    }
  }

  res.json({ total: all.length, missingOnDisk: missing.length, ids: missing });
});
