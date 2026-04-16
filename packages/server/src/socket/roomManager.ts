import Redis from "ioredis";
import type {
  Participant,
  SupportedLanguageCode,
  WaitingParticipant
} from "@multilang-call/shared";

type LiveParticipant = Participant & { joinedAt: number };

const participantKey = (meetingId: string) => `meeting:${meetingId}.participants`;
const waitingKey = (meetingId: string) => `meeting:${meetingId}.waiting`;
const languageRoomKey = (meetingId: string, language: SupportedLanguageCode) =>
  `meeting:${meetingId}.language:${language}`;

export interface RoomManager {
  addParticipant(meetingId: string, participant: Participant): Promise<Participant[]>;
  removeParticipant(meetingId: string, socketId: string): Promise<Participant[]>;
  setMuted(meetingId: string, socketId: string, isMuted: boolean): Promise<Participant[]>;
  setSpeaking(meetingId: string, socketId: string, isSpeaking: boolean): Promise<Participant[]>;
  changeLanguage(
    meetingId: string,
    socketId: string,
    preferredLanguage: SupportedLanguageCode
  ): Promise<Participant[]>;
  getMeetingParticipants(meetingId: string): Promise<Participant[]>;
  getSocketsForLanguage(
    meetingId: string,
    language: SupportedLanguageCode
  ): Promise<string[]>;
  addToWaiting(
    meetingId: string,
    participant: WaitingParticipant
  ): Promise<WaitingParticipant[]>;
  removeFromWaiting(meetingId: string, socketId: string): Promise<WaitingParticipant[]>;
  getWaitingParticipants(meetingId: string): Promise<WaitingParticipant[]>;
  isHostOnline(meetingId: string, hostUserId: string): Promise<boolean>;
}

const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
  lazyConnect: true,
  maxRetriesPerRequest: 1
});

const ensureRedis = async () => {
  if (redis.status === "wait") {
    await redis.connect();
  }
};

const sortParticipants = (participants: LiveParticipant[]): Participant[] =>
  participants
    .sort((a, b) => a.joinedAt - b.joinedAt)
    .map(({ joinedAt, ...participant }) => participant);

const readParticipants = async (meetingId: string): Promise<LiveParticipant[]> => {
  await ensureRedis();
  const raw = await redis.hgetall(participantKey(meetingId));
  return Object.values(raw).map((entry) => JSON.parse(entry) as LiveParticipant);
};

const readWaitingParticipants = async (
  meetingId: string
): Promise<WaitingParticipant[]> => {
  await ensureRedis();
  const raw = await redis.hgetall(waitingKey(meetingId));
  return Object.values(raw)
    .map((entry) => JSON.parse(entry) as WaitingParticipant)
    .sort((a, b) => a.requestedAt - b.requestedAt);
};

const writeParticipant = async (meetingId: string, participant: LiveParticipant) => {
  await ensureRedis();
  await redis.hset(
    participantKey(meetingId),
    participant.socketId,
    JSON.stringify(participant)
  );
};

const removeFromLanguageRoom = async (
  meetingId: string,
  language: SupportedLanguageCode,
  socketId: string
) => {
  await ensureRedis();
  await redis.srem(languageRoomKey(meetingId, language), socketId);
};

const addToLanguageRoom = async (
  meetingId: string,
  language: SupportedLanguageCode,
  socketId: string
) => {
  await ensureRedis();
  await redis.sadd(languageRoomKey(meetingId, language), socketId);
};

export const createRoomManager = (): RoomManager => ({
  async addParticipant(meetingId, participant) {
    const liveParticipant: LiveParticipant = {
      ...participant,
      joinedAt: Date.now()
    };
    await writeParticipant(meetingId, liveParticipant);
    await addToLanguageRoom(meetingId, participant.preferredLanguage, participant.socketId);
    return sortParticipants(await readParticipants(meetingId));
  },

  async removeParticipant(meetingId, socketId) {
    const participants = await readParticipants(meetingId);
    const current = participants.find((participant) => participant.socketId === socketId);

    await ensureRedis();
    await redis.hdel(participantKey(meetingId), socketId);
    if (current) {
      await removeFromLanguageRoom(meetingId, current.preferredLanguage, socketId);
    }

    return sortParticipants(await readParticipants(meetingId));
  },

  async setMuted(meetingId, socketId, isMuted) {
    const participants = await readParticipants(meetingId);
    const current = participants.find((participant) => participant.socketId === socketId);
    if (!current) {
      return sortParticipants(participants);
    }

    await writeParticipant(meetingId, { ...current, isMuted });
    return sortParticipants(await readParticipants(meetingId));
  },

  async setSpeaking(meetingId, socketId, isSpeaking) {
    const participants = await readParticipants(meetingId);
    const current = participants.find((participant) => participant.socketId === socketId);
    if (!current) {
      return sortParticipants(participants);
    }

    await writeParticipant(meetingId, { ...current, isSpeaking });
    return sortParticipants(await readParticipants(meetingId));
  },

  async changeLanguage(meetingId, socketId, preferredLanguage) {
    const participants = await readParticipants(meetingId);
    const current = participants.find((participant) => participant.socketId === socketId);
    if (!current) {
      return sortParticipants(participants);
    }

    await removeFromLanguageRoom(meetingId, current.preferredLanguage, socketId);
    await addToLanguageRoom(meetingId, preferredLanguage, socketId);
    await writeParticipant(meetingId, { ...current, preferredLanguage });
    return sortParticipants(await readParticipants(meetingId));
  },

  async getMeetingParticipants(meetingId) {
    return sortParticipants(await readParticipants(meetingId));
  },

  async getSocketsForLanguage(meetingId, language) {
    await ensureRedis();
    return redis.smembers(languageRoomKey(meetingId, language));
  },

  async addToWaiting(meetingId, participant) {
    await ensureRedis();
    await redis.hset(waitingKey(meetingId), participant.socketId, JSON.stringify(participant));
    return readWaitingParticipants(meetingId);
  },

  async removeFromWaiting(meetingId, socketId) {
    await ensureRedis();
    await redis.hdel(waitingKey(meetingId), socketId);
    return readWaitingParticipants(meetingId);
  },

  async getWaitingParticipants(meetingId) {
    return readWaitingParticipants(meetingId);
  },

  async isHostOnline(meetingId, hostUserId) {
    const participants = await readParticipants(meetingId);
    return participants.some((participant) => participant.participantId === hostUserId);
  }
});
