import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  SOCKET_EVENTS,
  type MeetingRecord,
  type Participant,
  type SupportedLanguageCode,
  type TranslationResult,
  type WaitingParticipant
} from "@multilang-call/shared";
import LanguageSelector from "../components/LanguageSelector";
import MeetingControls from "../components/MeetingControls";
import TranslationStatus from "../components/TranslationStatus";
import VideoGrid from "../components/VideoGrid";
import { useAudioPlayer } from "../hooks/useAudioPlayer";
import { useSocket } from "../hooks/useSocket";
import { useVAD } from "../hooks/useVAD";
import { useWebRTC } from "../hooks/useWebRTC";
import { apiUrl, createAuthHeaders } from "../lib/api";
import { registerAudioWorklet } from "../lib/audioWorklet";
import { useAuthStore } from "../store/authStore";
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
  const user = useAuthStore((state) => state.user);
  const token = useAuthStore((state) => state.token);
  const locationState = (location.state as {
    displayName?: string;
    preferredLanguage?: SupportedLanguageCode;
    inviteToken?: string;
    fromJoin?: boolean;
  } | null) ?? { fromJoin: false };

  // Bug 9: restore join state from sessionStorage on refresh
  const savedJoinState = useMemo(() => {
    const raw = sessionStorage.getItem(`meeting_join_state_${meetingId}`);
    if (!raw) return null;
    try { return JSON.parse(raw) as { displayName?: string; preferredLanguage?: string; inviteToken?: string }; }
    catch { return null; }
  }, [meetingId]);

  const displayName = locationState.displayName ?? savedJoinState?.displayName ?? user?.displayName ?? "Guest";
  const effectiveInviteToken = locationState.inviteToken ?? savedJoinState?.inviteToken ?? null;
  const initialLanguage = locationState.preferredLanguage ?? "en";
  const participantIdRef = useRef(user?.id ?? crypto.randomUUID());
  const preferredLanguageRef = useRef(initialLanguage);
  const isMutedRef = useRef(false);
  const hasSentJoinRef = useRef(false);
  const [preferredLanguage, setPreferredLanguage] =
    useState<SupportedLanguageCode>(initialLanguage);
  const [meeting, setMeeting] = useState<MeetingRecord | null>(null);
  const [meetingError, setMeetingError] = useState<string | null>(null);
  const admittedToMeeting = useMeetingStore((state) => state.admittedToMeeting);
  const setAdmittedToMeeting = useMeetingStore((state) => state.setAdmittedToMeeting);
  const setJoinError = useMeetingStore((state) => state.setJoinError);
  const [invitePanelOpen, setInvitePanelOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const socket = useSocket();
  const participants = useMeetingStore((state) => state.participants);
  const waitingParticipants = useMeetingStore((state) => state.waitingParticipants);
  const waitingForAdmission = useMeetingStore((state) => state.waitingForAdmission);
  const joinDeniedMessage = useMeetingStore((state) => state.joinDeniedMessage);
  const { localStream, remoteStreams, error } = useWebRTC(socket, participants);
  const vad = useVAD();
  const isMuted = useMeetingStore((state) => state.isMuted);
  const setMeetingId = useMeetingStore((state) => state.setMeetingId);
  const setParticipants = useMeetingStore((state) => state.setParticipants);
  const setMuted = useMeetingStore((state) => state.setMuted);
  const setWaitingParticipants = useMeetingStore((state) => state.setWaitingParticipants);
  const setWaitingForAdmission = useMeetingStore((state) => state.setWaitingForAdmission);
  const setJoinDeniedMessage = useMeetingStore((state) => state.setJoinDeniedMessage);
  const reset = useMeetingStore((state) => state.reset);
  const enqueueAudio = useUIStore((state) => state.enqueueAudio);
  const setStatus = useTranslationStore((state) => state.setStatus);

  const joinError = useMeetingStore((state) => state.joinError);
  const joinErrorCode = useMeetingStore((state) => state.joinErrorCode);

  useAudioPlayer();

  // Bug 9: persist join state for refresh recovery
  useEffect(() => {
    if (locationState.fromJoin) {
      sessionStorage.setItem(
        `meeting_join_state_${meetingId}`,
        JSON.stringify({
          displayName: locationState.displayName,
          preferredLanguage: locationState.preferredLanguage,
          inviteToken: locationState.inviteToken
        })
      );
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Bug 11: reset store on unmount
  useEffect(() => {
    return () => { reset(); };
  }, [reset]);


  const isHost = Boolean(user && meeting?.hostUserId === user.id);

  // Bug 2c: reset hasSentJoinRef when user.id changes so join fires correctly after re-auth
  useEffect(() => {
    hasSentJoinRef.current = false;
  }, [user?.id]);

  useEffect(() => {
    setMeetingId(meetingId);
  }, [meetingId, setMeetingId]);

  useEffect(() => {
    preferredLanguageRef.current = preferredLanguage;
  }, [preferredLanguage]);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  // Bug 5: gate fetch on user being hydrated, not just token
  useEffect(() => {
    if (!token || !user) {
      return;
    }

    fetch(`${apiUrl}/meetings/${meetingId}`, {
      headers: {
        ...createAuthHeaders(token)
      }
    })
      .then(async (response) => {
        const data = (await response.json()) as {
          meeting?: MeetingRecord;
          error?: string;
        };
        if (!response.ok || !data.meeting) {
          throw new Error(data.error ?? "Unable to load meeting");
        }

        setMeeting(data.meeting);
        if (data.meeting.defaultLanguage) {
          setPreferredLanguage((current) => current ?? data.meeting!.defaultLanguage);
        }
      })
      .catch((caughtError) => {
        setMeetingError(
          caughtError instanceof Error ? caughtError.message : "Unable to load meeting"
        );
      });
  }, [meetingId, token, user]);

  useEffect(() => {
    if (!toastMessage) {
      return;
    }

    const timeout = window.setTimeout(() => setToastMessage(null), 3000);
    return () => window.clearTimeout(timeout);
  }, [toastMessage]);

  useEffect(() => {
    if (!socket || !meeting || !user || hasSentJoinRef.current) {
      return;
    }

    hasSentJoinRef.current = true;
    setJoinDeniedMessage(null);

    if (isHost) {
      socket.emit(SOCKET_EVENTS.MEETING_JOIN, {
        meetingId,
        participantId: user.id,
        displayName: user.displayName,
        preferredLanguage
      });
      // admittedToMeeting will be set true by HOST_JOIN_SUCCESS event
      setWaitingForAdmission(false);
    } else {
      socket.emit(SOCKET_EVENTS.PARTICIPANT_KNOCK, {
        meetingId,
        participantId: participantIdRef.current,
        displayName,
        preferredLanguage,
        inviteToken: effectiveInviteToken
      });
      setWaitingForAdmission(true);
      setAdmittedToMeeting(false);
    }
  }, [
    displayName,
    effectiveInviteToken,
    isHost,
    meeting,
    meetingId,
    preferredLanguage,
    setJoinDeniedMessage,
    setWaitingForAdmission,
    socket,
    user
  ]);

  useEffect(() => {
    if (!socket) {      
      return;
    }

    const handleMeetingState = (payload: {
      participants: Participant[];
      defaultLanguage?: SupportedLanguageCode;
    }) => {
      const localParticipant = createLocalParticipant(
        preferredLanguageRef.current,
        isHost ? user?.displayName ?? displayName : displayName,
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

    const handleWaitingRoomUpdate = ({
      waitingParticipants: nextWaitingParticipants
    }: {
      waitingParticipants: WaitingParticipant[];
    }) => {
      setWaitingParticipants(nextWaitingParticipants);
    };

    const handleKnockAccepted = () => {
      setWaitingForAdmission(false);
      setJoinDeniedMessage(null);
      setAdmittedToMeeting(true);
    };

    const handleKnockDenied = ({ reason }: { reason?: string } = {}) => {
      setWaitingForAdmission(false);
      setJoinDeniedMessage(reason ?? "The host has declined your request to join.");
      setAdmittedToMeeting(false);
    };

    const handleHostJoinSuccess = () => {
      setAdmittedToMeeting(true);
      setWaitingForAdmission(false);
      setJoinError(null);
    };

    const handleHostJoinError = (data: { message: string; code: string }) => {
      setJoinError(data.message, data.code);
      setAdmittedToMeeting(false);
      if (data.code === "AUTH_REQUIRED") {
        navigate("/auth", { state: { redirectTo: `/meet/${meetingId}` } });
      }
    };

    const handleSocketError = (err: { code?: string; message?: string }) => {
      if (err.message) {
        setToastMessage(`Error: ${err.message}`);
      }
    };

    socket.on(SOCKET_EVENTS.MEETING_STATE, handleMeetingState);
    socket.on(SOCKET_EVENTS.SPEAKING_STATUS, handleSpeakingStatus);
    socket.on(SOCKET_EVENTS.AUDIO_TRANSLATED, handleTranslatedAudio);
    socket.on(SOCKET_EVENTS.WAITING_ROOM_UPDATE, handleWaitingRoomUpdate);
    socket.on(SOCKET_EVENTS.KNOCK_ACCEPTED, handleKnockAccepted);
    socket.on(SOCKET_EVENTS.KNOCK_DENIED, handleKnockDenied);
    socket.on(SOCKET_EVENTS.HOST_JOIN_SUCCESS, handleHostJoinSuccess);
    socket.on(SOCKET_EVENTS.HOST_JOIN_ERROR, handleHostJoinError);
    socket.on("error", handleSocketError);

    return () => {
      socket.off(SOCKET_EVENTS.MEETING_STATE, handleMeetingState);
      socket.off(SOCKET_EVENTS.SPEAKING_STATUS, handleSpeakingStatus);
      socket.off(SOCKET_EVENTS.AUDIO_TRANSLATED, handleTranslatedAudio);
      socket.off(SOCKET_EVENTS.WAITING_ROOM_UPDATE, handleWaitingRoomUpdate);
      socket.off(SOCKET_EVENTS.KNOCK_ACCEPTED, handleKnockAccepted);
      socket.off(SOCKET_EVENTS.KNOCK_DENIED, handleKnockDenied);
      socket.off(SOCKET_EVENTS.HOST_JOIN_SUCCESS, handleHostJoinSuccess);
      socket.off(SOCKET_EVENTS.HOST_JOIN_ERROR, handleHostJoinError);
      socket.off("error", handleSocketError);
    };
  }, [
    displayName,
    enqueueAudio,
    isHost,
    meetingId,
    navigate,
    setAdmittedToMeeting,
    setJoinDeniedMessage,
    setJoinError,
    setParticipants,
    setStatus,
    setToastMessage,
    setWaitingForAdmission,
    setWaitingParticipants,
    socket,
    user?.displayName
  ]);

  useEffect(() => {
    if (!admittedToMeeting || !localStream || !socket) {
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
  }, [admittedToMeeting, localStream, meetingId, preferredLanguage, setStatus, socket, vad]);

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

  // Bug 9: clear sessionStorage on leave
  const handleLeave = () => {
    sessionStorage.removeItem(`meeting_join_state_${meetingId}`);
    socket?.disconnect();
    navigate("/");
  };

  const handleGenerateInvite = async () => {
    if (!token) {
      return;
    }

    setInviteError(null);
    const response = await fetch(`${apiUrl}/meetings/${meetingId}/magic-links`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...createAuthHeaders(token)
      },
      body: JSON.stringify({
        inviteeEmails: inviteEmail ? [inviteEmail] : undefined
      })
    });
    const data = (await response.json()) as {
      links?: Array<{ url: string }>;
      error?: string;
    };

    if (!response.ok || !data.links?.[0]) {
      setInviteError(data.error ?? "Unable to generate invite link");
      return;
    }

    await navigator.clipboard.writeText(data.links[0].url);
    setToastMessage("Copied invite link to clipboard");
    setInviteEmail("");
  };

  if (joinError && joinErrorCode !== "NOT_HOST") {
    return (
      <main className="mx-auto flex min-h-screen max-w-md items-center px-6 py-12">
        <section className="w-full rounded-[36px] bg-white/90 p-8 shadow-panel text-center">
          <h1 className="text-2xl font-bold text-rose-600">Unable to join</h1>
          <p className="mt-4 text-sm text-slate-600">{joinError}</p>
          <button
            type="button"
            onClick={() => navigate("/")}
            className="mt-6 rounded-2xl bg-accent px-5 py-4 text-sm font-semibold text-white transition hover:bg-teal-700"
          >
            Back to home
          </button>
        </section>
      </main>
    );
  }

  // Bug 7: add back/retry to error screen
  if (meetingError) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-12">
        <section className="rounded-[36px] bg-white/90 p-8 shadow-panel">
          <h1 className="text-3xl font-bold text-ink">Meeting unavailable</h1>
          <p className="mt-3 text-sm text-rose-600">{meetingError}</p>
          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={() => navigate("/")}
              className="rounded-2xl bg-accent px-5 py-4 text-sm font-semibold text-white transition hover:bg-teal-700"
            >
              Back to home
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-2xl bg-slate-100 px-5 py-4 text-sm font-semibold text-ink"
            >
              Retry
            </button>
          </div>
        </section>
      </main>
    );
  }

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

          {waitingForAdmission ? (
            <section className="rounded-[40px] bg-white/90 p-12 text-center shadow-panel">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-teal-100">
                <span className="absolute inline-flex h-16 w-16 animate-ping rounded-full bg-teal-200 opacity-60" />
                <span className="relative h-6 w-6 rounded-full bg-accent" />
              </div>
              <h2 className="mt-6 text-2xl font-bold text-ink">
                Waiting for host to admit you
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                The host will let you in shortly.
              </p>
              <p className="mt-6 inline-flex rounded-full bg-teal-100 px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-accent">
                Meeting {meetingId}
              </p>
            </section>
          ) : joinDeniedMessage ? (
            <section className="rounded-[40px] bg-white/90 p-12 text-center shadow-panel">
              <h2 className="text-2xl font-bold text-ink">Unable to join</h2>
              <p className="mt-3 text-sm text-rose-600">{joinDeniedMessage}</p>
              <button
                type="button"
                onClick={() => navigate("/")}
                className="mt-6 rounded-full bg-rose-500 px-5 py-3 text-sm font-semibold text-white"
              >
                Back to home
              </button>
            </section>
          ) : (
            <>
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
            </>
          )}
        </section>

        <aside className="space-y-6">
          <TranslationStatus />

          {isHost && waitingParticipants.length > 0 ? (
            <section className="rounded-3xl bg-white/90 p-5 shadow-panel">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-ink">Waiting to join</h2>
                <span className="inline-flex rounded-full bg-teal-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-accent">
                  {waitingParticipants.length}
                </span>
              </div>
              <ul className="mt-4 space-y-3">
                {waitingParticipants.map((waiter) => (
                  <li
                    key={waiter.socketId}
                    className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-semibold text-ink">{waiter.displayName}</p>
                      <p className="text-xs uppercase tracking-[0.16em] text-slate-500">
                        {waiter.preferredLanguage}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          socket?.emit(SOCKET_EVENTS.ADMIT_PARTICIPANT, {
                            meetingId,
                            targetSocketId: waiter.socketId
                          })
                        }
                        className="rounded-full bg-accent px-4 py-2 text-xs font-semibold text-white"
                      >
                        Admit
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          socket?.emit(SOCKET_EVENTS.DENY_PARTICIPANT, {
                            meetingId,
                            targetSocketId: waiter.socketId
                          })
                        }
                        className="rounded-full bg-slate-200 px-4 py-2 text-xs font-semibold text-slate-700"
                      >
                        Deny
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {isHost ? (
            <section className="rounded-3xl bg-white/90 p-5 shadow-panel">
              <button
                type="button"
                onClick={() => setInvitePanelOpen((current) => !current)}
                className="w-full rounded-2xl bg-sky px-4 py-3 text-left text-sm font-medium text-accent"
              >
                Invite participants {invitePanelOpen ? "▴" : "▾"}
              </button>
              {invitePanelOpen ? (
                <div className="mt-4 space-y-3">
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard.writeText(window.location.href);
                      setToastMessage("Copied meeting link");
                    }}
                    className="w-full rounded-full px-5 py-3 text-sm font-semibold bg-white/10 text-ink"
                  >
                    Copy meeting link
                  </button>
                  <label className="flex flex-col gap-2 text-sm font-medium text-ink">
                    <span>Optional invitee email</span>
                    <input
                      className="rounded-2xl border border-teal-200 bg-white px-4 py-3 outline-none focus:border-accent"
                      value={inviteEmail}
                      onChange={(event) => setInviteEmail(event.target.value)}
                    />
                  </label>
                  {inviteError ? <p className="text-sm text-rose-600">{inviteError}</p> : null}
                  <button
                    type="button"
                    onClick={() => void handleGenerateInvite()}
                    className="w-full rounded-2xl bg-accent px-5 py-4 text-sm font-semibold text-white transition hover:bg-teal-700 disabled:opacity-60"
                  >
                    Generate magic invite link
                  </button>
                </div>
              ) : null}
            </section>
          ) : null}

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

      {toastMessage ? (
        <div className="fixed bottom-6 right-6 rounded-2xl bg-ink px-5 py-3 text-sm text-white shadow-panel">
          {toastMessage}
        </div>
      ) : null}
    </main>
  );
};

export default Meet;
