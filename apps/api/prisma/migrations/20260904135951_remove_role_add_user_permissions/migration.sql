-- AlterTable
ALTER TABLE `features` ADD COLUMN `escopo` ENUM('TENANT', 'ADMIN') NOT NULL DEFAULT 'TENANT';

-- AlterTable
ALTER TABLE `memberships` DROP COLUMN `role`;

-- CreateTable
CREATE TABLE `user_features` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `featureKey` VARCHAR(191) COLLATE utf8mb4_unicode_ci NOT NULL,
    `enabled` BOOLEAN NOT NULL,

    UNIQUE INDEX `user_features_userId_featureKey_key`(`userId`, `featureKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- AddForeignKey
ALTER TABLE `user_features` ADD CONSTRAINT `user_features_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_features` ADD CONSTRAINT `user_features_featureKey_fkey` FOREIGN KEY (`featureKey`) REFERENCES `features`(`key`) ON DELETE CASCADE ON UPDATE CASCADE;