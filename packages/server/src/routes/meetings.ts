import type { Express } from "express";
import { z } from "zod";
import { DEFAULT_LANGUAGE } from "@multilang-call/shared";
import type { MeetingService } from "../services/meetingService.js";

const createMeetingSchema = z.object({
  hostId: z.string().min(1),
  defaultLanguage: z.enum(["en", "hi", "pa"]).default(DEFAULT_LANGUAGE)
});

export const registerMeetingRoutes = (
  app: Express,
  meetingService: MeetingService
) => {
  app.post("/meetings", async (req, res) => {
    const parsed = createMeetingSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const meeting = await meetingService.createMeeting(parsed.data);
    return res.status(201).json({
      meeting,
      joinUrl: `/join/${meeting.id}`
    });
  });

  app.get("/meetings/:meetingId", async (req, res) => {
    const meeting = await meetingService.getMeeting(req.params.meetingId);
    if (!meeting) {
      return res.status(404).json({ error: "Meeting not found" });
    }

    return res.json({ meeting });
  });
};
