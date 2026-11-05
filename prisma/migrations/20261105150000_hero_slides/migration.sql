-- CreateTable: fotos del hero del inicio, editables desde el gestor
CREATE TABLE "hero_slides" (
    "id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "mediaId" TEXT NOT NULL,
    "alt" TEXT NOT NULL,

    CONSTRAINT "hero_slides_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "hero_slides_position_key" ON "hero_slides"("position");

-- AddForeignKey
ALTER TABLE "hero_slides" ADD CONSTRAINT "hero_slides_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "media"("id") ON DELETE CASCADE ON UPDATE CASCADE;
