-- CreateEnum
CREATE TYPE "CourseMode" AS ENUM ('ONLINE', 'ONSITE', 'BLENDED');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'IN_FORMULATION', 'STOPPED');

-- CreateTable
CREATE TABLE "courses" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "duration" TEXT NOT NULL,
    "lectiveHours" INTEGER NOT NULL,
    "modality" TEXT NOT NULL DEFAULT 'En vivo por Zoom',
    "mode" "CourseMode" NOT NULL DEFAULT 'ONLINE',
    "material" TEXT NOT NULL DEFAULT 'Material digital descargable',
    "certificate" TEXT NOT NULL DEFAULT 'Certificado del ICGC',
    "audience" TEXT NOT NULL,
    "topics" TEXT[],
    "coverImageId" TEXT,
    "coverAlt" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "duration" TEXT NOT NULL,
    "status" "ProjectStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "capital" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "community" TEXT NOT NULL,
    "implementingEntity" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "achievements" TEXT[],
    "communitiesBenefited" INTEGER NOT NULL DEFAULT 1,
    "region" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "coverImageId" TEXT,
    "coverAlt" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "courses_slug_key" ON "courses"("slug");

-- CreateIndex
CREATE INDEX "courses_isPublished_position_idx" ON "courses"("isPublished", "position");

-- CreateIndex
CREATE UNIQUE INDEX "projects_slug_key" ON "projects"("slug");

-- CreateIndex
CREATE INDEX "projects_isPublished_position_idx" ON "projects"("isPublished", "position");

-- CreateIndex
CREATE INDEX "projects_region_idx" ON "projects"("region");

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_coverImageId_fkey" FOREIGN KEY ("coverImageId") REFERENCES "media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_coverImageId_fkey" FOREIGN KEY ("coverImageId") REFERENCES "media"("id") ON DELETE SET NULL ON UPDATE CASCADE;
