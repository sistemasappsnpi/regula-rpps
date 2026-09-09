-- CreateEnum (MySQL usa ENUM inline nas colunas)

-- CreateTable
CREATE TABLE `portal_documentos` (
    `id` VARCHAR(191) NOT NULL,
    `codigo` VARCHAR(191) NOT NULL,
    `nome` VARCHAR(191) NOT NULL,
    `descricao` TEXT NULL,
    `ativo` BOOLEAN NOT NULL DEFAULT true,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `portal_documentos_codigo_key`(`codigo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4;

-- CreateTable
CREATE TABLE `portal_indicadores` (
    `id` VARCHAR(191) NOT NULL,
    `documentoId` VARCHAR(191) NOT NULL,
    `indicadorId` VARCHAR(191) NOT NULL,
    `nome` VARCHAR(191) NOT NULL,
    `tipo` ENUM('NUMERICO', 'MOEDA', 'TEXTO', 'DATA') NOT NULL DEFAULT 'NUMERICO',
    `unidade` VARCHAR(191) NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,

    UNIQUE INDEX `portal_indicadores_documentoId_indicadorId_key`(`documentoId`, `indicadorId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4;

-- CreateTable
CREATE TABLE `tenant_portal_indicador_valores` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `indicadorId` VARCHAR(191) NOT NULL,
    `competencia` DATETIME(3) NOT NULL,
    `valor` TEXT NOT NULL,
    `origem` ENUM('MANUAL', 'PDF_EXTRACTION', 'AI_COMPOSED') NOT NULL DEFAULT 'MANUAL',
    `origemDetalhe` TEXT NULL,
    `criadoPorUserId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `tenant_portal_indicador_valores_tenantId_indicadorId_compe_idx`(`tenantId`, `indicadorId`, `competencia`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4;

-- AddForeignKey
ALTER TABLE `portal_indicadores` ADD CONSTRAINT `portal_indicadores_documentoId_fkey` FOREIGN KEY (`documentoId`) REFERENCES `portal_documentos`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tenant_portal_indicador_valores` ADD CONSTRAINT `tenant_portal_indicador_valores_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tenant_portal_indicador_valores` ADD CONSTRAINT `tenant_portal_indicador_valores_indicadorId_fkey` FOREIGN KEY (`indicadorId`) REFERENCES `portal_indicadores`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tenant_portal_indicador_valores` ADD CONSTRAINT `tenant_portal_indicador_valores_criadoPorUserId_fkey` FOREIGN KEY (`criadoPorUserId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
