-- CreateTable
CREATE TABLE `documentos_personalizados` (
    `id` VARCHAR(191) NOT NULL,
    `codigo` VARCHAR(191) NOT NULL,
    `nome` VARCHAR(191) NOT NULL,
    `descricao` TEXT NULL,
    `ativo` BOOLEAN NOT NULL DEFAULT true,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `documentos_personalizados_codigo_key`(`codigo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `documento_personalizado_campos` (
    `id` VARCHAR(191) NOT NULL,
    `documentoId` VARCHAR(191) NOT NULL,
    `campoId` VARCHAR(191) NOT NULL,
    `descricao` TEXT NOT NULL,
    `obrigatorio` BOOLEAN NOT NULL DEFAULT false,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,

    UNIQUE INDEX `documento_personalizado_campos_documentoId_campoId_key`(`documentoId`, `campoId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `tenant_documento_personalizado_valores` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `campoId` VARCHAR(191) NOT NULL,
    `valor` TEXT NOT NULL,
    `criadoPorUserId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `tenant_documento_personalizado_valores_tenantId_campoId_crea_idx`(`tenantId`, `campoId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `tenant_documento_personalizado_publicacoes` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `documentoId` VARCHAR(191) NOT NULL,
    `status` ENUM('RASCUNHO', 'APROVADO', 'DESATUALIZADO') NOT NULL DEFAULT 'RASCUNHO',
    `conteudo` TEXT NOT NULL,
    `geradoEm` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `aprovadoEm` DATETIME(3) NULL,
    `aprovadoPorUserId` VARCHAR(191) NULL,

    UNIQUE INDEX `tenant_documento_personalizado_publicacoes_tenantId_document_key`(`tenantId`, `documentoId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- AddForeignKey
ALTER TABLE `documento_personalizado_campos` ADD CONSTRAINT `documento_personalizado_campos_documentoId_fkey` FOREIGN KEY (`documentoId`) REFERENCES `documentos_personalizados`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tenant_documento_personalizado_valores` ADD CONSTRAINT `tenant_documento_personalizado_valores_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tenant_documento_personalizado_valores` ADD CONSTRAINT `tenant_documento_personalizado_valores_campoId_fkey` FOREIGN KEY (`campoId`) REFERENCES `documento_personalizado_campos`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tenant_documento_personalizado_valores` ADD CONSTRAINT `tenant_documento_personalizado_valores_criadoPorUserId_fkey` FOREIGN KEY (`criadoPorUserId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tenant_documento_personalizado_publicacoes` ADD CONSTRAINT `tenant_documento_personalizado_publicacoes_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tenant_documento_personalizado_publicacoes` ADD CONSTRAINT `tenant_documento_personalizado_publicacoes_documentoId_fkey` FOREIGN KEY (`documentoId`) REFERENCES `documentos_personalizados`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

