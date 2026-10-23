import type { NextFunction, Request, Response } from 'express';
import { MulterError } from 'multer';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { env } from '../config/env';
import { HttpError } from '../utils/http';

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: 'Not Found',
    message: `La ruta ${req.method} ${req.originalUrl} no existe`,
  });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  // Validación de entrada
  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'ValidationError',
      message: 'Los datos enviados no son válidos',
      details: err.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
    });
    return;
  }

  // Errores de subida de archivos
  if (err instanceof MulterError) {
    const message =
      err.code === 'LIMIT_FILE_SIZE'
        ? `El archivo supera el tamaño máximo permitido (imágenes ${env.MAX_IMAGE_SIZE_MB} MB, videos ${env.MAX_VIDEO_SIZE_MB} MB)`
        : `Error al subir el archivo: ${err.message}`;
    res.status(413).json({ error: 'UploadError', message, code: err.code });
    return;
  }

  // Errores conocidos de Prisma
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      const target = (err.meta?.target as string[] | undefined)?.join(', ') ?? 'campo';
      res.status(409).json({
        error: 'Conflict',
        message: `Ya existe un registro con ese ${target}`,
      });
      return;
    }
    if (err.code === 'P2025') {
      res.status(404).json({ error: 'NotFound', message: 'El registro no existe' });
      return;
    }
  }

  if (err instanceof HttpError) {
    res.status(err.status).json({
      error: err.name,
      message: err.message,
      ...(err.details ? { details: err.details } : {}),
    });
    return;
  }

  // eslint-disable-next-line no-console
  console.error('[error no controlado]', err);

  res.status(500).json({
    error: 'InternalServerError',
    message: 'Ocurrió un error inesperado en el servidor',
    ...(env.isDev && err instanceof Error ? { stack: err.stack } : {}),
  });
}
