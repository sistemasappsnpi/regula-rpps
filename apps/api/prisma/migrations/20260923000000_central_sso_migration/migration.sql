-- AlterTable
ALTER TABLE `users` ADD COLUMN `centralSub` VARCHAR(191) NULL,
    DROP COLUMN `passwordHash`;

-- AlterTable
ALTER TABLE `tenants` ADD COLUMN `centralClientCode` VARCHAR(191) NULL,
    DROP COLUMN `firstAccessToken`;

-- CreateIndex
CREATE UNIQUE INDEX `users_centralSub_key` ON `users`(`centralSub`);

-- CreateIndex
CREATE UNIQUE INDEX `tenants_centralClientCode_key` ON `tenants`(`centralClientCode`);
