import type { Express } from "express";
import { z } from "zod";
import { requireRole } from "../middleware/auth.js";
import { createMeetingService } from "../services/meetingService.js";

const meetingService = createMeetingService();

const scheduleSchema = z.object({
  title: z.string().min(2).max(120),
  scheduledAt: z.string().datetime(),
  durationMinutes: z.number().int().min(15).max(480).optional(),
  timezone: z.string().min(2).max(64).optional()
});

export const registerSchedulingRoutes = (app: Pick<Express, "get" | "post" | "delete">) => {
  app.post("/scheduled-meetings", requireRole("HOST"), async (req, res) => {
    const parsed = scheduleSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const scheduledMeeting = await meetingService.createScheduledMeeting({
      hostId: req.user!.userId,
      title: parsed.data.title,
      scheduledAt: parsed.data.scheduledAt,
      durationMinutes: parsed.data.durationMinutes,
      timezone: parsed.data.timezone
    });

    return res.status(201).json({ scheduledMeeting });
  });

  app.get("/scheduled-meetings", async (req, res) => {
    const scheduledMeetings = await meetingService.listScheduledMeetings(req.user!.userId);
    return res.json({ scheduledMeetings });
  });

  app.get("/s/:shareToken", async (req, res) => {
    const scheduledMeeting = await meetingService.getScheduledMeetingByShareToken(
      req.params.shareToken
    );
    if (!scheduledMeeting) {
      return res.status(404).json({ error: "Scheduled meeting not found" });
    }

    const scheduledAt = new Date(scheduledMeeting.scheduledAt);
    return res.json({
      scheduledMeeting,
      hostDisplayName: scheduledMeeting.hostDisplayName,
      countdownMs: Math.max(scheduledAt.getTime() - Date.now(), 0)
    });
  });

  app.post(
    "/scheduled-meetings/:id/start",
    requireRole("HOST"),
    async (req, res) => {
      const result = await meetingService.startScheduledMeeting(
        String(req.params.id),
        req.user!.userId
      );

      if (!result) {
        return res.status(404).json({ error: "Scheduled meeting not found" });
      }

      return res.json(result);
    }
  );

  app.delete(
    "/scheduled-meetings/:id",
    requireRole("HOST"),
    async (req, res) => {
      const deleted = await meetingService.deleteScheduledMeeting(
        String(req.params.id),
        req.user!.userId
      );

      if (!deleted) {
        return res.status(404).json({ error: "Scheduled meeting not found" });
      }

      return res.status(204).send();
    }
  );
};
