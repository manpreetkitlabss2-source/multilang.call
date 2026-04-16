import type { Express } from "express";
import { z } from "zod";
import type { MeetingService } from "../services/meetingService.js";

const createMagicLinksSchema = z.object({
  inviteeEmails: z.array(z.string().email()).optional(),
  expiresHours: z.number().int().positive().max(168).optional()
});

export const registerMagicLinkRoutes = (
  app: Pick<Express, "post" | "get">,
  meetingService: MeetingService
) => {
  app.post("/meetings/:meetingId/magic-links", async (req, res) => {
    const parsed = createMagicLinksSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const meeting = await meetingService.getMeeting(req.params.meetingId);
    if (!meeting) {
      return res.status(404).json({ error: "Meeting not found" });
    }

    if (meeting.hostUserId !== req.user?.userId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const results = await meetingService.createMagicLinks({
      meetingId: meeting.id,
      createdByUserId: req.user.userId,
      inviteeEmails: parsed.data.inviteeEmails,
      expiresHours: parsed.data.expiresHours
    });

    return res.status(201).json({ links: results });
  });

  app.get("/invite/:token", async (req, res) => {
    const link = await meetingService.validateMagicLink(req.params.token);
    if (!link.valid) {
      return res.json(link);
    }

    return res.json(link);
  });
};
