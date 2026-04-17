import { prisma } from "./meetingService.js";

const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
const LOG_TTL_DAYS = 90;
const ARCHIVE_AFTER_DAYS = 30;

const runCleanup = async () => {
  try {
    const logsDeleted = await prisma.$executeRawUnsafe(
      `DELETE FROM ParticipantLog WHERE createdAt < DATE_SUB(NOW(), INTERVAL ? DAY)`,
      LOG_TTL_DAYS
    );
    console.log(`[Cleanup] Deleted ${Number(logsDeleted)} old participant logs`);

    const linksDeleted = await prisma.$executeRawUnsafe(
      `DELETE FROM MagicLink WHERE expiresAt < NOW() AND usedAt IS NOT NULL`
    );
    console.log(`[Cleanup] Deleted ${Number(linksDeleted)} expired magic links`);

    const meetingsArchived = await prisma.$executeRawUnsafe(
      `UPDATE Meeting SET status = 'ARCHIVED', updatedAt = NOW()
       WHERE status = 'ENDED' AND endedAt < DATE_SUB(NOW(), INTERVAL ? DAY)`,
      ARCHIVE_AFTER_DAYS
    );
    console.log(`[Cleanup] Archived ${Number(meetingsArchived)} old meetings`);

    const participantsDeleted = await prisma.$executeRawUnsafe(
      `DELETE mp FROM MeetingParticipant mp
       INNER JOIN Meeting m ON m.id = mp.meetingId
       WHERE m.status = 'ARCHIVED'`
    );
    console.log(`[Cleanup] Deleted ${Number(participantsDeleted)} archived meeting participants`);
  } catch (error) {
    console.error("[Cleanup] Job failed:", error);
  }
};

export const startCleanupService = (): (() => void) => {
  // Run once at startup (offset by 5s to let server settle)
  const startupTimer = setTimeout(() => void runCleanup(), 5000);
  const interval = setInterval(() => void runCleanup(), CLEANUP_INTERVAL_MS);

  console.log("[Cleanup] Service started (interval: 24h)");

  return () => {
    clearTimeout(startupTimer);
    clearInterval(interval);
    console.log("[Cleanup] Service stopped");
  };
};
