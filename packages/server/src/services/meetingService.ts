import { PrismaClient } from "@prisma/client";
import type { CreateMeetingInput, MeetingRecord } from "@multilang-call/shared";

const prisma = new PrismaClient();

const mapMeeting = (meeting: {
  id: string;
  hostId: string;
  defaultLanguage: string;
  status: string;
  createdAt: Date;
}): MeetingRecord => ({
  id: meeting.id,
  hostId: meeting.hostId,
  defaultLanguage: meeting.defaultLanguage as MeetingRecord["defaultLanguage"],
  status: meeting.status as MeetingRecord["status"],
  createdAt: meeting.createdAt.toISOString()
});

export interface MeetingService {
  createMeeting(input: CreateMeetingInput): Promise<MeetingRecord>;
  getMeeting(meetingId: string): Promise<MeetingRecord | null>;
}

export const createMeetingService = (): MeetingService => ({
  async createMeeting(input) {
    const meeting = await prisma.meeting.create({
      data: {
        hostId: input.hostId,
        defaultLanguage: input.defaultLanguage ?? "en"
      }
    });

    return mapMeeting(meeting);
  },

  async getMeeting(meetingId) {
    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId }
    });

    return meeting ? mapMeeting(meeting) : null;
  }
});
