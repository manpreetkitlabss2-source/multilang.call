import { DEFAULT_LANGUAGE, MEETING_STATUS } from "./constants";

export type SupportedLanguageCode = "en" | "hi" | "pa";
export type MeetingStatus = (typeof MEETING_STATUS)[keyof typeof MEETING_STATUS];

export interface Participant {
  socketId: string;
  participantId: string;
  displayName: string;
  preferredLanguage: SupportedLanguageCode;
  isMuted: boolean;
  isSpeaking: boolean;
}

export interface MeetingRecord {
  id: string;
  hostId: string;
  defaultLanguage: SupportedLanguageCode;
  status: MeetingStatus;
  createdAt: string;
  hostUserId?: string | null;
  scheduledMeetingId?: string | null;
  admitList?: string;
  hostDisplayName?: string | null;
}

export interface CreateMeetingInput {
  hostId: string;
  defaultLanguage?: SupportedLanguageCode;
  hostUserId?: string | null;
  scheduledMeetingId?: string | null;
}

export interface CreateMeetingResponse {
  meeting: MeetingRecord;
  joinUrl: string;
}

export interface MeetingState {
  meetingId: string;
  defaultLanguage: SupportedLanguageCode;
  participants: Participant[];
}

export interface BufferedAudioPayload {
  meetingId: string;
  participantId: string;
  sourceLanguage: SupportedLanguageCode;
  audioBase64: string;
  averageLevel: number;
}

export interface TranslationRequest {
  meetingId: string;
  participantId: string;
  sourceLanguage: SupportedLanguageCode;
  targetLanguages: SupportedLanguageCode[];
  audioBase64: string;
}

export interface TranslationResult {
  meetingId: string;
  participantId: string;
  sourceLanguage: SupportedLanguageCode;
  targetLanguage: SupportedLanguageCode;
  transcript: string;
  translatedText: string;
  audioBase64: string;
  cacheHit: boolean;
}

export interface TranslationQueueItem {
  id: string;
  participantId: string;
  targetLanguage: SupportedLanguageCode;
  audioBase64: string;
  transcript: string;
}

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  role: "HOST" | "PARTICIPANT";
}

export interface JwtPayload {
  userId: string;
  email: string;
  displayName: string;
  role: "HOST" | "PARTICIPANT";
  iat?: number;
  exp?: number;
}

export interface MagicLinkRecord {
  id: string;
  token: string;
  meetingId: string;
  inviteeEmail?: string | null;
  expiresAt: string;
  usedAt?: string | null;
}

export interface ScheduledMeetingRecord {
  id: string;
  title: string;
  scheduledAt: string;
  durationMinutes: number;
  timezone: string;
  hostId: string;
  meetingId?: string | null;
  shareToken: string;
}

export type ParticipantRole = "HOST" | "CO_HOST" | "PARTICIPANT";

export interface MeetingParticipantRecord {
  id: string;
  meetingId: string;
  userId: string;
  role: ParticipantRole;
  preferredLanguage: SupportedLanguageCode;
  joinedAt: string;
  leftAt?: string | null;
  isMuted: boolean;
  isOnline: boolean;
}

export interface WaitingParticipant {
  socketId: string;
  participantId: string;
  displayName: string;
  preferredLanguage: SupportedLanguageCode;
  requestedAt: number;
}

export const createEmptyMeetingState = (meetingId: string): MeetingState => ({
  meetingId,
  defaultLanguage: DEFAULT_LANGUAGE,
  participants: []
});
