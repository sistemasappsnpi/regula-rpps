-- AlterTable
ALTER TABLE `tenants` ADD COLUMN `transparenciaApiChave` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `transparencia_api_registros` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `endpoint` VARCHAR(191) NOT NULL,
    `hash` VARCHAR(191) NOT NULL,
    `dados` JSON NOT NULL,
    `ano` INTEGER NULL,
    `referencia` DATETIME(3) NULL,
    `coletadoEm` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `vistoEm` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `removidoEm` DATETIME(3) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `transparencia_api_registros_tenantId_endpoint_idx`(`tenantId`, `endpoint`),
    UNIQUE INDEX `transparencia_api_registros_tenantId_endpoint_hash_key`(`tenantId`, `endpoint`, `hash`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4;

-- AddForeignKey
ALTER TABLE `transparencia_api_registros` ADD CONSTRAINT `transparencia_api_registros_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
