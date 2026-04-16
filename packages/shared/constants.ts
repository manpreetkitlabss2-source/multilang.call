export const DEFAULT_LANGUAGE = "en";
export const SUPPORTED_LANGUAGES = [
  { code: "en", label: "English" },
  { code: "hi", label: "Hindi" },
  { code: "pa", label: "Punjabi" }
] as const;

export const AUDIO_CHUNK_MS = 250;
export const AUDIO_CACHE_TTL_SECONDS = 60 * 60;
export const MEETING_STATUS = {
  ACTIVE: "ACTIVE",
  ENDED: "ENDED"
} as const;
