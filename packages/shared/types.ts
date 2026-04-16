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
}

export interface CreateMeetingInput {
  hostId: string;
  defaultLanguage?: SupportedLanguageCode;
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

export const createEmptyMeetingState = (meetingId: string): MeetingState => ({
  meetingId,
  defaultLanguage: DEFAULT_LANGUAGE,
  participants: []
});
