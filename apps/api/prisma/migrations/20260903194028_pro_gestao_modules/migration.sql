-- AlterTable
ALTER TABLE `crp_criteria` ADD COLUMN `dependsOnCode` VARCHAR(191) NULL,
    ADD COLUMN `formaVerificacao` VARCHAR(191) NOT NULL DEFAULT '',
    ADD COLUMN `sistemaOrigem` VARCHAR(191) NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE `pro_gestao_acoes` (
    `id` VARCHAR(191) NOT NULL,
    `codigo` VARCHAR(191) NOT NULL,
    `numero` VARCHAR(191) NOT NULL,
    `nome` VARCHAR(191) NOT NULL,
    `dimensao` VARCHAR(191) NOT NULL,
    `essencial` BOOLEAN NOT NULL DEFAULT false,
    `objetivo` TEXT NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,

    UNIQUE INDEX `pro_gestao_acoes_codigo_key`(`codigo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4;

-- CreateTable
CREATE TABLE `pro_gestao_acao_dependencias` (
    `id` VARCHAR(191) NOT NULL,
    `acaoCodigo` VARCHAR(191) NOT NULL,
    `fonteCodigo` VARCHAR(191) NOT NULL,
    `tipoRelacao` VARCHAR(191) NOT NULL DEFAULT 'citacao_explicita_no_manual',

    UNIQUE INDEX `pro_gestao_acao_dependencias_acaoCodigo_fonteCodigo_key`(`acaoCodigo`, `fonteCodigo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4;

-- CreateTable
CREATE TABLE `pro_gestao_campos` (
    `id` VARCHAR(191) NOT NULL,
    `acaoCodigo` VARCHAR(191) NOT NULL,
    `campoId` VARCHAR(191) NOT NULL,
    `descricao` TEXT NOT NULL,
    `nivelMinimo` ENUM('I', 'II', 'III', 'IV') NOT NULL,
    `quantidadeMinima` VARCHAR(191) NULL,
    `periodicidade` VARCHAR(191) NULL,
    `substituiCampoId` VARCHAR(191) NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,

    UNIQUE INDEX `pro_gestao_campos_acaoCodigo_campoId_key`(`acaoCodigo`, `campoId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4;

-- CreateTable
CREATE TABLE `tenant_pro_gestao_acoes` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `acaoCodigo` VARCHAR(191) NOT NULL,
    `nivelAtual` ENUM('I', 'II', 'III', 'IV') NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `tenant_pro_gestao_acoes_tenantId_idx`(`tenantId`),
    UNIQUE INDEX `tenant_pro_gestao_acoes_tenantId_acaoCodigo_key`(`tenantId`, `acaoCodigo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4;

-- CreateTable
CREATE TABLE `tenant_pro_gestao_campo_valores` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `campoId` VARCHAR(191) NOT NULL,
    `valor` TEXT NOT NULL,
    `origem` ENUM('MANUAL', 'PDF_EXTRACTION', 'AI_COMPOSED') NOT NULL DEFAULT 'MANUAL',
    `origemDetalhe` TEXT NULL,
    `criadoPorUserId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `tenant_pro_gestao_campo_valores_tenantId_campoId_createdAt_idx`(`tenantId`, `campoId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4;

-- CreateTable
CREATE TABLE `documento_uploads` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `acaoCodigo` VARCHAR(191) NULL,
    `criterionCode` VARCHAR(191) NULL,
    `nomeArquivo` VARCHAR(191) NOT NULL,
    `caminhoArquivo` VARCHAR(191) NOT NULL,
    `paginasTexto` TEXT NOT NULL,
    `status` ENUM('PENDENTE', 'EXTRAIDO', 'ERRO') NOT NULL DEFAULT 'PENDENTE',
    `erro` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `uploadedByUserId` VARCHAR(191) NOT NULL,

    INDEX `documento_uploads_tenantId_idx`(`tenantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4;

-- CreateTable
CREATE TABLE `campo_extraido_sugestoes` (
    `id` VARCHAR(191) NOT NULL,
    `uploadId` VARCHAR(191) NOT NULL,
    `campoId` VARCHAR(191) NOT NULL,
    `valorSugerido` TEXT NOT NULL,
    `paginaOrigem` INTEGER NULL,
    `trechoOrigem` TEXT NULL,
    `status` ENUM('PENDENTE', 'APROVADA', 'REJEITADA', 'CORRIGIDA') NOT NULL DEFAULT 'PENDENTE',
    `valorFinal` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4;

-- CreateTable
CREATE TABLE `tenant_documentos_compostos` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `acaoCodigo` VARCHAR(191) NOT NULL,
    `status` ENUM('RASCUNHO', 'APROVADO', 'DESATUALIZADO') NOT NULL DEFAULT 'RASCUNHO',
    `conteudo` TEXT NOT NULL,
    `baseadoEmValorIds` TEXT NOT NULL,
    `geradoEm` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `aprovadoEm` DATETIME(3) NULL,
    `aprovadoPorUserId` VARCHAR(191) NULL,

    UNIQUE INDEX `tenant_documentos_compostos_tenantId_acaoCodigo_key`(`tenantId`, `acaoCodigo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4;

-- AddForeignKey
ALTER TABLE `crp_criteria` ADD CONSTRAINT `crp_criteria_dependsOnCode_fkey` FOREIGN KEY (`dependsOnCode`) REFERENCES `crp_criteria`(`code`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pro_gestao_acao_dependencias` ADD CONSTRAINT `pro_gestao_acao_dependencias_acaoCodigo_fkey` FOREIGN KEY (`acaoCodigo`) REFERENCES `pro_gestao_acoes`(`codigo`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pro_gestao_acao_dependencias` ADD CONSTRAINT `pro_gestao_acao_dependencias_fonteCodigo_fkey` FOREIGN KEY (`fonteCodigo`) REFERENCES `pro_gestao_acoes`(`codigo`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pro_gestao_campos` ADD CONSTRAINT `pro_gestao_campos_acaoCodigo_fkey` FOREIGN KEY (`acaoCodigo`) REFERENCES `pro_gestao_acoes`(`codigo`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tenant_pro_gestao_acoes` ADD CONSTRAINT `tenant_pro_gestao_acoes_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tenant_pro_gestao_acoes` ADD CONSTRAINT `tenant_pro_gestao_acoes_acaoCodigo_fkey` FOREIGN KEY (`acaoCodigo`) REFERENCES `pro_gestao_acoes`(`codigo`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tenant_pro_gestao_campo_valores` ADD CONSTRAINT `tenant_pro_gestao_campo_valores_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tenant_pro_gestao_campo_valores` ADD CONSTRAINT `tenant_pro_gestao_campo_valores_campoId_fkey` FOREIGN KEY (`campoId`) REFERENCES `pro_gestao_campos`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tenant_pro_gestao_campo_valores` ADD CONSTRAINT `tenant_pro_gestao_campo_valores_criadoPorUserId_fkey` FOREIGN KEY (`criadoPorUserId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `documento_uploads` ADD CONSTRAINT `documento_uploads_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `documento_uploads` ADD CONSTRAINT `documento_uploads_uploadedByUserId_fkey` FOREIGN KEY (`uploadedByUserId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `campo_extraido_sugestoes` ADD CONSTRAINT `campo_extraido_sugestoes_uploadId_fkey` FOREIGN KEY (`uploadId`) REFERENCES `documento_uploads`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tenant_documentos_compostos` ADD CONSTRAINT `tenant_documentos_compostos_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tenant_documentos_compostos` ADD CONSTRAINT `tenant_documentos_compostos_acaoCodigo_fkey` FOREIGN KEY (`acaoCodigo`) REFERENCES `pro_gestao_acoes`(`codigo`) ON DELETE CASCADE ON UPDATE CASCADE;

