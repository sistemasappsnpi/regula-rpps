-- CreateTable
CREATE TABLE `features` (
    `key` VARCHAR(191) NOT NULL,
    `nome` VARCHAR(191) NOT NULL,
    `descricao` TEXT NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `plan_features` (
    `id` VARCHAR(191) NOT NULL,
    `plan` ENUM('ESSENCIAL', 'GESTAO', 'PERFORMANCE') NOT NULL,
    `featureKey` VARCHAR(191) NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT false,

    UNIQUE INDEX `plan_features_plan_featureKey_key`(`plan`, `featureKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `plan_features` ADD CONSTRAINT `plan_features_featureKey_fkey` FOREIGN KEY (`featureKey`) REFERENCES `features`(`key`) ON DELETE CASCADE ON UPDATE CASCADE;
