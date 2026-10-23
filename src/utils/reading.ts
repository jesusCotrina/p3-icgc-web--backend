import type { BlockType } from '@prisma/client';

const WORDS_PER_MINUTE = 200;

type CountableBlock = { type: BlockType; text?: string | null; caption?: string | null };

/**
 * SEO: Google favorece contenido con sustancia. Calculamos palabras y minutos
 * de lectura para mostrarlos en la web y alimentar el schema `BlogPosting`.
 */
export function countWords(blocks: CountableBlock[], title = '', subtitle = ''): number {
  const text = [
    title,
    subtitle,
    ...blocks.map((b) => `${b.text ?? ''} ${b.caption ?? ''}`),
  ].join(' ');
  return text.split(/\s+/).filter((w) => w.length > 0).length;
}

export function readingMinutes(words: number): number {
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}
