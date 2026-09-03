-- CreateTable
CREATE TABLE `tenants` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `federatedEntity` VARCHAR(191) NOT NULL,
    `plan` ENUM('ESSENCIAL', 'GESTAO', 'PERFORMANCE') NOT NULL DEFAULT 'ESSENCIAL',
    `seguradosCount` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `tenants_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4;

-- CreateTable
CREATE TABLE `users` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `passwordHash` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `users_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4;

-- CreateTable
CREATE TABLE `memberships` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `role` ENUM('SUPER_ADMIN', 'RPPS_ADMIN', 'SERVIDOR', 'AUDITOR') NOT NULL,

    INDEX `memberships_tenantId_idx`(`tenantId`),
    UNIQUE INDEX `memberships_userId_tenantId_key`(`userId`, `tenantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4;

-- CreateTable
CREATE TABLE `crp_criteria` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `category` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,
    `legalBasis` TEXT NOT NULL,
    `periodicity` VARCHAR(191) NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,

    UNIQUE INDEX `crp_criteria_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4;

-- CreateTable
CREATE TABLE `tenant_crp_criteria` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `criterionId` VARCHAR(191) NOT NULL,
    `status` ENUM('REGULAR', 'IRREGULAR', 'PENDENTE') NOT NULL DEFAULT 'PENDENTE',
    `lastSentAt` DATETIME(3) NULL,
    `nextDueAt` DATETIME(3) NULL,
    `responsibleUserId` VARCHAR(191) NULL,
    `notes` TEXT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `tenant_crp_criteria_tenantId_idx`(`tenantId`),
    UNIQUE INDEX `tenant_crp_criteria_tenantId_criterionId_key`(`tenantId`, `criterionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4;

-- AddForeignKey
ALTER TABLE `memberships` ADD CONSTRAINT `memberships_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `memberships` ADD CONSTRAINT `memberships_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tenant_crp_criteria` ADD CONSTRAINT `tenant_crp_criteria_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tenant_crp_criteria` ADD CONSTRAINT `tenant_crp_criteria_criterionId_fkey` FOREIGN KEY (`criterionId`) REFERENCES `crp_criteria`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
