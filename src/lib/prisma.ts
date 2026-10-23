import { PrismaClient } from '@prisma/client';
import { env } from '../config/env';

// Una sola instancia. En dev, tsx recarga el módulo: la guardamos en globalThis
// para no abrir un pool de conexiones nuevo en cada recarga.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: env.isDev ? ['warn', 'error'] : ['error'],
  });

if (env.isDev) globalForPrisma.prisma = prisma;

/// Prisma devuelve BigInt para `sizeBytes` y JSON.stringify no lo soporta.
/// Lo serializamos como number (los tamaños de archivo caben de sobra).
export function serializeBigInt<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_key, v) => (typeof v === 'bigint' ? Number(v) : v)),
  ) as T;
}
