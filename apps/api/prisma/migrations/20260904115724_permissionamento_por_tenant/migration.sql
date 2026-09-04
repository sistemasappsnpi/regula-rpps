-- AlterTable
ALTER TABLE `features` ADD COLUMN `grupo` VARCHAR(191) NOT NULL DEFAULT 'Geral';

-- CreateTable
CREATE TABLE `tenant_features` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `featureKey` VARCHAR(191) COLLATE utf8mb4_unicode_ci NOT NULL,
    `enabled` BOOLEAN NOT NULL,

    UNIQUE INDEX `tenant_features_tenantId_featureKey_key`(`tenantId`, `featureKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- AddForeignKey
ALTER TABLE `tenant_features` ADD CONSTRAINT `tenant_features_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tenant_features` ADD CONSTRAINT `tenant_features_featureKey_fkey` FOREIGN KEY (`featureKey`) REFERENCES `features`(`key`) ON DELETE CASCADE ON UPDATE CASCADE;
