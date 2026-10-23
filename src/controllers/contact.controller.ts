import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { toContactMessageDTO } from '../services/mappers';
import { asyncHandler, notFound } from '../utils/http';

const contactSchema = z.object({
  firstName: z.string().trim().min(2, 'Escribe tu nombre').max(80),
  lastName: z.string().trim().min(2, 'Escribe tus apellidos').max(120),
  email: z.string().trim().toLowerCase().email('El correo no es válido').max(160),
  // Solo dígitos, espacios, "+", guiones y paréntesis: 6 a 20 caracteres
  phone: z
    .string()
    .trim()
    .regex(/^[+\d][\d\s()-]{5,19}$/, 'El número de teléfono no es válido'),
  message: z.string().trim().max(2000).optional().transform((v) => v || null),
  // Trampa para bots: el campo está oculto en la web, una persona lo deja vacío
  website: z.string().optional(),
});

// ───────────────────────────── Público ─────────────────────────────

/** Guarda el mensaje del formulario de /nosotros. */
export const createContactMessage = asyncHandler(async (req, res) => {
  const { website, ...data } = contactSchema.parse(req.body);

  // Al bot se le responde igual que a una persona para que no reintente
  if (website) {
    res.status(201).json({ ok: true });
    return;
  }

  await prisma.contactMessage.create({ data });
  res.status(201).json({ ok: true });
});

// ───────────────────────────── Gestor ─────────────────────────────

export const listContactMessages = asyncHandler(async (_req, res) => {
  const rows = await prisma.contactMessage.findMany({ orderBy: { createdAt: 'desc' }, take: 500 });
  res.json(rows.map(toContactMessageDTO));
});

/** Marca como leído o no leído. */
export const markContactMessage = asyncHandler(async (req, res) => {
  const { read } = z.object({ read: z.boolean() }).parse(req.body);
  const id = req.params.id!;
  const actual = await prisma.contactMessage.findUnique({ where: { id } });
  if (!actual) throw notFound('El mensaje no existe');

  const row = await prisma.contactMessage.update({
    where: { id },
    data: { readAt: read ? (actual.readAt ?? new Date()) : null },
  });
  res.json(toContactMessageDTO(row));
});

export const deleteContactMessage = asyncHandler(async (req, res) => {
  const id = req.params.id!;
  const actual = await prisma.contactMessage.findUnique({ where: { id }, select: { id: true } });
  if (!actual) throw notFound('El mensaje no existe');

  await prisma.contactMessage.delete({ where: { id } });
  res.json({ ok: true });
});
