-- AlterTable: créditos de la foto (autor, fuente y enlace), pie de foto en el blog
ALTER TABLE "media" ADD COLUMN     "author" TEXT,
ADD COLUMN     "source" TEXT,
ADD COLUMN     "sourceUrl" TEXT;
