-- Checklist de campos + subcampos pro Construtor de Documentos, e remoção do fluxo manual antigo
-- de "Documentos Personalizados" (substituído inteiramente pelo Construtor de IA).

-- DropForeignKey (fluxo manual antigo)
ALTER TABLE `tenant_documento_personalizado_valores` DROP FOREIGN KEY `tenant_documento_personalizado_valores_tenantId_fkey`;
ALTER TABLE `tenant_documento_personalizado_valores` DROP FOREIGN KEY `tenant_documento_personalizado_valores_campoId_fkey`;
ALTER TABLE `tenant_documento_personalizado_valores` DROP FOREIGN KEY `tenant_documento_personalizado_valores_criadoPorUserId_fkey`;
ALTER TABLE `tenant_documento_personalizado_publicacoes` DROP FOREIGN KEY `tenant_documento_personalizado_publicacoes_tenantId_fkey`;
ALTER TABLE `tenant_documento_personalizado_publicacoes` DROP FOREIGN KEY `tenant_documento_personalizado_publicacoes_documentoId_fkey`;
ALTER TABLE `documento_personalizado_campos` DROP FOREIGN KEY `documento_personalizado_campos_documentoId_fkey`;

-- DropTable (fluxo manual antigo)
DROP TABLE `tenant_documento_personalizado_valores`;
DROP TABLE `tenant_documento_personalizado_publicacoes`;
DROP TABLE `documento_personalizado_campos`;

-- AlterTable
ALTER TABLE `documentos_personalizados` ADD COLUMN `modoExtracaoIA` ENUM('COMENTARIO_APENAS', 'CHECKLIST_APENAS', 'AMBOS') NOT NULL DEFAULT 'COMENTARIO_APENAS';

-- AlterTable
ALTER TABLE `construtor_indicador_sugestoes` ADD COLUMN `encontrado` BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE `portal_indicador_subcampos` (
    `id` VARCHAR(191) NOT NULL,
    `indicadorId` VARCHAR(191) NOT NULL,
    `subcampoId` VARCHAR(191) NOT NULL,
    `nome` VARCHAR(191) NOT NULL,
    `tipo` ENUM('NUMERICO', 'MOEDA', 'TEXTO', 'DATA') NOT NULL DEFAULT 'TEXTO',
    `unidade` VARCHAR(191) NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,

    UNIQUE INDEX `portal_indicador_subcampos_indicadorId_subcampoId_key`(`indicadorId`, `subcampoId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4;

-- CreateTable
CREATE TABLE `tenant_portal_indicador_instancias` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `indicadorId` VARCHAR(191) NOT NULL,
    `competencia` DATETIME(3) NOT NULL,
    `documentoUploadId` VARCHAR(191) NULL,
    `origem` ENUM('MANUAL', 'PDF_EXTRACTION', 'AI_COMPOSED') NOT NULL DEFAULT 'MANUAL',
    `ativo` BOOLEAN NOT NULL DEFAULT true,
    `criadoPorUserId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `tenant_portal_indicador_instancias_tenantId_indicadorId_com_idx`(`tenantId`, `indicadorId`, `competencia`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4;

-- CreateTable
CREATE TABLE `tenant_portal_indicador_subcampo_valores` (
    `id` VARCHAR(191) NOT NULL,
    `instanciaId` VARCHAR(191) NOT NULL,
    `subcampoId` VARCHAR(191) NOT NULL,
    `valor` TEXT NOT NULL,
    `origemDetalhe` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `tenant_portal_indicador_subcampo_valores_instanciaId_subcam_idx`(`instanciaId`, `subcampoId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4;

-- AddForeignKey
ALTER TABLE `portal_indicador_subcampos` ADD CONSTRAINT `portal_indicador_subcampos_indicadorId_fkey` FOREIGN KEY (`indicadorId`) REFERENCES `portal_indicadores`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tenant_portal_indicador_instancias` ADD CONSTRAINT `tenant_portal_indicador_instancias_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tenant_portal_indicador_instancias` ADD CONSTRAINT `tenant_portal_indicador_instancias_indicadorId_fkey` FOREIGN KEY (`indicadorId`) REFERENCES `portal_indicadores`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tenant_portal_indicador_instancias` ADD CONSTRAINT `tenant_portal_indicador_instancias_documentoUploadId_fkey` FOREIGN KEY (`documentoUploadId`) REFERENCES `documento_uploads`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tenant_portal_indicador_instancias` ADD CONSTRAINT `tenant_portal_indicador_instancias_criadoPorUserId_fkey` FOREIGN KEY (`criadoPorUserId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tenant_portal_indicador_subcampo_valores` ADD CONSTRAINT `tenant_portal_indicador_subcampo_valores_instanciaId_fkey` FOREIGN KEY (`instanciaId`) REFERENCES `tenant_portal_indicador_instancias`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tenant_portal_indicador_subcampo_valores` ADD CONSTRAINT `tenant_portal_indicador_subcampo_valores_subcampoId_fkey` FOREIGN KEY (`subcampoId`) REFERENCES `portal_indicador_subcampos`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
