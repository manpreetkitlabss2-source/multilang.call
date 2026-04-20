import type { Server, Socket } from "socket.io";
import {
  SOCKET_EVENTS,
  type BufferedAudioPayload,
  type SupportedLanguageCode,
  type TranscriptPayload
} from "@multilang-call/shared";
import type { PipelineClient } from "../services/pipelineClient.js";
import type { RoomManager } from "./roomManager.js";

const audioBuffers = new Map<string, string[]>();

const bufferKey = (meetingId: string, socketId: string) => `${meetingId}:${socketId}`;

const looksLikeSilenceBoundary = (averageLevel: number) => averageLevel < 0.015;

export const registerAudioHandlers = (
  io: Server,
  socket: Socket,
  roomManager: RoomManager,
  pipelineClient: PipelineClient
) => {
  socket.on(SOCKET_EVENTS.AUDIO_CHUNK, async (payload: BufferedAudioPayload) => {
    if (socket.data.pending) {
      return;
    }

    const key = bufferKey(payload.meetingId, socket.id);
    const chunks = audioBuffers.get(key) ?? [];
    chunks.push(payload.audioBase64);
    audioBuffers.set(key, chunks);

    const bufferedAudio = Buffer.concat(
      chunks.map((chunk) => Buffer.from(chunk, "base64"))
    ).toString("base64");
    const isSpeechBoundary = looksLikeSilenceBoundary(payload.averageLevel);

    await roomManager.setSpeaking(payload.meetingId, socket.id, !isSpeechBoundary);
    io.to(payload.meetingId).emit(SOCKET_EVENTS.SPEAKING_STATUS, {
      socketId: socket.id,
      isSpeaking: !isSpeechBoundary
    });

    if (!isSpeechBoundary) {
      return;
    }

    audioBuffers.delete(key);
    const participants = await roomManager.getMeetingParticipants(payload.meetingId);
    const targetLanguages = [
      ...new Set(
        participants
          .map((participant) => participant.preferredLanguage)
          .filter((language) => language !== payload.sourceLanguage)
      )
    ];

    if (targetLanguages.length === 0) {
      return;
    }

    const results = await pipelineClient.translate({
      meetingId: payload.meetingId,
      participantId: payload.participantId,
      sourceLanguage: payload.sourceLanguage,
      targetLanguages,
      audioBase64: bufferedAudio
    });

    for (const result of results) {
      io.to(`${payload.meetingId}:${result.targetLanguage}`).emit(
        SOCKET_EVENTS.AUDIO_TRANSLATED,
        result
      );
    }
  });

  socket.on(SOCKET_EVENTS.TRANSCRIPT_READY, async (payload: TranscriptPayload) => {
    if (socket.data.pending) {
      return;
    }

    const { meetingId, participantId, sourceLanguage, text } = payload;

    await roomManager.setSpeaking(meetingId, socket.id, true);
    io.to(meetingId).emit(SOCKET_EVENTS.SPEAKING_STATUS, {
      socketId: socket.id,
      isSpeaking: true
    });

    const participants = await roomManager.getMeetingParticipants(meetingId);
    const targetLanguages = [
      ...new Set(
        participants
          .map((participant) => participant.preferredLanguage)
          .filter((language) => language !== sourceLanguage)
      )
    ] as SupportedLanguageCode[];

    try {
      if (targetLanguages.length > 0) {
        const results = await pipelineClient.translateText({
          meetingId,
          participantId,
          sourceLanguage,
          targetLanguages,
          text
        });

        for (const result of results) {
          io.to(`${meetingId}:${result.targetLanguage}`).emit(
            SOCKET_EVENTS.AUDIO_TRANSLATED,
            result
          );
        }
      }

      io.to(meetingId).emit(SOCKET_EVENTS.TRANSLATION_STATUS, {
        socketId: socket.id,
        participantId,
        sourceLanguage,
        transcript: text
      });
    } finally {
      await roomManager.setSpeaking(meetingId, socket.id, false);
      io.to(meetingId).emit(SOCKET_EVENTS.SPEAKING_STATUS, {
        socketId: socket.id,
        isSpeaking: false
      });
    }
  });
};
