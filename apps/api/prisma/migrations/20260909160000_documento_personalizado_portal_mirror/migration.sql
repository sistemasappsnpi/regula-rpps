-- AlterTable
ALTER TABLE `documentos_personalizados` ADD COLUMN `portalDocumentoId` VARCHAR(191) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `documentos_personalizados_portalDocumentoId_key` ON `documentos_personalizados`(`portalDocumentoId`);

-- AddForeignKey
ALTER TABLE `documentos_personalizados` ADD CONSTRAINT `documentos_personalizados_portalDocumentoId_fkey` FOREIGN KEY (`portalDocumentoId`) REFERENCES `portal_documentos`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
