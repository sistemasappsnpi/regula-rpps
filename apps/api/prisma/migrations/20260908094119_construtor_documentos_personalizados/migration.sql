-- AlterTable
ALTER TABLE `construtor_tipos_documento` ADD COLUMN `documentoPersonalizadoId` VARCHAR(191) NULL,
    MODIFY `referenciaTipo` ENUM('PRO_GESTAO', 'CRP', 'LIVRE', 'PERSONALIZADO') NOT NULL;

-- AlterTable
ALTER TABLE `documentos_personalizados` ADD COLUMN `promptInstrucoes` TEXT NULL;

-- CreateIndex
CREATE UNIQUE INDEX `construtor_tipos_documento_documentoPersonalizadoId_key` ON `construtor_tipos_documento`(`documentoPersonalizadoId`);

-- AddForeignKey
ALTER TABLE `construtor_tipos_documento` ADD CONSTRAINT `construtor_tipos_documento_documentoPersonalizadoId_fkey` FOREIGN KEY (`documentoPersonalizadoId`) REFERENCES `documentos_personalizados`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

