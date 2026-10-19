-- AlterTable
ALTER TABLE `tenants` ADD COLUMN `portalCorDestaque` VARCHAR(191) NULL,
    ADD COLUMN `portalEstiloPaginas` VARCHAR(191) NOT NULL DEFAULT 'completo';
