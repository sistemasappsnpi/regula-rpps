-- Liga cada sugestão do Construtor ao PDF-fonte real (não só o nome do arquivo em texto livre),
-- e liga cada valor publicado no Portal Previdenciário ao PDF de origem, quando houver — permite
-- servir o documento original pro cidadão no Portal Previdenciário público.

-- AlterTable
ALTER TABLE `construtor_indicador_sugestoes` ADD COLUMN `uploadId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `tenant_portal_indicador_valores` ADD COLUMN `documentoUploadId` VARCHAR(191) NULL;

-- AddForeignKey
ALTER TABLE `construtor_indicador_sugestoes` ADD CONSTRAINT `construtor_indicador_sugestoes_uploadId_fkey` FOREIGN KEY (`uploadId`) REFERENCES `documento_uploads`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tenant_portal_indicador_valores` ADD CONSTRAINT `tenant_portal_indicador_valores_documentoUploadId_fkey` FOREIGN KEY (`documentoUploadId`) REFERENCES `documento_uploads`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
