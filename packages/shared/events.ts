export const SOCKET_EVENTS = {
  MEETING_CREATE: "meeting:create",
  MEETING_JOIN: "meeting:join",
  MEETING_STATE: "meeting:state",
  PARTICIPANT_UPDATE: "participant:update",
  PARTICIPANT_LEAVE: "participant:leave",
  LANGUAGE_CHANGE: "language:change",
  AUDIO_CHUNK: "audio:chunk",
  AUDIO_TRANSLATED: "audio:translated",
  TRANSLATION_STATUS: "translation:status",
  SPEAKING_STATUS: "speaking:status",
  MUTE_STATUS: "mute:status",
  WEBRTC_OFFER: "webrtc:offer",
  WEBRTC_ANSWER: "webrtc:answer",
  WEBRTC_ICE_CANDIDATE: "webrtc:ice-candidate"
} as const;
