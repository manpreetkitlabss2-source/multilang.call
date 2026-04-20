/**
 * AudioMeet.tsx
 *
 * A meeting room where instead of speaking live, you upload an audio file.
 * The file is streamed through WebRTC (same as a live mic) so the server
 * sees it identically to any other participant's audio.
 *
 * Flow:
 *  1. Join meeting exactly like Meet.tsx (knock → admit → join)
 *  2. Pick source language + target (preferred) language
 *  3. Drop / pick an audio file
 *  4. Press "Broadcast" — the file is decoded via AudioContext and pumped
 *     through the audioWorklet PCM processor → AUDIO_CHUNK socket events,
 *     exactly the same path as the microphone in Meet.tsx
 *  5. Incoming translated audio plays automatically (useTranslatedAudio)
 *  6. STT transcript + TTS subtitle shown if the backend sends them
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  SOCKET_EVENTS,
  type MeetingRecord,
  type Participant,
  type SupportedLanguageCode,
  type WaitingParticipant
} from "@multilang-call/shared";
import LanguageSelector from "../components/LanguageSelector";
import TranslationOverlay from "../components/TranslationOverlay";
import { useSocket } from "../hooks/useSocket";
import { useTranslatedAudio } from "../hooks/useTranslatedAudio";
import { useWebRTC } from "../hooks/useWebRTC";
import { useVAD } from "../hooks/useVAD";
import { registerAudioWorklet } from "../lib/audioWorklet";
import { apiUrl, createAuthHeaders } from "../lib/api";
import { useAuthStore } from "../store/authStore";
import { useMeetingStore } from "../store/meetingStore";
import { useTranslationStore } from "../store/translationStore";

// ─── helpers ────────────────────────────────────────────────────────────────

const float32ToBase64 = (buffer: Float32Array): string => {
  const bytes = new Uint8Array(buffer.buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
};

const formatTime = (seconds: number) => {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
};

// ─── types ───────────────────────────────────────────────────────────────────

type BroadcastState = "idle" | "playing" | "done" | "error";

interface TranscriptLine {
  id: number;
  speaker: string;
  sourceText: string;
  translatedText: string;
  sourceLang: string;
  targetLang: string;
  timestamp: number;
  isIncoming: boolean;
}

// ─── component ───────────────────────────────────────────────────────────────

const AudioMeet = () => {
  const { meetingId = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.token);

  const locationState = (location.state as {
    displayName?: string;
    preferredLanguage?: SupportedLanguageCode;
    inviteToken?: string;
    fromJoin?: boolean;
  } | null) ?? {};

  const savedJoinState = useMemo(() => {
    const raw = sessionStorage.getItem(`meeting_join_state_${meetingId}`);
    if (!raw) return null;
    try { return JSON.parse(raw) as { displayName?: string; preferredLanguage?: SupportedLanguageCode; inviteToken?: string }; }
    catch { return null; }
  }, [meetingId]);

  const displayName = locationState.displayName ?? savedJoinState?.displayName ?? user?.displayName ?? "Guest";
  const effectiveInviteToken = locationState.inviteToken ?? savedJoinState?.inviteToken ?? null;
  const initialLanguage: SupportedLanguageCode = locationState.preferredLanguage ?? savedJoinState?.preferredLanguage ?? "en";

  // ── stores ──────────────────────────────────────────────────────────────
  const participants = useMeetingStore((s) => s.participants);
  const waitingForAdmission = useMeetingStore((s) => s.waitingForAdmission);
  const admittedToMeeting = useMeetingStore((s) => s.admittedToMeeting);
  const joinDeniedMessage = useMeetingStore((s) => s.joinDeniedMessage);
  const joinError = useMeetingStore((s) => s.joinError);
  const setMeetingId = useMeetingStore((s) => s.setMeetingId);
  const setParticipants = useMeetingStore((s) => s.setParticipants);
  const setWaitingForAdmission = useMeetingStore((s) => s.setWaitingForAdmission);
  const setAdmittedToMeeting = useMeetingStore((s) => s.setAdmittedToMeeting);
  const setJoinDeniedMessage = useMeetingStore((s) => s.setJoinDeniedMessage);
  const setJoinError = useMeetingStore((s) => s.setJoinError);
  const resetMeetingStore = useMeetingStore((s) => s.reset);

  const status = useTranslationStore((s) => s.status);
  const subtitle = useTranslationStore((s) => s.subtitle);
  const activeTranscript = useTranslationStore((s) => s.activeTranscript);
  const resetTranslationStore = useTranslationStore((s) => s.reset);

  // ── local state ─────────────────────────────────────────────────────────
  const participantIdRef = useRef(user?.id ?? crypto.randomUUID());
  const hasSentJoinRef = useRef(false);

  const [preferredLanguage, setPreferredLanguage] = useState<SupportedLanguageCode>(initialLanguage);
  const [sourceLanguage, setSourceLanguage] = useState<SupportedLanguageCode>(initialLanguage);
  const [meeting, setMeeting] = useState<MeetingRecord | null>(null);
  const [broadcastState, setBroadcastState] = useState<BroadcastState>("idle");
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [fileDuration, setFileDuration] = useState<number | null>(null);
  const [playbackProgress, setPlaybackProgress] = useState(0);
  const [showScript, setShowScript] = useState(true);
  const [transcriptLines, setTranscriptLines] = useState<TranscriptLine[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const transcriptIdRef = useRef(0);

  const audioContextRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const stopBroadcastRef = useRef<(() => void) | null>(null);

  // ── hooks ────────────────────────────────────────────────────────────────
  const socket = useSocket();
  const vad = useVAD();

  // File upload creates a silent MediaStream so WebRTC handshake works
  const silentStreamRef = useRef<MediaStream | null>(null);
  const { remoteStreams } = useWebRTC(socket, participants);
  useTranslatedAudio(socket);

  // ── meeting fetch ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!token || !meetingId) return;
    fetch(`${apiUrl}/meetings/${meetingId}`, { headers: createAuthHeaders(token) })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data?.meeting) setMeeting(data.meeting); })
      .catch(() => {});
  }, [meetingId, token]);

  // ── join / knock — wait for meeting to load so isHost is computed correctly ──
  // (same guard as Meet.tsx: !socket || !meeting || !user)
  const isHost = Boolean(user && meeting && user.id === meeting.hostUserId);

  useEffect(() => {
    if (!socket || !meeting || !user || hasSentJoinRef.current) return;
    hasSentJoinRef.current = true;
    setMeetingId(meetingId);
    setJoinDeniedMessage(null);

    if (isHost) {
      // Host joins immediately — no knock needed
      socket.emit(SOCKET_EVENTS.MEETING_JOIN, {
        meetingId,
        participantId: user.id,
        displayName: user.displayName,
        preferredLanguage
      });
      setWaitingForAdmission(false);
      setAdmittedToMeeting(true);
    } else {
      // Everyone else knocks and waits
      socket.emit(SOCKET_EVENTS.PARTICIPANT_KNOCK, {
        meetingId,
        participantId: participantIdRef.current,
        displayName,
        preferredLanguage,
        inviteToken: effectiveInviteToken ?? undefined
      });
      setWaitingForAdmission(true);
      setAdmittedToMeeting(false);
    }
  }, [socket, meeting, user, isHost, meetingId, displayName, preferredLanguage,
      effectiveInviteToken, setMeetingId, setJoinDeniedMessage,
      setWaitingForAdmission, setAdmittedToMeeting]);

  // ── language change ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!socket || !meetingId || !admittedToMeeting) return;
    socket.emit(SOCKET_EVENTS.LANGUAGE_CHANGE, {
      meetingId,
      participantId: participantIdRef.current,
      preferredLanguage
    });
  }, [preferredLanguage, socket, meetingId, admittedToMeeting]);

  // ── socket events ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    const handleMeetingState = ({ participants: p }: { participants: Participant[] }) => {
      const withoutLocal = p.filter((x) => x.socketId !== socket.id);
      const localParticipant: Participant = {
        socketId: "local",
        participantId: participantIdRef.current,
        displayName,
        preferredLanguage,
        isMuted: false,
        isSpeaking: false
      };
      setParticipants([localParticipant, ...withoutLocal]);
    };

    const handleKnockAccepted = () => {
      setWaitingForAdmission(false);
      setAdmittedToMeeting(true);
      socket.emit(SOCKET_EVENTS.MEETING_JOIN, {
        meetingId,
        participantId: participantIdRef.current,
        displayName,
        preferredLanguage
      });
    };

    const handleKnockDenied = ({ reason }: { reason?: string }) => {
      setWaitingForAdmission(false);
      setJoinDeniedMessage(reason ?? "The host has declined your request to join.");
    };

    const handleHostJoinSuccess = () => setAdmittedToMeeting(true);
    const handleHostJoinError = ({ message, code }: { message: string; code: string }) =>
      setJoinError(message, code);

    const handleWaitingRoomUpdate = ({ waitingParticipants }: { waitingParticipants: WaitingParticipant[] }) => {
      useMeetingStore.setState({ waitingParticipants });
    };

    // Listen for translated results to build transcript log
    const handleAudioTranslated = (result: {
      participantId: string;
      sourceLanguage: string;
      targetLanguage: string;
      transcript: string;
      translatedText: string;
    }) => {
      const isMyTranslation = result.participantId === participantIdRef.current;
      setTranscriptLines((prev) => [
        ...prev,
        {
          id: ++transcriptIdRef.current,
          speaker: isMyTranslation ? displayName : "Remote",
          sourceText: result.transcript,
          translatedText: result.translatedText,
          sourceLang: result.sourceLanguage,
          targetLang: result.targetLanguage,
          timestamp: Date.now(),
          isIncoming: !isMyTranslation
        }
      ]);
    };

    const handleTranslationStatus = (payload: { transcript: string }) => {
      // Also captured for transcript from TRANSLATION_STATUS
    };

    socket.on(SOCKET_EVENTS.MEETING_STATE, handleMeetingState);
    socket.on(SOCKET_EVENTS.KNOCK_ACCEPTED, handleKnockAccepted);
    socket.on(SOCKET_EVENTS.KNOCK_DENIED, handleKnockDenied);
    socket.on(SOCKET_EVENTS.HOST_JOIN_SUCCESS, handleHostJoinSuccess);
    socket.on(SOCKET_EVENTS.HOST_JOIN_ERROR, handleHostJoinError);
    socket.on(SOCKET_EVENTS.WAITING_ROOM_UPDATE, handleWaitingRoomUpdate);
    socket.on(SOCKET_EVENTS.AUDIO_TRANSLATED, handleAudioTranslated);
    socket.on(SOCKET_EVENTS.TRANSLATION_STATUS, handleTranslationStatus);

    return () => {
      socket.off(SOCKET_EVENTS.MEETING_STATE, handleMeetingState);
      socket.off(SOCKET_EVENTS.KNOCK_ACCEPTED, handleKnockAccepted);
      socket.off(SOCKET_EVENTS.KNOCK_DENIED, handleKnockDenied);
      socket.off(SOCKET_EVENTS.HOST_JOIN_SUCCESS, handleHostJoinSuccess);
      socket.off(SOCKET_EVENTS.HOST_JOIN_ERROR, handleHostJoinError);
      socket.off(SOCKET_EVENTS.WAITING_ROOM_UPDATE, handleWaitingRoomUpdate);
      socket.off(SOCKET_EVENTS.AUDIO_TRANSLATED, handleAudioTranslated);
      socket.off(SOCKET_EVENTS.TRANSLATION_STATUS, handleTranslationStatus);
    };
  }, [socket, meetingId, displayName, preferredLanguage, setParticipants, setWaitingForAdmission,
      setAdmittedToMeeting, setJoinDeniedMessage, setJoinError]);

  // (waiting room state is now set directly in the join effect above)

  // ── cleanup ───────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      stopBroadcastRef.current?.();
      resetMeetingStore();
      resetTranslationStore();
      sessionStorage.removeItem(`meeting_join_state_${meetingId}`);
    };
  }, [meetingId, resetMeetingStore, resetTranslationStore]);

  // ─── file handling ────────────────────────────────────────────────────────

  const handleFileSelect = useCallback((file: File) => {
    if (!file.type.startsWith("audio/")) return;
    setAudioFile(file);
    setBroadcastState("idle");
    setPlaybackProgress(0);

    // Probe duration
    const tmp = new Audio(URL.createObjectURL(file));
    tmp.addEventListener("loadedmetadata", () => {
      setFileDuration(tmp.duration);
      URL.revokeObjectURL(tmp.src);
    });
  }, []);

  const onFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFileSelect(f);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFileSelect(f);
  };

  // ─── broadcast ────────────────────────────────────────────────────────────

  const stopBroadcast = useCallback(() => {
    sourceNodeRef.current?.stop();
    sourceNodeRef.current?.disconnect();
    workletNodeRef.current?.disconnect();
    audioContextRef.current?.close();
    sourceNodeRef.current = null;
    workletNodeRef.current = null;
    audioContextRef.current = null;
    setBroadcastState("done");
  }, []);

  stopBroadcastRef.current = stopBroadcast;

  const startBroadcast = useCallback(async () => {
    if (!audioFile || !socket || !admittedToMeeting) return;

    setBroadcastState("playing");
    setPlaybackProgress(0);

    try {
      const arrayBuffer = await audioFile.arrayBuffer();
      const ctx = new AudioContext({ sampleRate: 16000 });
      audioContextRef.current = ctx;

      await registerAudioWorklet(ctx);

      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      const totalSamples = audioBuffer.length;

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      sourceNodeRef.current = source;

      const worklet = new AudioWorkletNode(ctx, "pcm-processor");
      workletNodeRef.current = worklet;

      let samplesProcessed = 0;

      worklet.port.onmessage = (e: MessageEvent<Float32Array>) => {
        const chunk: Float32Array = e.data;
        samplesProcessed += chunk.length;

        const averageLevel = chunk.reduce((s, v) => s + Math.abs(v), 0) / chunk.length;
        const audioBase64 = float32ToBase64(chunk);

        // Progress
        if (totalSamples > 0) {
          setPlaybackProgress(Math.min(samplesProcessed / totalSamples, 1));
        }

        // Same event the microphone uses — server handles identically
        socket.emit(SOCKET_EVENTS.AUDIO_CHUNK, {
          meetingId,
          participantId: participantIdRef.current,
          sourceLanguage,
          audioBase64,
          averageLevel
        });
      };

      source.connect(worklet);
      // Do NOT connect to destination — we don't want to hear our own file played back
      worklet.connect(ctx.destination); // worklet needs a downstream node to stay active

      source.onended = () => {
        setPlaybackProgress(1);
        stopBroadcast();
      };

      source.start();
    } catch (err) {
      console.error("Broadcast error", err);
      setBroadcastState("error");
    }
  }, [audioFile, socket, admittedToMeeting, meetingId, sourceLanguage, stopBroadcast]);

  // ─── leave ────────────────────────────────────────────────────────────────

  const handleLeave = () => {
    stopBroadcast();
    navigate("/");
  };

  // ─── rendering gates ──────────────────────────────────────────────────────

  if (!token) {
    return (
      <div className="am-gate">
        <div className="am-gate__card">
          <p className="am-gate__title">Sign in required</p>
          <button className="am-btn am-btn--primary" onClick={() => navigate("/auth")}>Go to sign in</button>
        </div>
      </div>
    );
  }

  if (joinError) {
    return (
      <div className="am-gate">
        <div className="am-gate__card">
          <p className="am-gate__title am-gate__title--error">Cannot join</p>
          <p className="am-gate__body">{joinError}</p>
          <button className="am-btn am-btn--primary" onClick={() => navigate("/")}>Back home</button>
        </div>
      </div>
    );
  }

  if (joinDeniedMessage) {
    return (
      <div className="am-gate">
        <div className="am-gate__card">
          <p className="am-gate__title am-gate__title--error">Access denied</p>
          <p className="am-gate__body">{joinDeniedMessage}</p>
          <button className="am-btn am-btn--primary" onClick={() => navigate("/")}>Back home</button>
        </div>
      </div>
    );
  }

  if (waitingForAdmission) {
    return (
      <div className="am-gate">
        <div className="am-gate__card am-gate__card--waiting">
          <div className="am-pulse" />
          <p className="am-gate__title">Waiting for host</p>
          <p className="am-gate__body">Your request to join has been sent. Hold on…</p>
        </div>
      </div>
    );
  }

  const otherParticipants = participants.filter((p) => p.socketId !== "local");
  const statusColor = status === "idle" ? "#64748b" : status === "capturing" ? "#0ea5e9" : status === "translating" ? "#f59e0b" : "#10b981";
  const statusLabel = { idle: "Idle", capturing: "Capturing", translating: "Translating", ready: "Ready" }[status];

  return (
    <>
      <style>{CSS}</style>

      <div className="am-root">
        {/* ── top bar ── */}
        <header className="am-topbar">
          <div className="am-topbar__left">
            <div className="am-topbar__logo">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <circle cx="10" cy="10" r="9" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M6 10.5 L9 13.5 L14 7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              AudioMeet
            </div>
            <span className="am-topbar__id">#{meetingId.slice(0, 8)}</span>
          </div>
          <div className="am-topbar__right">
            <div className="am-status-pill" style={{ "--sc": statusColor } as React.CSSProperties}>
              <span className="am-status-pill__dot" />
              {statusLabel}
            </div>
            <div className="am-avatar">{displayName.charAt(0).toUpperCase()}</div>
            <button className="am-btn am-btn--danger am-btn--sm" onClick={handleLeave}>Leave</button>
          </div>
        </header>

        <main className="am-layout">
          {/* ── left: broadcast panel ── */}
          <section className="am-panel am-panel--broadcast">
            <h2 className="am-panel__heading">
              <span className="am-panel__heading-icon">📤</span>
              Your broadcast
            </h2>

            {/* language selectors */}
            <div className="am-lang-row">
              <div className="am-lang-field">
                <label className="am-label">Speak language</label>
                <select
                  className="am-select"
                  value={sourceLanguage}
                  onChange={(e) => setSourceLanguage(e.target.value as SupportedLanguageCode)}
                >
                  <option value="en">English</option>
                  <option value="hi">Hindi</option>
                  <option value="pa">Punjabi</option>
                </select>
              </div>
              <div className="am-lang-arrow">→</div>
              <div className="am-lang-field">
                <label className="am-label">Receive in</label>
                <select
                  className="am-select"
                  value={preferredLanguage}
                  onChange={(e) => setPreferredLanguage(e.target.value as SupportedLanguageCode)}
                >
                  <option value="en">English</option>
                  <option value="hi">Hindi</option>
                  <option value="pa">Punjabi</option>
                </select>
              </div>
            </div>

            {/* file drop zone */}
            <div
              className={`am-dropzone${isDragging ? " am-dropzone--drag" : ""}${audioFile ? " am-dropzone--has-file" : ""}`}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={onDrop}
            >
              {audioFile ? (
                <div className="am-dropzone__file">
                  <span className="am-dropzone__file-icon">🎵</span>
                  <div className="am-dropzone__file-info">
                    <span className="am-dropzone__file-name">{audioFile.name}</span>
                    <span className="am-dropzone__file-meta">
                      {fileDuration != null ? formatTime(fileDuration) : "–"}
                      {" · "}
                      {(audioFile.size / 1024 / 1024).toFixed(1)} MB
                    </span>
                  </div>
                  <button
                    className="am-dropzone__remove"
                    onClick={() => { setAudioFile(null); setFileDuration(null); setBroadcastState("idle"); }}
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <>
                  <span className="am-dropzone__icon">🎙</span>
                  <p className="am-dropzone__text">Drop an audio file here</p>
                  <p className="am-dropzone__sub">mp3, wav, ogg, m4a — any browser-decodable format</p>
                  <label className="am-btn am-btn--ghost am-btn--sm" style={{ cursor: "pointer", marginTop: "0.75rem" }}>
                    Browse files
                    <input type="file" accept="audio/*" style={{ display: "none" }} onChange={onFileInput} />
                  </label>
                </>
              )}
            </div>

            {/* progress bar */}
            {(broadcastState === "playing" || broadcastState === "done") && (
              <div className="am-progress">
                <div className="am-progress__bar" style={{ width: `${playbackProgress * 100}%` }} />
                <span className="am-progress__label">
                  {broadcastState === "done"
                    ? "Broadcast complete"
                    : fileDuration != null
                      ? `${formatTime(playbackProgress * fileDuration)} / ${formatTime(fileDuration)}`
                      : "Broadcasting…"}
                </span>
              </div>
            )}

            {broadcastState === "error" && (
              <p className="am-error">Failed to decode file. Try a different format.</p>
            )}

            {/* broadcast controls */}
            <div className="am-broadcast-controls">
              {broadcastState === "idle" || broadcastState === "done" || broadcastState === "error" ? (
                <button
                  className="am-btn am-btn--primary am-btn--broadcast"
                  disabled={!audioFile || !admittedToMeeting}
                  onClick={startBroadcast}
                >
                  {broadcastState === "done" ? "Broadcast again" : "▶ Broadcast to meeting"}
                </button>
              ) : (
                <button className="am-btn am-btn--danger am-btn--broadcast" onClick={stopBroadcast}>
                  ⏹ Stop broadcast
                </button>
              )}
              {!admittedToMeeting && (
                <p className="am-hint">Waiting for meeting access before you can broadcast…</p>
              )}
            </div>

            {/* participants */}
            <div className="am-participants">
              <h3 className="am-participants__heading">
                In meeting
                <span className="am-participants__count">{participants.length}</span>
              </h3>
              {participants.map((p) => (
                <div key={p.socketId} className="am-participant">
                  <div className="am-participant__avatar">
                    {p.displayName.charAt(0).toUpperCase()}
                  </div>
                  <div className="am-participant__info">
                    <span className="am-participant__name">
                      {p.displayName}
                      {p.socketId === "local" && <span className="am-participant__you">(you)</span>}
                    </span>
                    <span className="am-participant__lang">{p.preferredLanguage.toUpperCase()}</span>
                  </div>
                  {p.isSpeaking && <span className="am-participant__speaking" />}
                </div>
              ))}
            </div>
          </section>

          {/* ── right: translation panel ── */}
          <section className="am-panel am-panel--translation">
            <div className="am-panel__heading-row">
              <h2 className="am-panel__heading">
                <span className="am-panel__heading-icon">🌐</span>
                Translation stream
              </h2>
              <button
                className={`am-toggle${showScript ? " am-toggle--on" : ""}`}
                onClick={() => setShowScript((v) => !v)}
                title="Toggle script panel"
              >
                {showScript ? "Hide script" : "Show script"}
              </button>
            </div>

            {/* live subtitle/transcript */}
            <div className="am-live-box">
              <div className="am-live-box__header">
                <span className="am-live-dot" />
                Live
              </div>
              <div className="am-live-box__content">
                {subtitle ? (
                  <p className="am-live-box__subtitle">{subtitle}</p>
                ) : activeTranscript ? (
                  <p className="am-live-box__transcript">{activeTranscript}</p>
                ) : (
                  <p className="am-live-box__empty">
                    {status === "idle"
                      ? "Translated speech will appear here…"
                      : status === "translating"
                        ? "Translating incoming audio…"
                        : "Waiting for next utterance…"}
                  </p>
                )}
              </div>
            </div>

            {/* script / log */}
            {showScript && (
              <div className="am-script">
                <div className="am-script__header">
                  <h3 className="am-script__title">Session transcript</h3>
                  {transcriptLines.length > 0 && (
                    <button className="am-btn am-btn--ghost am-btn--xs" onClick={() => setTranscriptLines([])}>
                      Clear
                    </button>
                  )}
                </div>
                <div className="am-script__body">
                  {transcriptLines.length === 0 ? (
                    <p className="am-script__empty">
                      Transcript lines appear here as translations complete.
                      Each entry shows the original + translated text.
                    </p>
                  ) : (
                    transcriptLines.map((line) => (
                      <div
                        key={line.id}
                        className={`am-line${line.isIncoming ? " am-line--incoming" : " am-line--outgoing"}`}
                      >
                        <div className="am-line__meta">
                          <span className="am-line__speaker">{line.speaker}</span>
                          <span className="am-line__langs">
                            {line.sourceLang.toUpperCase()} → {line.targetLang.toUpperCase()}
                          </span>
                          <span className="am-line__time">
                            {new Date(line.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                        <p className="am-line__source">{line.sourceText}</p>
                        {line.translatedText && line.translatedText !== line.sourceText && (
                          <p className="am-line__translated">{line.translatedText}</p>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* incoming streams indicator */}
            {Object.keys(remoteStreams).length > 0 && (
              <div className="am-incoming">
                <span className="am-incoming__icon">🔊</span>
                <span>{Object.keys(remoteStreams).length} participant(s) streaming audio</span>
              </div>
            )}
          </section>
        </main>
      </div>

      <TranslationOverlay subtitle={subtitle} />
    </>
  );
};

// ─── CSS ──────────────────────────────────────────────────────────────────────

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Mono:ital,wght@0,300;0,400;0,500;1,300&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,500;0,9..40,600;1,9..40,300&display=swap');

  .am-root {
    min-height: 100vh;
    background: #0b0f1a;
    background-image:
      radial-gradient(ellipse 80% 50% at 20% 0%, rgba(14,165,233,0.07) 0%, transparent 60%),
      radial-gradient(ellipse 60% 40% at 80% 100%, rgba(20,184,166,0.06) 0%, transparent 60%);
    font-family: 'DM Sans', sans-serif;
    color: #e2e8f0;
  }

  /* ── top bar ── */
  .am-topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.875rem 1.5rem;
    border-bottom: 1px solid rgba(255,255,255,0.07);
    backdrop-filter: blur(12px);
    background: rgba(11,15,26,0.8);
    position: sticky;
    top: 0;
    z-index: 20;
  }
  .am-topbar__left { display: flex; align-items: center; gap: 1rem; }
  .am-topbar__logo {
    display: flex; align-items: center; gap: 0.5rem;
    font-family: 'DM Mono', monospace;
    font-size: 0.875rem;
    font-weight: 500;
    color: #38bdf8;
    letter-spacing: -0.01em;
  }
  .am-topbar__id {
    font-family: 'DM Mono', monospace;
    font-size: 0.75rem;
    color: #475569;
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.07);
    padding: 0.2rem 0.6rem;
    border-radius: 6px;
  }
  .am-topbar__right { display: flex; align-items: center; gap: 0.75rem; }
  .am-avatar {
    width: 32px; height: 32px;
    border-radius: 50%;
    background: linear-gradient(135deg, #0ea5e9, #14b8a6);
    display: flex; align-items: center; justify-content: center;
    font-size: 0.75rem; font-weight: 600; color: white;
  }

  /* ── status pill ── */
  .am-status-pill {
    display: flex; align-items: center; gap: 0.375rem;
    font-family: 'DM Mono', monospace;
    font-size: 0.7rem;
    padding: 0.25rem 0.625rem;
    border-radius: 20px;
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.08);
    color: var(--sc, #64748b);
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }
  .am-status-pill__dot {
    width: 6px; height: 6px; border-radius: 50%;
    background: var(--sc, #64748b);
    box-shadow: 0 0 6px var(--sc, #64748b);
  }

  /* ── layout ── */
  .am-layout {
    display: grid;
    grid-template-columns: 380px 1fr;
    gap: 1.5rem;
    padding: 1.5rem;
    max-width: 1280px;
    margin: 0 auto;
  }
  @media (max-width: 900px) {
    .am-layout { grid-template-columns: 1fr; }
  }

  /* ── panels ── */
  .am-panel {
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.07);
    border-radius: 20px;
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }
  .am-panel__heading {
    display: flex; align-items: center; gap: 0.5rem;
    font-size: 0.9rem; font-weight: 600;
    color: #cbd5e1;
    margin: 0;
  }
  .am-panel__heading-icon { font-size: 1rem; }
  .am-panel__heading-row {
    display: flex; align-items: center; justify-content: space-between;
  }

  /* ── language row ── */
  .am-lang-row {
    display: flex; align-items: flex-end; gap: 0.75rem;
  }
  .am-lang-field { display: flex; flex-direction: column; gap: 0.375rem; flex: 1; }
  .am-lang-arrow { color: #475569; font-size: 1.25rem; padding-bottom: 0.6rem; }
  .am-label {
    font-size: 0.7rem;
    font-family: 'DM Mono', monospace;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: #475569;
  }
  .am-select {
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 10px;
    color: #e2e8f0;
    padding: 0.5rem 0.75rem;
    font-size: 0.875rem;
    font-family: 'DM Sans', sans-serif;
    outline: none;
    cursor: pointer;
  }
  .am-select:focus { border-color: #0ea5e9; }

  /* ── dropzone ── */
  .am-dropzone {
    border: 2px dashed rgba(255,255,255,0.1);
    border-radius: 16px;
    padding: 2rem 1.5rem;
    text-align: center;
    transition: border-color 0.2s, background 0.2s;
    display: flex; flex-direction: column; align-items: center; gap: 0.5rem;
  }
  .am-dropzone--drag {
    border-color: #0ea5e9;
    background: rgba(14,165,233,0.05);
  }
  .am-dropzone--has-file {
    border-style: solid;
    border-color: rgba(20,184,166,0.3);
    background: rgba(20,184,166,0.04);
    text-align: left;
    flex-direction: row;
    padding: 1rem 1.25rem;
  }
  .am-dropzone__icon { font-size: 2rem; }
  .am-dropzone__text { font-size: 0.875rem; color: #94a3b8; font-weight: 500; }
  .am-dropzone__sub { font-size: 0.75rem; color: #475569; }
  .am-dropzone__file {
    display: flex; align-items: center; gap: 0.75rem; width: 100%;
  }
  .am-dropzone__file-icon { font-size: 1.5rem; flex-shrink: 0; }
  .am-dropzone__file-info {
    display: flex; flex-direction: column; gap: 0.2rem; flex: 1; min-width: 0;
  }
  .am-dropzone__file-name {
    font-size: 0.8rem; font-weight: 500; color: #e2e8f0;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .am-dropzone__file-meta {
    font-family: 'DM Mono', monospace;
    font-size: 0.7rem; color: #475569;
  }
  .am-dropzone__remove {
    background: none; border: none; color: #475569;
    cursor: pointer; font-size: 0.875rem; padding: 0.25rem;
    border-radius: 6px; flex-shrink: 0;
  }
  .am-dropzone__remove:hover { color: #f87171; background: rgba(248,113,113,0.1); }

  /* ── progress ── */
  .am-progress {
    background: rgba(255,255,255,0.05);
    border-radius: 10px;
    overflow: hidden;
    position: relative;
    height: 36px;
    display: flex; align-items: center;
  }
  .am-progress__bar {
    position: absolute; left: 0; top: 0; bottom: 0;
    background: linear-gradient(90deg, #0ea5e9, #14b8a6);
    border-radius: 10px;
    transition: width 0.1s linear;
    opacity: 0.4;
  }
  .am-progress__label {
    position: relative; z-index: 1;
    padding: 0 0.875rem;
    font-family: 'DM Mono', monospace;
    font-size: 0.72rem; color: #94a3b8;
  }

  /* ── broadcast controls ── */
  .am-broadcast-controls { display: flex; flex-direction: column; gap: 0.5rem; }
  .am-hint { font-size: 0.72rem; color: #475569; text-align: center; }
  .am-error { font-size: 0.8rem; color: #f87171; background: rgba(248,113,113,0.08);
    padding: 0.5rem 0.75rem; border-radius: 8px; }

  /* ── buttons ── */
  .am-btn {
    display: inline-flex; align-items: center; justify-content: center; gap: 0.4rem;
    border: none; cursor: pointer; font-family: 'DM Sans', sans-serif;
    font-weight: 600; border-radius: 10px; transition: opacity 0.15s, transform 0.1s;
    text-decoration: none;
  }
  .am-btn:active { transform: scale(0.97); }
  .am-btn:disabled { opacity: 0.38; cursor: not-allowed; transform: none; }
  .am-btn--primary { background: linear-gradient(135deg, #0ea5e9, #0284c7); color: white; padding: 0.625rem 1.25rem; font-size: 0.875rem; }
  .am-btn--primary:hover:not(:disabled) { opacity: 0.88; }
  .am-btn--danger { background: rgba(239,68,68,0.15); color: #f87171; border: 1px solid rgba(239,68,68,0.2); padding: 0.4rem 0.875rem; font-size: 0.8rem; }
  .am-btn--danger:hover:not(:disabled) { background: rgba(239,68,68,0.25); }
  .am-btn--ghost { background: rgba(255,255,255,0.06); color: #94a3b8; border: 1px solid rgba(255,255,255,0.08); padding: 0.375rem 0.75rem; font-size: 0.8rem; }
  .am-btn--ghost:hover { background: rgba(255,255,255,0.1); }
  .am-btn--broadcast { width: 100%; padding: 0.75rem; font-size: 0.9rem; border-radius: 12px; }
  .am-btn--sm { padding: 0.3rem 0.7rem; font-size: 0.78rem; }
  .am-btn--xs { padding: 0.2rem 0.5rem; font-size: 0.72rem; }

  /* ── toggle ── */
  .am-toggle {
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 8px;
    color: #64748b;
    cursor: pointer;
    font-family: 'DM Mono', monospace;
    font-size: 0.7rem;
    letter-spacing: 0.04em;
    padding: 0.3rem 0.625rem;
    transition: all 0.15s;
    text-transform: uppercase;
  }
  .am-toggle--on { color: #38bdf8; border-color: rgba(56,189,248,0.3); background: rgba(56,189,248,0.06); }

  /* ── participants ── */
  .am-participants { display: flex; flex-direction: column; gap: 0.5rem; }
  .am-participants__heading {
    font-size: 0.72rem; font-family: 'DM Mono', monospace;
    text-transform: uppercase; letter-spacing: 0.06em;
    color: #475569; display: flex; align-items: center; gap: 0.5rem;
    margin: 0;
  }
  .am-participants__count {
    background: rgba(255,255,255,0.06); border-radius: 20px;
    padding: 0.1rem 0.45rem; font-size: 0.65rem;
  }
  .am-participant {
    display: flex; align-items: center; gap: 0.625rem;
    padding: 0.5rem 0.625rem;
    background: rgba(255,255,255,0.02);
    border: 1px solid rgba(255,255,255,0.05);
    border-radius: 10px;
  }
  .am-participant__avatar {
    width: 28px; height: 28px; border-radius: 50%;
    background: linear-gradient(135deg, #1e3a5f, #0f766e);
    display: flex; align-items: center; justify-content: center;
    font-size: 0.7rem; font-weight: 600; flex-shrink: 0;
  }
  .am-participant__info { display: flex; flex-direction: column; gap: 0.1rem; flex: 1; }
  .am-participant__name { font-size: 0.8rem; color: #cbd5e1; }
  .am-participant__you { color: #475569; font-size: 0.72rem; margin-left: 0.3rem; }
  .am-participant__lang {
    font-family: 'DM Mono', monospace;
    font-size: 0.65rem; color: #475569;
  }
  .am-participant__speaking {
    width: 8px; height: 8px; border-radius: 50%;
    background: #10b981; box-shadow: 0 0 8px #10b981;
    animation: pulse 1.2s infinite;
  }

  /* ── live box ── */
  .am-live-box {
    background: rgba(255,255,255,0.025);
    border: 1px solid rgba(255,255,255,0.07);
    border-radius: 16px;
    overflow: hidden;
    min-height: 120px;
  }
  .am-live-box__header {
    display: flex; align-items: center; gap: 0.375rem;
    padding: 0.5rem 1rem;
    background: rgba(255,255,255,0.03);
    border-bottom: 1px solid rgba(255,255,255,0.05);
    font-family: 'DM Mono', monospace;
    font-size: 0.68rem; text-transform: uppercase;
    letter-spacing: 0.08em; color: #475569;
  }
  .am-live-dot {
    width: 6px; height: 6px; border-radius: 50%;
    background: #10b981; box-shadow: 0 0 6px #10b981;
    animation: pulse 1.5s infinite;
  }
  .am-live-box__content { padding: 1rem; }
  .am-live-box__subtitle {
    font-size: 1rem; font-weight: 500;
    color: #38bdf8; line-height: 1.6; margin: 0;
  }
  .am-live-box__transcript {
    font-size: 0.875rem; color: #94a3b8;
    font-style: italic; line-height: 1.6; margin: 0;
  }
  .am-live-box__empty {
    font-size: 0.8rem; color: #334155;
    line-height: 1.6; margin: 0;
  }

  /* ── script / transcript ── */
  .am-script {
    background: rgba(255,255,255,0.02);
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 16px;
    overflow: hidden;
    flex: 1;
    display: flex; flex-direction: column;
    min-height: 200px;
  }
  .am-script__header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 0.625rem 1rem;
    background: rgba(255,255,255,0.025);
    border-bottom: 1px solid rgba(255,255,255,0.05);
  }
  .am-script__title {
    font-family: 'DM Mono', monospace;
    font-size: 0.68rem; text-transform: uppercase;
    letter-spacing: 0.08em; color: #475569; margin: 0;
  }
  .am-script__body {
    padding: 0.75rem;
    overflow-y: auto;
    flex: 1;
    display: flex; flex-direction: column; gap: 0.625rem;
    max-height: 400px;
  }
  .am-script__empty {
    font-size: 0.78rem; color: #334155;
    line-height: 1.7; text-align: center; padding: 1.5rem 1rem;
    margin: 0;
  }

  /* ── transcript lines ── */
  .am-line {
    padding: 0.625rem 0.75rem;
    border-radius: 10px;
    border-left: 3px solid transparent;
  }
  .am-line--outgoing {
    background: rgba(14,165,233,0.06);
    border-left-color: #0ea5e9;
  }
  .am-line--incoming {
    background: rgba(20,184,166,0.06);
    border-left-color: #14b8a6;
  }
  .am-line__meta {
    display: flex; align-items: center; gap: 0.5rem;
    margin-bottom: 0.35rem;
  }
  .am-line__speaker { font-size: 0.72rem; font-weight: 600; color: #94a3b8; }
  .am-line__langs {
    font-family: 'DM Mono', monospace;
    font-size: 0.65rem; color: #475569;
    background: rgba(255,255,255,0.04);
    padding: 0.1rem 0.4rem; border-radius: 4px;
  }
  .am-line__time {
    font-family: 'DM Mono', monospace;
    font-size: 0.62rem; color: #334155; margin-left: auto;
  }
  .am-line__source { font-size: 0.8rem; color: #64748b; margin: 0 0 0.25rem; font-style: italic; }
  .am-line__translated { font-size: 0.85rem; color: #cbd5e1; margin: 0; font-weight: 500; }

  /* ── incoming badge ── */
  .am-incoming {
    display: flex; align-items: center; gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    background: rgba(20,184,166,0.08);
    border: 1px solid rgba(20,184,166,0.15);
    border-radius: 10px;
    font-size: 0.78rem; color: #2dd4bf;
  }

  /* ── gate screens ── */
  .am-gate {
    min-height: 100vh;
    background: #0b0f1a;
    display: flex; align-items: center; justify-content: center;
    font-family: 'DM Sans', sans-serif;
  }
  .am-gate__card {
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 24px;
    padding: 2.5rem;
    text-align: center;
    max-width: 360px;
    width: 100%;
    display: flex; flex-direction: column; gap: 1rem;
  }
  .am-gate__card--waiting { align-items: center; }
  .am-gate__title {
    font-size: 1.1rem; font-weight: 600; color: #e2e8f0; margin: 0;
  }
  .am-gate__title--error { color: #f87171; }
  .am-gate__body { font-size: 0.875rem; color: #64748b; margin: 0; line-height: 1.6; }

  /* ── pulse animation ── */
  .am-pulse {
    width: 48px; height: 48px; border-radius: 50%;
    background: rgba(14,165,233,0.15);
    border: 2px solid rgba(14,165,233,0.3);
    animation: am-pulse-ring 1.8s infinite;
  }
  @keyframes am-pulse-ring {
    0% { transform: scale(0.9); opacity: 1; }
    70% { transform: scale(1.1); opacity: 0.6; }
    100% { transform: scale(0.9); opacity: 1; }
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }
`;

export default AudioMeet;