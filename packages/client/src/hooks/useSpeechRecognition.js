import { useCallback, useEffect, useRef } from "react";
import { SOCKET_EVENTS } from "@multilang-call/shared";
import { useTranslationStore } from "../store/translationStore";
const LANG_BCP47 = {
    en: "en-US",
    hi: "hi-IN",
    pa: "pa-IN"
};
export const useSpeechRecognition = (socket, meetingId, participantId, sourceLanguage, isMuted, enabled) => {
    const recognitionRef = useRef(null);
    const activeRef = useRef(false);
    const sourceLanguageRef = useRef(sourceLanguage);
    const setStatus = useTranslationStore((state) => state.setStatus);
    useEffect(() => {
        sourceLanguageRef.current = sourceLanguage;
    }, [sourceLanguage]);
    const stop = useCallback(() => {
        activeRef.current = false;
        try {
            recognitionRef.current?.stop();
        }
        catch {
            // Ignore duplicate stop calls from the browser implementation.
        }
        recognitionRef.current = null;
        setStatus("idle");
    }, [setStatus]);
    const start = useCallback(() => {
        if (!socket || !meetingId || !participantId || !enabled || isMuted) {
            return;
        }
        if (recognitionRef.current) {
            return;
        }
        const SpeechRecognitionImpl = window.SpeechRecognition ?? window.webkitSpeechRecognition;
        if (!SpeechRecognitionImpl) {
            console.warn("Web Speech API is unavailable in this browser. Video will still work.");
            return;
        }
        const recognition = new SpeechRecognitionImpl();
        recognition.continuous = true;
        recognition.interimResults = false;
        recognition.lang = LANG_BCP47[sourceLanguageRef.current];
        recognition.onresult = (event) => {
            const latestResult = event.results[event.results.length - 1];
            const text = latestResult?.[0]?.transcript?.trim();
            if (!text || text.length < 2) {
                return;
            }
            setStatus("translating");
            socket.emit(SOCKET_EVENTS.TRANSCRIPT_READY, {
                meetingId,
                participantId,
                sourceLanguage: sourceLanguageRef.current,
                text
            });
        };
        recognition.onerror = (event) => {
            if (event.error === "no-speech" || event.error === "aborted") {
                return;
            }
            console.error("Speech recognition error:", event.error);
            setStatus("idle");
        };
        recognition.onend = () => {
            if (!activeRef.current || isMuted || !enabled) {
                return;
            }
            try {
                recognition.start();
            }
            catch {
                // Some browsers throw if restart happens too quickly.
            }
        };
        recognitionRef.current = recognition;
        activeRef.current = true;
        setStatus("capturing");
        try {
            recognition.start();
        }
        catch {
            // Ignore repeated start attempts while the browser is already listening.
        }
    }, [enabled, isMuted, meetingId, participantId, setStatus, socket]);
    useEffect(() => {
        if (!enabled || isMuted) {
            stop();
            return;
        }
        start();
        return () => stop();
    }, [enabled, isMuted, start, stop]);
    useEffect(() => {
        if (!activeRef.current) {
            return;
        }
        stop();
        const restartTimer = window.setTimeout(() => start(), 200);
        return () => window.clearTimeout(restartTimer);
    }, [sourceLanguage, start, stop]);
};
