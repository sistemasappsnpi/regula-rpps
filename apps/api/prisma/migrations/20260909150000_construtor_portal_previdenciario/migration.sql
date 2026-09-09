-- AlterTable
ALTER TABLE `construtor_tipos_documento` ADD COLUMN `portalDocumentoId` VARCHAR(191) NULL,
    MODIFY `referenciaTipo` ENUM('PRO_GESTAO', 'CRP', 'LIVRE', 'PERSONALIZADO', 'PORTAL_PREVIDENCIARIO') NOT NULL;

-- CreateTable
CREATE TABLE `construtor_indicador_sugestoes` (
    `id` VARCHAR(191) NOT NULL,
    `execucaoId` VARCHAR(191) NOT NULL,
    `indicadorId` VARCHAR(191) NOT NULL,
    `competencia` DATETIME(3) NOT NULL,
    `valorSugerido` TEXT NOT NULL,
    `documentoNomeOrigem` VARCHAR(191) NOT NULL,
    `paginaOrigem` INTEGER NULL,
    `trechoOrigem` TEXT NULL,
    `status` ENUM('PENDENTE', 'APROVADA', 'REJEITADA', 'CORRIGIDA') NOT NULL DEFAULT 'PENDENTE',
    `valorFinal` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4;

-- CreateIndex
CREATE UNIQUE INDEX `construtor_tipos_documento_portalDocumentoId_key` ON `construtor_tipos_documento`(`portalDocumentoId`);

-- AddForeignKey
ALTER TABLE `construtor_tipos_documento` ADD CONSTRAINT `construtor_tipos_documento_portalDocumentoId_fkey` FOREIGN KEY (`portalDocumentoId`) REFERENCES `portal_documentos`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `construtor_indicador_sugestoes` ADD CONSTRAINT `construtor_indicador_sugestoes_execucaoId_fkey` FOREIGN KEY (`execucaoId`) REFERENCES `tenant_construtor_execucoes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `construtor_indicador_sugestoes` ADD CONSTRAINT `construtor_indicador_sugestoes_indicadorId_fkey` FOREIGN KEY (`indicadorId`) REFERENCES `portal_indicadores`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER TABLE `tenant_portal_indicador_valores` RENAME INDEX `tenant_portal_indicador_valores_tenantId_indicadorId_compe_idx` TO `tenant_portal_indicador_valores_tenantId_indicadorId_compete_idx`;
