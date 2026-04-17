import { PrismaClient } from "@prisma/client";
import { nanoid } from "nanoid";
import {
  DEFAULT_LANGUAGE,
  type CreateMeetingInput,
  type MagicLinkRecord,
  type MeetingRecord,
  type ScheduledMeetingRecord
} from "@multilang-call/shared";

export const prisma = new PrismaClient();

type MeetingRow = {
  id: string;
  hostId: string;
  defaultLanguage: string;
  status: string;
  createdAt: Date;
  hostUserId: string | null;
  scheduledMeetingId: string | null;
  admitList: string;
  hostDisplayName: string | null;
};

type MagicLinkRow = {
  id: string;
  token: string;
  meetingId: string;
  inviteeEmail: string | null;
  expiresAt: Date;
  usedAt: Date | null;
  meetingDefaultLanguage?: string;
};

type ScheduledMeetingRow = {
  id: string;
  title: string;
  scheduledAt: Date;
  durationMinutes: number | bigint;
  timezone: string;
  hostId: string;
  meetingId: string | null;
  shareToken: string;
  hostDisplayName: string | null;
};

const createRecordId = () => nanoid(24);

const mapMeeting = (meeting: MeetingRow): MeetingRecord => ({
  id: meeting.id,
  hostId: meeting.hostId,
  defaultLanguage: meeting.defaultLanguage as MeetingRecord["defaultLanguage"],
  status: meeting.status as MeetingRecord["status"],
  createdAt: new Date(meeting.createdAt).toISOString(),
  hostUserId: meeting.hostUserId,
  scheduledMeetingId: meeting.scheduledMeetingId,
  admitList: meeting.admitList ?? "[]",
  hostDisplayName: meeting.hostDisplayName
});

const mapMagicLink = (link: MagicLinkRow): MagicLinkRecord => ({
  id: link.id,
  token: link.token,
  meetingId: link.meetingId,
  inviteeEmail: link.inviteeEmail,
  expiresAt: new Date(link.expiresAt).toISOString(),
  usedAt: link.usedAt ? new Date(link.usedAt).toISOString() : null
});

const mapScheduledMeeting = (
  scheduledMeeting: ScheduledMeetingRow
): ScheduledMeetingRecord & { hostDisplayName?: string | null } => ({
  id: scheduledMeeting.id,
  title: scheduledMeeting.title,
  scheduledAt: new Date(scheduledMeeting.scheduledAt).toISOString(),
  durationMinutes: Number(scheduledMeeting.durationMinutes),
  timezone: scheduledMeeting.timezone,
  hostId: scheduledMeeting.hostId,
  meetingId: scheduledMeeting.meetingId,
  shareToken: scheduledMeeting.shareToken,
  hostDisplayName: scheduledMeeting.hostDisplayName
});

const selectMeetingById = `
  SELECT
    m.id,
    m.hostId,
    m.defaultLanguage,
    m.status,
    m.createdAt,
    m.hostUserId,
    m.scheduledMeetingId,
    m.admitList,
    u.displayName AS hostDisplayName
  FROM Meeting m
  LEFT JOIN User u ON u.id = m.hostUserId
  WHERE m.id = ?
  LIMIT 1
`;

export interface MeetingService {
  createMeeting(input: CreateMeetingInput): Promise<MeetingRecord>;
  getMeeting(meetingId: string): Promise<MeetingRecord | null>;
  createMagicLinks(input: {
    meetingId: string;
    createdByUserId: string;
    inviteeEmails?: string[];
    expiresHours?: number;
  }): Promise<Array<{ token: string; url: string; inviteeEmail: string | null }>>;
  validateMagicLink(token: string): Promise<
    | {
        valid: true;
        meetingId: string;
        inviteeEmail: string | null;
        meetingDefaultLanguage: string;
      }
    | {
        valid: false;
        reason: string;
      }
  >;
  markMagicLinkUsed(token: string): Promise<void>;
  createScheduledMeeting(input: {
    title: string;
    scheduledAt: string;
    durationMinutes?: number;
    timezone?: string;
    hostId: string;
  }): Promise<ScheduledMeetingRecord>;
  listScheduledMeetings(hostId: string): Promise<
    Array<ScheduledMeetingRecord & { hostDisplayName?: string | null }>
  >;
  getScheduledMeetingByShareToken(
    shareToken: string
  ): Promise<(ScheduledMeetingRecord & { hostDisplayName?: string | null }) | null>;
  startScheduledMeeting(
    scheduledMeetingId: string,
    hostId: string
  ): Promise<{ meetingId: string; joinUrl: string } | null>;
  deleteScheduledMeeting(scheduledMeetingId: string, hostId: string): Promise<boolean>;
  addAdmittedParticipant(meetingId: string, participantId: string): Promise<void>;
  addParticipantToMeeting(
    meetingId: string,
    userId: string,
    role: "HOST" | "PARTICIPANT" | "CO_HOST",
    preferredLanguage: string
  ): Promise<void>;
  endMeeting(meetingId: string): Promise<void>;
  archiveOldLogs(daysOld?: number): Promise<number>;
}

