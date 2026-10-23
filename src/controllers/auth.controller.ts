import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { signToken } from '../middleware/auth';
import { asyncHandler, unauthorized, badRequest, notFound } from '../utils/http';
import type { LoginResponseDTO } from '../types/api';

const loginSchema = z.object({
  email: z.string().email('Correo inválido'),
  password: z.string().min(1, 'La contraseña es obligatoria'),
});

export const login = asyncHandler(async (req, res) => {
  const { email, password } = loginSchema.parse(req.body);

  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });

  // Mismo mensaje para usuario inexistente y contraseña errada: no filtramos qué falló.
  const genericError = unauthorized('Correo o contraseña incorrectos');
  if (!user || !user.isActive) throw genericError;

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw genericError;

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  const token = signToken({ sub: user.id, email: user.email, role: 'ADMIN' });

  const body: LoginResponseDTO = {
    token,
    user: { id: user.id, email: user.email, name: user.name, role: 'ADMIN' },
  };
  res.json(body);
});

export const me = asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.sub },
    select: { id: true, email: true, name: true, role: true, lastLoginAt: true, createdAt: true },
  });
  if (!user) throw notFound('El usuario ya no existe');
  res.json(user);
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Ingresa tu contraseña actual'),
  newPassword: z
    .string()
    .min(8, 'La nueva contraseña debe tener al menos 8 caracteres')
    .regex(/[A-Za-z]/, 'Debe incluir al menos una letra')
    .regex(/[0-9]/, 'Debe incluir al menos un número'),
});

export const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);

  const user = await prisma.user.findUnique({ where: { id: req.user!.sub } });
  if (!user) throw notFound('El usuario ya no existe');

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) throw badRequest('La contraseña actual no es correcta');

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(newPassword, 12) },
  });

  res.json({ ok: true, message: 'Contraseña actualizada' });
});
