-- AlterTable: cuarta cifra editable de la página de inicio
ALTER TABLE "site_settings" ADD COLUMN     "clientSatisfaction" INTEGER NOT NULL DEFAULT 90;
