-- AlterTable
ALTER TABLE `tenants` ADD COLUMN `cnpj` VARCHAR(191) NULL,
    ADD COLUMN `firstAccessToken` VARCHAR(191) NULL,
    ADD COLUMN `observacao` TEXT NULL,
    ADD COLUMN `site` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `users` ADD COLUMN `ativo` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `cpf` VARCHAR(191) NULL,
    ADD COLUMN `lastLoginAt` DATETIME(3) NULL,
    ADD COLUMN `telefone` VARCHAR(191) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `tenants_cnpj_key` ON `tenants`(`cnpj`);

-- CreateIndex
CREATE UNIQUE INDEX `tenants_firstAccessToken_key` ON `tenants`(`firstAccessToken`);

-- CreateIndex
CREATE UNIQUE INDEX `users_cpf_key` ON `users`(`cpf`);
