-- CreateTable
CREATE TABLE `transparencia_api_arquivos` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `urlHash` VARCHAR(191) NOT NULL,
    `urlOrigem` TEXT NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'FALHA',
    `nome` VARCHAR(191) NULL,
    `mime` VARCHAR(191) NULL,
    `tamanho` INTEGER NULL,
    `conteudo` LONGBLOB NULL,
    `erro` TEXT NULL,
    `tentativas` INTEGER NOT NULL DEFAULT 0,
    `baixadoEm` DATETIME(3) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `transparencia_api_arquivos_tenantId_status_idx`(`tenantId`, `status`),
    UNIQUE INDEX `transparencia_api_arquivos_tenantId_urlHash_key`(`tenantId`, `urlHash`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4;

-- AddForeignKey
ALTER TABLE `transparencia_api_arquivos` ADD CONSTRAINT `transparencia_api_arquivos_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
