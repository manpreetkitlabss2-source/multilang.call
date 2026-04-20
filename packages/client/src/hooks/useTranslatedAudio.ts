import { useEffect, useRef } from "react";
import { SOCKET_EVENTS, type TranslationResult } from "@multilang-call/shared";
import type { Socket } from "socket.io-client";
import { useTranslationStore } from "../store/translationStore";

interface TranslationStatusPayload {
  socketId: string;
  participantId: string;
  sourceLanguage: string;
  transcript: string;
}

const base64ToArrayBuffer = (audioBase64: string) => {
  const bytes = atob(audioBase64);
  const buffer = new Uint8Array(bytes.length);

  for (let index = 0; index < bytes.length; index += 1) {
    buffer[index] = bytes.charCodeAt(index);
  }

  return buffer.buffer;
};

export const useTranslatedAudio = (socket: Socket | null) => {
  const audioContextRef = useRef<AudioContext | null>(null);
  const subtitleTimeoutRef = useRef<number | null>(null);
  const setStatus = useTranslationStore((state) => state.setStatus);
  const setTranscript = useTranslationStore((state) => state.setTranscript);
  const setSubtitle = useTranslationStore((state) => state.setSubtitle);

  useEffect(() => {
    if (!socket) {
      return;
    }

    const ensureAudioContext = () => {
      if (!audioContextRef.current || audioContextRef.current.state === "closed") {
        audioContextRef.current = new AudioContext();
      }

      return audioContextRef.current;
    };

    const handleTranslationStatus = (payload: TranslationStatusPayload) => {
      setStatus("translating");
      setTranscript(payload.transcript);
    };

    const handleTranslatedAudio = async (payload: TranslationResult) => {
      setStatus("ready");
      setTranscript(payload.translatedText);
      setSubtitle(payload.translatedText);

      if (subtitleTimeoutRef.current) {
        window.clearTimeout(subtitleTimeoutRef.current);
      }

      subtitleTimeoutRef.current = window.setTimeout(() => {
        setSubtitle(null);
        setStatus("idle");
      }, 5000);

      try {
        const context = ensureAudioContext();
        if (context.state === "suspended") {
          await context.resume();
        }

        const audioBuffer = await context.decodeAudioData(
          base64ToArrayBuffer(payload.audioBase64)
        );
        const source = context.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(context.destination);
        source.start(0);
      } catch (error) {
        console.warn("Unable to decode translated audio with AudioContext, falling back.", error);
        const audio = new Audio(`data:audio/mpeg;base64,${payload.audioBase64}`);
        void audio.play();
      }
    };

    socket.on(SOCKET_EVENTS.TRANSLATION_STATUS, handleTranslationStatus);
    socket.on(SOCKET_EVENTS.AUDIO_TRANSLATED, handleTranslatedAudio);

    return () => {
      socket.off(SOCKET_EVENTS.TRANSLATION_STATUS, handleTranslationStatus);
      socket.off(SOCKET_EVENTS.AUDIO_TRANSLATED, handleTranslatedAudio);
      if (subtitleTimeoutRef.current) {
        window.clearTimeout(subtitleTimeoutRef.current);
      }
    };
  }, [setStatus, setSubtitle, setTranscript, socket]);
};