export const createMeetingService = (): MeetingService => ({
  async createMeeting(input) {
    const id = createRecordId();
    await prisma.$executeRawUnsafe(
      `
        INSERT INTO Meeting
          (id, hostId, defaultLanguage, status, createdAt, updatedAt, hostUserId, scheduledMeetingId, admitList)
        VALUES (?, ?, ?, 'ACTIVE', NOW(), NOW(), ?, ?, '[]')
      `,
      id,
      input.hostId,
      input.defaultLanguage ?? DEFAULT_LANGUAGE,
      input.hostUserId ?? null,
      input.scheduledMeetingId ?? null
    );

    const meeting = await this.getMeeting(id);
    if (!meeting) {
      throw new Error("Unable to create meeting");
    }

    return meeting;
  },

  async getMeeting(meetingId) {
    const meetings = await prisma.$queryRawUnsafe<MeetingRow[]>(selectMeetingById, meetingId);
    return meetings[0] ? mapMeeting(meetings[0]) : null;
  },

  async createMagicLinks({
    meetingId,
    createdByUserId,
    inviteeEmails,
    expiresHours
  }) {
    const baseUrl = process.env.BASE_URL ?? "http://localhost:3000";
    const hours = expiresHours ?? Number(process.env.MAGIC_LINK_EXPIRES_HOURS ?? 48);
    const emails = inviteeEmails && inviteeEmails.length > 0 ? inviteeEmails : [null];

    return Promise.all(
      emails.map(async (inviteeEmail) => {
        const id = createRecordId();
        const token = nanoid(32);
        await prisma.$executeRawUnsafe(
          `
            INSERT INTO MagicLink
              (id, token, meetingId, inviteeEmail, expiresAt, usedAt, createdAt, createdByUserId)
            VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? HOUR), NULL, NOW(), ?)
          `,
          id,
          token,
          meetingId,
          inviteeEmail,
          hours,
          createdByUserId
        );

        return {
          token,
          url: `${baseUrl}/join/${meetingId}?invite=${token}`,
          inviteeEmail
        };
      })
    );
  },

  async validateMagicLink(token) {
    const rows = await prisma.$queryRawUnsafe<MagicLinkRow[]>(
      `
        SELECT
          ml.id,
          ml.token,
          ml.meetingId,
          ml.inviteeEmail,
          ml.expiresAt,
          ml.usedAt,
          m.defaultLanguage AS meetingDefaultLanguage
        FROM MagicLink ml
        INNER JOIN Meeting m ON m.id = ml.meetingId
        WHERE ml.token = ?
        LIMIT 1
      `,
      token
    );

    const link = rows[0];
    if (!link) {
      return { valid: false as const, reason: "Invite not found" };
    }

    if (link.usedAt) {
      return { valid: false as const, reason: "Invite already used" };
    }

    if (new Date(link.expiresAt).getTime() <= Date.now()) {
      return { valid: false as const, reason: "Invite expired" };
    }

    return {
      valid: true as const,
      meetingId: link.meetingId,
      inviteeEmail: link.inviteeEmail,
      meetingDefaultLanguage: link.meetingDefaultLanguage ?? DEFAULT_LANGUAGE
    };
  },

  async markMagicLinkUsed(token) {
    await prisma.$executeRawUnsafe(
      `UPDATE MagicLink SET usedAt = NOW() WHERE token = ? AND usedAt IS NULL`,
      token
    );
  },

  async createScheduledMeeting({
    title,
    scheduledAt,
    durationMinutes,
    timezone,
    hostId
  }) {
    const id = createRecordId();
    const shareToken = nanoid(16);
    await prisma.$executeRawUnsafe(
      `
        INSERT INTO ScheduledMeeting
          (id, title, scheduledAt, durationMinutes, timezone, hostId, meetingId, shareToken, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, NULL, ?, NOW(), NOW())
      `,
      id,
      title,
      new Date(scheduledAt),
      durationMinutes ?? 60,
      timezone ?? "UTC",
      hostId,
      shareToken
    );

    const scheduledMeeting = await this.getScheduledMeetingByShareToken(shareToken);
    if (!scheduledMeeting) {
      throw new Error("Unable to create scheduled meeting");
    }

    return scheduledMeeting;
  },

  async listScheduledMeetings(hostId) {
    const rows = await prisma.$queryRawUnsafe<ScheduledMeetingRow[]>(
      `
        SELECT
          sm.id,
          sm.title,
          sm.scheduledAt,
          sm.durationMinutes,
          sm.timezone,
          sm.hostId,
          sm.meetingId,
          sm.shareToken,
          u.displayName AS hostDisplayName
        FROM ScheduledMeeting sm
        INNER JOIN User u ON u.id = sm.hostId
        WHERE sm.hostId = ?
        ORDER BY sm.scheduledAt ASC
      `,
      hostId
    );

    return rows.map(mapScheduledMeeting);
  },

  async getScheduledMeetingByShareToken(shareToken) {
    const rows = await prisma.$queryRawUnsafe<ScheduledMeetingRow[]>(
      `
        SELECT
          sm.id,
          sm.title,
          sm.scheduledAt,
          sm.durationMinutes,
          sm.timezone,
          sm.hostId,
          sm.meetingId,
          sm.shareToken,
          u.displayName AS hostDisplayName
        FROM ScheduledMeeting sm
        INNER JOIN User u ON u.id = sm.hostId
        WHERE sm.shareToken = ?
        LIMIT 1
      `,
      shareToken
    );

    return rows[0] ? mapScheduledMeeting(rows[0]) : null;
  },

  async startScheduledMeeting(scheduledMeetingId, hostId) {
    const rows = await prisma.$queryRawUnsafe<ScheduledMeetingRow[]>(
      `
        SELECT id, title, scheduledAt, durationMinutes, timezone, hostId, meetingId, shareToken, NULL AS hostDisplayName
        FROM ScheduledMeeting
        WHERE id = ? AND hostId = ?
        LIMIT 1
      `,
      scheduledMeetingId,
      hostId
    );

    const scheduledMeeting = rows[0];
    if (!scheduledMeeting) {
      return null;
    }

    if (scheduledMeeting.meetingId) {
      return {
        meetingId: scheduledMeeting.meetingId,
        joinUrl: `/join/${scheduledMeeting.meetingId}`
      };
    }

    const meetingId = createRecordId();

    await prisma.$transaction([
      prisma.$executeRawUnsafe(
        `
          INSERT INTO Meeting
            (id, hostId, defaultLanguage, status, createdAt, updatedAt, hostUserId, scheduledMeetingId, admitList)
          VALUES (?, ?, ?, 'ACTIVE', NOW(), NOW(), ?, ?, '[]')
        `,
        meetingId,
        hostId,
        DEFAULT_LANGUAGE,
        hostId,
        scheduledMeetingId
      ),
      prisma.$executeRawUnsafe(
        `UPDATE ScheduledMeeting SET meetingId = ? WHERE id = ?`,
        meetingId,
        scheduledMeetingId
      )
    ]);

    return {
      meetingId,
      joinUrl: `/join/${meetingId}`
    };
  },

  async deleteScheduledMeeting(scheduledMeetingId, hostId) {
    const result = await prisma.$executeRawUnsafe(
      `DELETE FROM ScheduledMeeting WHERE id = ? AND hostId = ?`,
      scheduledMeetingId,
      hostId
    );

    return Number(result) > 0;
  },

  async addAdmittedParticipant(meetingId, participantId) {
    const rows = await prisma.$queryRawUnsafe<Array<{ admitList: string }>>(
      `SELECT admitList FROM Meeting WHERE id = ? LIMIT 1`,
      meetingId
    );

    const meeting = rows[0];
    if (!meeting) {
      return;
    }

    const current = new Set<string>(JSON.parse(meeting.admitList ?? "[]") as string[]);
    current.add(participantId);

    await prisma.$executeRawUnsafe(
      `UPDATE Meeting SET admitList = ? WHERE id = ?`,
      JSON.stringify([...current]),
      meetingId
    );
  },

  async addParticipantToMeeting(meetingId, userId, role, preferredLanguage) {
    const { nanoid: _nanoid } = await import("nanoid");
    const id = _nanoid(24);
    await prisma.$executeRawUnsafe(
      `
        INSERT INTO MeetingParticipant
          (id, meetingId, userId, role, preferredLanguage, joinedAt, isOnline, isMuted, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, NOW(), 1, 0, NOW(), NOW())
        ON DUPLICATE KEY UPDATE isOnline = 1, updatedAt = NOW()
      `,
      id,
      meetingId,
      userId,
      role,
      preferredLanguage
    );
  },

  async endMeeting(meetingId) {
    await prisma.$executeRawUnsafe(
      `UPDATE Meeting SET status = 'ENDED', endedAt = NOW(), expiresAt = DATE_ADD(NOW(), INTERVAL 30 DAY), updatedAt = NOW() WHERE id = ?`,
      meetingId
    );
  },

  async archiveOldLogs(daysOld = 90) {
    const result = await prisma.$executeRawUnsafe(
      `DELETE FROM ParticipantLog WHERE createdAt < DATE_SUB(NOW(), INTERVAL ? DAY)`,
      daysOld
    );
    return Number(result);
  }
});
