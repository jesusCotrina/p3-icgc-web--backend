import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { unauthorized } from '../utils/http';

export type JwtPayload = {
  sub: string;
  email: string;
  role: 'ADMIN';
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN } as jwt.SignOptions);
}

/** Exige un JWT válido. Todas las rutas del gestor pasan por aquí. */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;

  if (!header?.startsWith('Bearer ')) {
    next(unauthorized('Falta el token de acceso'));
    return;
  }

  const token = header.slice('Bearer '.length).trim();

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
    req.user = decoded;
    next();
  } catch (error) {
    const expired = error instanceof jwt.TokenExpiredError;
    next(unauthorized(expired ? 'La sesión expiró, vuelve a iniciar sesión' : 'Token inválido'));
  }
}

/** Solo hay un rol, pero dejamos el guard explícito por si se agregan más. */
export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (req.user?.role !== 'ADMIN') {
    next(unauthorized('Se requiere rol de administrador'));
    return;
  }
  next();
}
