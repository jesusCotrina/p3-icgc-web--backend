-- AlterTable
ALTER TABLE "site_settings" ADD COLUMN     "projectsAdvised" INTEGER NOT NULL DEFAULT 50,
ADD COLUMN     "regionsServed" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "yearsExperience" INTEGER NOT NULL DEFAULT 10;
