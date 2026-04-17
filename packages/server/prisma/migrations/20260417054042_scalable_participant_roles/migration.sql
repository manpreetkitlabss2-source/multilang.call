/*
  Warnings:

  - You are about to drop the `ParticipantLogs` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `updatedAt` to the `Meeting` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `ScheduledMeeting` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `MagicLink` ADD COLUMN `usedByUserId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `Meeting` ADD COLUMN `endedAt` DATETIME(3) NULL,
    ADD COLUMN `expiresAt` DATETIME(3) NULL,
    ADD COLUMN `updatedAt` DATETIME(3) NOT NULL;

-- AlterTable
ALTER TABLE `ScheduledMeeting` ADD COLUMN `cancelledAt` DATETIME(3) NULL,
    ADD COLUMN `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    ADD COLUMN `updatedAt` DATETIME(3) NOT NULL;

-- DropTable
DROP TABLE `ParticipantLogs`;

-- CreateTable
CREATE TABLE `MeetingParticipant` (
    `id` VARCHAR(191) NOT NULL,
    `meetingId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `role` ENUM('HOST', 'CO_HOST', 'PARTICIPANT') NOT NULL DEFAULT 'PARTICIPANT',
    `preferredLanguage` VARCHAR(191) NOT NULL DEFAULT 'en',
    `joinedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `leftAt` DATETIME(3) NULL,
    `isMuted` BOOLEAN NOT NULL DEFAULT false,
    `isOnline` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `MeetingParticipant_meetingId_idx`(`meetingId`),
    INDEX `MeetingParticipant_userId_idx`(`userId`),
    UNIQUE INDEX `MeetingParticipant_meetingId_userId_key`(`meetingId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ParticipantLog` (
    `id` VARCHAR(191) NOT NULL,
    `meetingId` VARCHAR(191) NOT NULL,
    `participantId` VARCHAR(191) NOT NULL,
    `eventType` VARCHAR(191) NOT NULL,
    `metadata` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ParticipantLog_meetingId_createdAt_idx`(`meetingId`, `createdAt`),
    INDEX `ParticipantLog_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `MagicLink_expiresAt_idx` ON `MagicLink`(`expiresAt`);

-- CreateIndex
CREATE INDEX `Meeting_status_idx` ON `Meeting`(`status`);

-- CreateIndex
CREATE INDEX `Meeting_expiresAt_idx` ON `Meeting`(`expiresAt`);

-- CreateIndex
CREATE INDEX `ScheduledMeeting_scheduledAt_idx` ON `ScheduledMeeting`(`scheduledAt`);

-- AddForeignKey
ALTER TABLE `MeetingParticipant` ADD CONSTRAINT `MeetingParticipant_meetingId_fkey` FOREIGN KEY (`meetingId`) REFERENCES `Meeting`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MeetingParticipant` ADD CONSTRAINT `MeetingParticipant_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ParticipantLog` ADD CONSTRAINT `ParticipantLog_meetingId_fkey` FOREIGN KEY (`meetingId`) REFERENCES `Meeting`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER TABLE `ScheduledMeeting` RENAME INDEX `ScheduledMeeting_hostId_fkey` TO `ScheduledMeeting_hostId_idx`;
