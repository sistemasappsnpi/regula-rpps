-- CreateTable
CREATE TABLE `transparencia_portais` (
    `id` VARCHAR(191) NOT NULL,
    `pasta` VARCHAR(191) NOT NULL,
    `nome` VARCHAR(191) NOT NULL,
    `config` JSON NOT NULL,
    `preset` VARCHAR(191) NULL,
    `logoNome` VARCHAR(191) NULL,
    `logoMime` VARCHAR(191) NULL,
    `logoDados` LONGBLOB NULL,
    `iconeNome` VARCHAR(191) NULL,
    `iconeMime` VARCHAR(191) NULL,
    `iconeDados` LONGBLOB NULL,
    `cacheTransparencia` LONGTEXT NULL,
    `cacheMenu` LONGTEXT NULL,
    `cacheOrdem` LONGTEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `transparencia_portais_pasta_key`(`pasta`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4;
