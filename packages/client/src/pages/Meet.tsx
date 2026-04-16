import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { SOCKET_EVENTS, type Participant, type SupportedLanguageCode, type TranslationResult } from "@multilang-call/shared";
import LanguageSelector from "../components/LanguageSelector";
import MeetingControls from "../components/MeetingControls";
import TranslationStatus from "../components/TranslationStatus";
import VideoGrid from "../components/VideoGrid";
import { useAudioPlayer } from "../hooks/useAudioPlayer";
import { useSocket } from "../hooks/useSocket";
import { useVAD } from "../hooks/useVAD";
import { useWebRTC } from "../hooks/useWebRTC";
import { registerAudioWorklet } from "../lib/audioWorklet";
import { useMeetingStore } from "../store/meetingStore";
import { useTranslationStore } from "../store/translationStore";
import { useUIStore } from "../store/uiStore";

const createLocalParticipant = (
  preferredLanguage: SupportedLanguageCode,
  displayName: string,
  isMuted: boolean,
  isSpeaking = false
): Participant => ({
  socketId: "local",
  participantId: "local-user",
  displayName,
  preferredLanguage,
  isMuted,
  isSpeaking
});

const Meet = () => {
  const { meetingId = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const displayName =
    (location.state as { displayName?: string } | null)?.displayName ?? "Guest";
  const initialLanguage =
    (location.state as { preferredLanguage?: SupportedLanguageCode } | null)
      ?.preferredLanguage ?? "en";
  const participantIdRef = useRef(crypto.randomUUID());
  const preferredLanguageRef = useRef(initialLanguage);
  const isMutedRef = useRef(false);
  const [preferredLanguage, setPreferredLanguage] =
    useState<SupportedLanguageCode>(initialLanguage);
  const socket = useSocket();
  const participants = useMeetingStore((state) => state.participants);
  const { localStream, remoteStreams, error } = useWebRTC(socket, participants);
  const vad = useVAD();
  const isMuted = useMeetingStore((state) => state.isMuted);
  const setMeetingId = useMeetingStore((state) => state.setMeetingId);
  const setParticipants = useMeetingStore((state) => state.setParticipants);
  const setMuted = useMeetingStore((state) => state.setMuted);
  const enqueueAudio = useUIStore((state) => state.enqueueAudio);
  const setStatus = useTranslationStore((state) => state.setStatus);

  useAudioPlayer();

  useEffect(() => {
    setMeetingId(meetingId);
  }, [meetingId, setMeetingId]);

  useEffect(() => {
    preferredLanguageRef.current = preferredLanguage;
  }, [preferredLanguage]);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  useEffect(() => {
    if (!socket) {
      return;
    }

    socket.emit(SOCKET_EVENTS.MEETING_JOIN, {
      meetingId,
      participantId: participantIdRef.current,
      displayName,
      preferredLanguage: initialLanguage
    });

    const handleMeetingState = (payload: {
      participants: Participant[];
      defaultLanguage?: SupportedLanguageCode;
    }) => {
      const localParticipant = createLocalParticipant(
        preferredLanguageRef.current,
        displayName,
        isMutedRef.current
      );
      const withoutLocal = payload.participants.filter(
        (participant) => participant.socketId !== socket.id
      );
      setParticipants([localParticipant, ...withoutLocal]);
    };

    const handleSpeakingStatus = ({
      socketId,
      isSpeaking
    }: {
      socketId: string;
      isSpeaking: boolean;
    }) => {
      setParticipants(
        useMeetingStore
          .getState()
          .participants
          .map((participant) =>
            participant.socketId === socketId ||
            (participant.socketId === "local" && socketId === socket.id)
              ? { ...participant, isSpeaking }
              : participant
          )
      );
    };

    const handleTranslatedAudio = (payload: TranslationResult) => {
      setStatus("ready");
      enqueueAudio({
        id: `${payload.participantId}-${Date.now()}`,
        participantId: payload.participantId,
        targetLanguage: payload.targetLanguage,
        audioBase64: payload.audioBase64,
        transcript: payload.translatedText
      });
    };

    socket.on(SOCKET_EVENTS.MEETING_STATE, handleMeetingState);
    socket.on(SOCKET_EVENTS.SPEAKING_STATUS, handleSpeakingStatus);
    socket.on(SOCKET_EVENTS.AUDIO_TRANSLATED, handleTranslatedAudio);

    return () => {
      socket.off(SOCKET_EVENTS.MEETING_STATE, handleMeetingState);
      socket.off(SOCKET_EVENTS.SPEAKING_STATUS, handleSpeakingStatus);
      socket.off(SOCKET_EVENTS.AUDIO_TRANSLATED, handleTranslatedAudio);
    };
  }, [
    displayName,
    enqueueAudio,
    meetingId,
    setParticipants,
    setStatus,
    socket,
    initialLanguage
  ]);

  useEffect(() => {
    if (!localStream || !socket) {
      return;
    }

    const audioTrack = localStream.getAudioTracks()[0];
    if (!audioTrack) {
      return;
    }

    let audioContext: AudioContext | null = null;
    let source: MediaStreamAudioSourceNode | null = null;
    let processor: AudioWorkletNode | null = null;
    let mounted = true;

    const bootstrap = async () => {
      audioContext = new AudioContext();
      await registerAudioWorklet(audioContext);
      source = audioContext.createMediaStreamSource(new MediaStream([audioTrack]));
      processor = new AudioWorkletNode(audioContext, "pcm-processor");
      processor.port.onmessage = (event: MessageEvent<Float32Array>) => {
        if (!mounted) {
          return;
        }

        const samples = event.data;
        const bytes = new Uint8Array(samples.length * 2);

        samples.forEach((sample, index) => {
          const pcm = Math.max(-1, Math.min(1, sample));
          const value = pcm < 0 ? pcm * 0x8000 : pcm * 0x7fff;
          const int16 = Math.round(value);
          bytes[index * 2] = int16 & 0xff;
          bytes[index * 2 + 1] = (int16 >> 8) & 0xff;
        });

        const averageLevel =
          samples.reduce((sum, sample) => sum + Math.abs(sample), 0) /
          Math.max(samples.length, 1);

        setStatus(vad.isLikelySilence(samples) ? "translating" : "capturing");

        let binary = "";
        bytes.forEach((byte) => {
          binary += String.fromCharCode(byte);
        });

        socket.emit(SOCKET_EVENTS.AUDIO_CHUNK, {
          meetingId,
          participantId: participantIdRef.current,
          sourceLanguage: preferredLanguage,
          audioBase64: btoa(binary),
          averageLevel
        });
      };

      const silentGain = audioContext.createGain();
      silentGain.gain.value = 0;
      source.connect(processor);
      processor.connect(silentGain);
      silentGain.connect(audioContext.destination);
    };

    void bootstrap();

    return () => {
      mounted = false;
      processor?.disconnect();
      source?.disconnect();
      void audioContext?.close();
    };
  }, [localStream, meetingId, preferredLanguage, setStatus, socket, vad]);

  const participantList = useMemo(
    () =>
      participants.length === 0
        ? [createLocalParticipant(preferredLanguage, displayName, isMuted)]
        : participants,
    [displayName, isMuted, participants, preferredLanguage]
  );

  const handleToggleMute = () => {
    const nextMuted = !isMuted;
    setMuted(nextMuted);
    localStream?.getAudioTracks().forEach((track) => {
      track.enabled = !nextMuted;
    });
    setParticipants(
      useMeetingStore.getState().participants.map((participant) =>
        participant.socketId === "local"
          ? { ...participant, isMuted: nextMuted }
          : participant
      )
    );
    socket?.emit(SOCKET_EVENTS.MUTE_STATUS, { meetingId, isMuted: nextMuted });
  };

  const handleLanguageChange = (nextLanguage: SupportedLanguageCode) => {
    setPreferredLanguage(nextLanguage);
    setParticipants(
      useMeetingStore.getState().participants.map((participant) =>
        participant.socketId === "local"
          ? { ...participant, preferredLanguage: nextLanguage }
          : participant
      )
    );
    socket?.emit(SOCKET_EVENTS.LANGUAGE_CHANGE, {
      meetingId,
      preferredLanguage: nextLanguage
    });
  };

  const handleLeave = () => {
    socket?.disconnect();
    navigate("/");
  };

  return (
    <main className="mx-auto max-w-7xl px-6 py-8">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="space-y-6">
          <header className="rounded-[32px] bg-white/90 p-6 shadow-panel">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-accent">
                  Meeting room
                </p>
                <h1 className="mt-2 text-3xl font-bold text-ink">{meetingId}</h1>
                <p className="mt-2 text-sm text-slate-600">
                  Original room audio stays at 20% volume while translated speech is queued
                  and played sequentially at full volume.
                </p>
                {error ? <p className="mt-3 text-sm text-rose-600">{error}</p> : null}
              </div>
              <div className="w-full max-w-xs">
                <LanguageSelector value={preferredLanguage} onChange={handleLanguageChange} />
              </div>
            </div>
          </header>
          <VideoGrid
            participants={participantList}
            localStream={localStream}
            remoteStreams={remoteStreams}
          />
          <MeetingControls
            isMuted={isMuted}
            onToggleMute={handleToggleMute}
            onLeave={handleLeave}
          />
        </section>
        <aside className="space-y-6">
          <TranslationStatus />
          <section className="rounded-3xl bg-white/90 p-5 shadow-panel">
            <h2 className="text-lg font-semibold text-ink">Participants</h2>
            <ul className="mt-4 space-y-3">
              {participantList.map((participant) => (
                <li
                  key={participant.socketId}
                  className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-semibold text-ink">{participant.displayName}</p>
                    <p className="text-xs uppercase tracking-[0.16em] text-slate-500">
                      {participant.preferredLanguage}
                    </p>
                  </div>
                  <span className="text-xs font-semibold text-slate-500">
                    {participant.isMuted ? "Muted" : "Live"}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </main>
  );
};

export default Meet;
