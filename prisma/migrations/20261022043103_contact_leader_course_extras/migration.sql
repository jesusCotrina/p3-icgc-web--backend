-- AlterTable
ALTER TABLE "courses" ADD COLUMN     "instructor" TEXT,
ADD COLUMN     "objective" TEXT;

-- AlterTable
ALTER TABLE "site_settings" ADD COLUMN     "leaderBio" TEXT,
ADD COLUMN     "leaderCareer" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "leaderHeadline" TEXT,
ADD COLUMN     "leaderName" TEXT,
ADD COLUMN     "leaderPhotoAlt" TEXT,
ADD COLUMN     "leaderPhotoMediaId" TEXT,
ADD COLUMN     "leaderRole" TEXT;

-- CreateTable
CREATE TABLE "contact_messages" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "message" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contact_messages_createdAt_idx" ON "contact_messages"("createdAt");

-- AddForeignKey
ALTER TABLE "site_settings" ADD CONSTRAINT "site_settings_leaderPhotoMediaId_fkey" FOREIGN KEY ("leaderPhotoMediaId") REFERENCES "media"("id") ON DELETE SET NULL ON UPDATE CASCADE;
