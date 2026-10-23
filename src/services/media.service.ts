import { prisma } from '../lib/prisma';
import { removeFile } from '../middleware/upload';

/**
 * Borra una imagen (fila + archivo en disco) solo si ya nadie la usa.
 *
 * Se llama al eliminar un curso o proyecto, o al cambiarle la portada: así el
 * disco del servidor no se llena de fotos huérfanas, pero nunca se borra una
 * imagen que sigue apareciendo en un post, en otro curso o como logo.
 */
export async function deleteMediaIfUnused(mediaId: string | null | undefined): Promise<void> {
  if (!mediaId) return;

  const media = await prisma.media.findUnique({
    where: { id: mediaId },
    select: {
      relativePath: true,
      _count: {
        select: {
          blocks: true,
          coverOf: true,
          courseCoverOf: true,
          projectCoverOf: true,
          logoOf: true,
          ogImageOf: true,
          leaderPhotoOf: true,
        },
      },
    },
  });
  if (!media) return;

  const usos = Object.values(media._count).reduce((total, n) => total + n, 0);
  if (usos > 0) return;

  await prisma.media.delete({ where: { id: mediaId } });
  await removeFile(media.relativePath);
}
