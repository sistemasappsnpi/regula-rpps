-- AlterTable
ALTER TABLE `documento_uploads` ADD COLUMN `construtorExecucaoId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `construtor_tipos_documento` (
    `id` VARCHAR(191) NOT NULL,
    `nome` VARCHAR(191) NOT NULL,
    `referenciaTipo` ENUM('PRO_GESTAO', 'CRP', 'LIVRE') NOT NULL,
    `acaoCodigo` VARCHAR(191) NULL,
    `criterionCode` VARCHAR(191) NULL,
    `promptInstrucoes` TEXT NOT NULL,
    `ativo` BOOLEAN NOT NULL DEFAULT true,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `tenant_construtor_execucoes` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `tipoDocumentoId` VARCHAR(191) NOT NULL,
    `status` ENUM('RASCUNHO', 'APROVADO', 'DESATUALIZADO') NOT NULL DEFAULT 'RASCUNHO',
    `conteudo` TEXT NOT NULL,
    `citacoes` TEXT NOT NULL,
    `geradoEm` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `geradoPorUserId` VARCHAR(191) NOT NULL,
    `aprovadoEm` DATETIME(3) NULL,
    `aprovadoPorUserId` VARCHAR(191) NULL,

    INDEX `tenant_construtor_execucoes_tenantId_idx`(`tenantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- AddForeignKey
ALTER TABLE `documento_uploads` ADD CONSTRAINT `documento_uploads_construtorExecucaoId_fkey` FOREIGN KEY (`construtorExecucaoId`) REFERENCES `tenant_construtor_execucoes`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `construtor_tipos_documento` ADD CONSTRAINT `construtor_tipos_documento_acaoCodigo_fkey` FOREIGN KEY (`acaoCodigo`) REFERENCES `pro_gestao_acoes`(`codigo`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `construtor_tipos_documento` ADD CONSTRAINT `construtor_tipos_documento_criterionCode_fkey` FOREIGN KEY (`criterionCode`) REFERENCES `crp_criteria`(`code`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tenant_construtor_execucoes` ADD CONSTRAINT `tenant_construtor_execucoes_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tenant_construtor_execucoes` ADD CONSTRAINT `tenant_construtor_execucoes_tipoDocumentoId_fkey` FOREIGN KEY (`tipoDocumentoId`) REFERENCES `construtor_tipos_documento`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

