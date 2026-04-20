import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { SOCKET_EVENTS } from "@multilang-call/shared";
import MeetingControls from "../components/MeetingControls";
import TranslationOverlay from "../components/TranslationOverlay";
import TranslationStatus from "../components/TranslationStatus";
import VideoGrid from "../components/VideoGrid";
import WaitingRoom from "../components/WaitingRoom";
import { useSocket } from "../hooks/useSocket";
import { useSpeechRecognition } from "../hooks/useSpeechRecognition";
import { useTranslatedAudio } from "../hooks/useTranslatedAudio";
import { useWebRTC } from "../hooks/useWebRTC";
import { apiUrl, createAuthHeaders } from "../lib/api";
import { useAuthStore } from "../store/authStore";
import { useMeetingStore } from "../store/meetingStore";
import { useTranslationStore } from "../store/translationStore";
const createLocalParticipant = (preferredLanguage, displayName, isMuted, isSpeaking = false) => ({
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
    const locationState = location.state ?? { fromJoin: false };
    const savedJoinState = useMemo(() => {
        const raw = sessionStorage.getItem(`meeting_join_state_${meetingId}`);
        if (!raw) {
            return null;
        }
        try {
            return JSON.parse(raw);
        }
        catch {
            return null;
        }
    }, [meetingId]);
    const displayName = locationState.displayName ?? savedJoinState?.displayName ?? user?.displayName ?? "Guest";
    const effectiveInviteToken = locationState.inviteToken ?? savedJoinState?.inviteToken ?? null;
    const initialLanguage = locationState.preferredLanguage ?? savedJoinState?.preferredLanguage ?? "en";
    const participantIdRef = useRef(user?.id ?? crypto.randomUUID());
    const preferredLanguageRef = useRef(initialLanguage);
    const isMutedRef = useRef(false);
    const hasSentJoinRef = useRef(false);
    const [preferredLanguage, setPreferredLanguage] = useState(initialLanguage);
    const [meeting, setMeeting] = useState(null);
    const [meetingError, setMeetingError] = useState(null);
    const [invitePanelOpen, setInvitePanelOpen] = useState(false);
    const [inviteEmail, setInviteEmail] = useState("");
    const [toastMessage, setToastMessage] = useState(null);
    const [inviteError, setInviteError] = useState(null);
    const socket = useSocket();
    const participants = useMeetingStore((state) => state.participants);
    const waitingParticipants = useMeetingStore((state) => state.waitingParticipants);
    const waitingForAdmission = useMeetingStore((state) => state.waitingForAdmission);
    const joinDeniedMessage = useMeetingStore((state) => state.joinDeniedMessage);
    const admittedToMeeting = useMeetingStore((state) => state.admittedToMeeting);
    const isMuted = useMeetingStore((state) => state.isMuted);
    const isVideoEnabled = useMeetingStore((state) => state.isVideoEnabled);
    const joinError = useMeetingStore((state) => state.joinError);
    const joinErrorCode = useMeetingStore((state) => state.joinErrorCode);
    const setMeetingId = useMeetingStore((state) => state.setMeetingId);
    const setParticipants = useMeetingStore((state) => state.setParticipants);
    const setMuted = useMeetingStore((state) => state.setMuted);
    const setVideoEnabled = useMeetingStore((state) => state.setVideoEnabled);
    const setWaitingParticipants = useMeetingStore((state) => state.setWaitingParticipants);
    const setWaitingForAdmission = useMeetingStore((state) => state.setWaitingForAdmission);
    const setJoinDeniedMessage = useMeetingStore((state) => state.setJoinDeniedMessage);
    const setAdmittedToMeeting = useMeetingStore((state) => state.setAdmittedToMeeting);
    const setJoinError = useMeetingStore((state) => state.setJoinError);
    const resetMeetingStore = useMeetingStore((state) => state.reset);
    const subtitle = useTranslationStore((state) => state.subtitle);
    const resetTranslationStore = useTranslationStore((state) => state.reset);
    const { localStream, remoteStreams, error } = useWebRTC(socket, participants);
    const isHost = Boolean(user && meeting?.hostUserId === user.id);
    useTranslatedAudio(socket);
    useSpeechRecognition(socket, meetingId, participantIdRef.current, preferredLanguage, isMuted, admittedToMeeting);
    useEffect(() => {
        if (locationState.fromJoin) {
            sessionStorage.setItem(`meeting_join_state_${meetingId}`, JSON.stringify({
                displayName: locationState.displayName,
                preferredLanguage: locationState.preferredLanguage,
                inviteToken: locationState.inviteToken
            }));
        }
    }, [locationState, meetingId]);
    useEffect(() => {
        return () => {
            resetMeetingStore();
            resetTranslationStore();
        };
    }, [resetMeetingStore, resetTranslationStore]);
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
            const data = (await response.json());
            if (!response.ok || !data.meeting) {
                throw new Error(data.error ?? "Unable to load meeting");
            }
            setMeeting(data.meeting);
            if (data.meeting.defaultLanguage && !locationState.preferredLanguage) {
                setPreferredLanguage(data.meeting.defaultLanguage);
            }
        })
            .catch((caughtError) => {
            setMeetingError(caughtError instanceof Error ? caughtError.message : "Unable to load meeting");
        });
    }, [locationState.preferredLanguage, meetingId, token, user]);
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
            setWaitingForAdmission(false);
        }
        else {
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
        setAdmittedToMeeting,
        setJoinDeniedMessage,
        setWaitingForAdmission,
        socket,
        user
    ]);
    useEffect(() => {
        if (!socket) {
            return;
        }
        const handleMeetingState = (payload) => {
            const localParticipant = createLocalParticipant(preferredLanguageRef.current, isHost ? user?.displayName ?? displayName : displayName, isMutedRef.current);
            const withoutLocal = payload.participants.filter((participant) => participant.socketId !== socket.id);
            setParticipants([localParticipant, ...withoutLocal]);
        };
        const handleSpeakingStatus = ({ socketId, isSpeaking }) => {
            setParticipants(useMeetingStore.getState().participants.map((participant) => participant.socketId === socketId ||
                (participant.socketId === "local" && socketId === socket.id)
                ? { ...participant, isSpeaking }
                : participant));
        };
        const handleWaitingRoomUpdate = ({ waitingParticipants: nextWaitingParticipants }) => {
            setWaitingParticipants(nextWaitingParticipants);
        };
        const handleKnockAccepted = () => {
            setWaitingForAdmission(false);
            setJoinDeniedMessage(null);
            setAdmittedToMeeting(true);
        };
        const handleKnockDenied = ({ reason } = {}) => {
            setWaitingForAdmission(false);
            setJoinDeniedMessage(reason ?? "The host has declined your request to join.");
            setAdmittedToMeeting(false);
        };
        const handleHostJoinSuccess = () => {
            setAdmittedToMeeting(true);
            setWaitingForAdmission(false);
            setJoinError(null);
        };
        const handleHostJoinError = (data) => {
            setJoinError(data.message, data.code);
            setAdmittedToMeeting(false);
            if (data.code === "AUTH_REQUIRED") {
                navigate("/auth", { state: { redirectTo: `/meet/${meetingId}` } });
            }
        };
        const handleSocketError = (err) => {
            if (err.message) {
                setToastMessage(`Error: ${err.message}`);
            }
        };
        socket.on(SOCKET_EVENTS.MEETING_STATE, handleMeetingState);
        socket.on(SOCKET_EVENTS.SPEAKING_STATUS, handleSpeakingStatus);
        socket.on(SOCKET_EVENTS.WAITING_ROOM_UPDATE, handleWaitingRoomUpdate);
        socket.on(SOCKET_EVENTS.KNOCK_ACCEPTED, handleKnockAccepted);
        socket.on(SOCKET_EVENTS.KNOCK_DENIED, handleKnockDenied);
        socket.on(SOCKET_EVENTS.HOST_JOIN_SUCCESS, handleHostJoinSuccess);
        socket.on(SOCKET_EVENTS.HOST_JOIN_ERROR, handleHostJoinError);
        socket.on("error", handleSocketError);
        return () => {
            socket.off(SOCKET_EVENTS.MEETING_STATE, handleMeetingState);
            socket.off(SOCKET_EVENTS.SPEAKING_STATUS, handleSpeakingStatus);
            socket.off(SOCKET_EVENTS.WAITING_ROOM_UPDATE, handleWaitingRoomUpdate);
            socket.off(SOCKET_EVENTS.KNOCK_ACCEPTED, handleKnockAccepted);
            socket.off(SOCKET_EVENTS.KNOCK_DENIED, handleKnockDenied);
            socket.off(SOCKET_EVENTS.HOST_JOIN_SUCCESS, handleHostJoinSuccess);
            socket.off(SOCKET_EVENTS.HOST_JOIN_ERROR, handleHostJoinError);
            socket.off("error", handleSocketError);
        };
    }, [
        displayName,
        isHost,
        meetingId,
        navigate,
        setAdmittedToMeeting,
        setJoinDeniedMessage,
        setJoinError,
        setParticipants,
        setWaitingForAdmission,
        setWaitingParticipants,
        socket,
        user?.displayName
    ]);
    const participantList = useMemo(() => participants.length === 0
        ? [createLocalParticipant(preferredLanguage, displayName, isMuted)]
        : participants, [displayName, isMuted, participants, preferredLanguage]);
    const handleToggleMute = () => {
        const nextMuted = !isMuted;
        setMuted(nextMuted);
        localStream?.getAudioTracks().forEach((track) => {
            track.enabled = !nextMuted;
        });
        setParticipants(useMeetingStore.getState().participants.map((participant) => participant.socketId === "local"
            ? { ...participant, isMuted: nextMuted }
            : participant));
        socket?.emit(SOCKET_EVENTS.MUTE_STATUS, { meetingId, isMuted: nextMuted });
    };
    const handleToggleVideo = () => {
        const nextEnabled = !isVideoEnabled;
        setVideoEnabled(nextEnabled);
        localStream?.getVideoTracks().forEach((track) => {
            track.enabled = nextEnabled;
        });
    };
    const handleLanguageChange = (nextLanguage) => {
        setPreferredLanguage(nextLanguage);
        setParticipants(useMeetingStore.getState().participants.map((participant) => participant.socketId === "local"
            ? { ...participant, preferredLanguage: nextLanguage }
            : participant));
        socket?.emit(SOCKET_EVENTS.LANGUAGE_CHANGE, {
            meetingId,
            preferredLanguage: nextLanguage
        });
    };
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
        const data = (await response.json());
        if (!response.ok || !data.links?.[0]) {
            setInviteError(data.error ?? "Unable to generate invite link");
            return;
        }
        await navigator.clipboard.writeText(data.links[0].url);
        setToastMessage("Copied invite link to clipboard");
        setInviteEmail("");
    };
    if (joinError && joinErrorCode !== "NOT_HOST") {
        return (_jsx("main", { className: "mx-auto flex min-h-screen max-w-md items-center px-6 py-12", children: _jsxs("section", { className: "w-full rounded-[36px] bg-white/90 p-8 text-center shadow-panel", children: [_jsx("h1", { className: "text-2xl font-bold text-rose-600", children: "Unable to join" }), _jsx("p", { className: "mt-4 text-sm text-slate-600", children: joinError }), _jsx("button", { type: "button", onClick: () => navigate("/"), className: "mt-6 rounded-2xl bg-accent px-5 py-4 text-sm font-semibold text-white transition hover:bg-teal-700", children: "Back to home" })] }) }));
    }
    if (meetingError) {
        return (_jsx("main", { className: "mx-auto max-w-3xl px-6 py-12", children: _jsxs("section", { className: "rounded-[36px] bg-white/90 p-8 shadow-panel", children: [_jsx("h1", { className: "text-3xl font-bold text-ink", children: "Meeting unavailable" }), _jsx("p", { className: "mt-3 text-sm text-rose-600", children: meetingError }), _jsxs("div", { className: "mt-6 flex gap-3", children: [_jsx("button", { type: "button", onClick: () => navigate("/"), className: "rounded-2xl bg-accent px-5 py-4 text-sm font-semibold text-white transition hover:bg-teal-700", children: "Back to home" }), _jsx("button", { type: "button", onClick: () => window.location.reload(), className: "rounded-full px-5 py-3 text-sm font-semibold bg-white/10 text-ink", children: "Retry" })] })] }) }));
    }
    return (_jsxs("main", { className: "mx-auto max-w-7xl px-6 py-8", children: [_jsxs("div", { className: "grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]", children: [_jsxs("section", { className: "space-y-6", children: [_jsx("header", { className: "rounded-[40px] bg-white/90 p-6 shadow-panel", children: _jsx("div", { className: "flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between", children: _jsxs("div", { children: [_jsx("p", { className: "text-xs font-semibold uppercase tracking-[0.25em] text-accent", children: "Meeting room" }), _jsx("h1", { className: "mt-2 text-3xl font-bold text-ink", children: meetingId }), _jsx("p", { className: "mt-2 max-w-2xl text-sm text-slate-600", children: "WebRTC keeps everyone live on camera while translated playback follows your selected listening language." }), _jsxs("p", { className: "mt-3 inline-flex rounded-full bg-sky px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-accent", children: ["Listening in ", preferredLanguage.toUpperCase()] }), error ? _jsx("p", { className: "mt-3 text-sm text-rose-600", children: error }) : null] }) }) }), waitingForAdmission ? (_jsxs("section", { className: "rounded-[40px] bg-white/90 p-12 text-center shadow-panel", children: [_jsxs("div", { className: "mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-sky", children: [_jsx("span", { className: "absolute inline-flex h-16 w-16 animate-ping rounded-full bg-sky opacity-60" }), _jsx("span", { className: "relative h-6 w-6 rounded-full bg-accent" })] }), _jsx("h2", { className: "mt-6 text-2xl font-bold text-ink", children: "Waiting for host to admit you" }), _jsx("p", { className: "mt-2 text-sm text-slate-600", children: "The host will let you in shortly." }), _jsxs("p", { className: "mt-6 inline-flex rounded-full bg-sky px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-accent", children: ["Meeting ", meetingId] })] })) : joinDeniedMessage ? (_jsxs("section", { className: "rounded-[40px] bg-white/90 p-12 text-center shadow-panel", children: [_jsx("h2", { className: "text-2xl font-bold text-ink", children: "Unable to join" }), _jsx("p", { className: "mt-3 text-sm text-rose-600", children: joinDeniedMessage }), _jsx("button", { type: "button", onClick: () => navigate("/"), className: "mt-6 rounded-full bg-rose-500 px-5 py-3 text-sm font-semibold text-white", children: "Back to home" })] })) : (_jsxs(_Fragment, { children: [_jsx(VideoGrid, { participants: participantList, localStream: localStream, remoteStreams: remoteStreams, localPreferredLanguage: preferredLanguage, isLocalVideoEnabled: isVideoEnabled }), _jsx(MeetingControls, { isMuted: isMuted, isVideoEnabled: isVideoEnabled, preferredLanguage: preferredLanguage, onToggleMute: handleToggleMute, onToggleVideo: handleToggleVideo, onLanguageChange: handleLanguageChange, onLeave: handleLeave })] }))] }), _jsxs("aside", { className: "space-y-6", children: [_jsx(TranslationStatus, {}), isHost && waitingParticipants.length > 0 ? (_jsx(WaitingRoom, { waitingParticipants: waitingParticipants, onAdmit: (targetSocketId) => socket?.emit(SOCKET_EVENTS.ADMIT_PARTICIPANT, {
                                    meetingId,
                                    targetSocketId
                                }), onDeny: (targetSocketId) => socket?.emit(SOCKET_EVENTS.DENY_PARTICIPANT, {
                                    meetingId,
                                    targetSocketId
                                }) })) : null, isHost ? (_jsxs("section", { className: "rounded-[36px] bg-white/90 p-5 shadow-panel", children: [_jsxs("button", { type: "button", onClick: () => setInvitePanelOpen((current) => !current), className: "w-full rounded-2xl bg-accent px-5 py-4 text-left text-sm font-semibold text-white transition hover:bg-teal-700", children: ["Invite participants ", invitePanelOpen ? "Hide" : "Show"] }), invitePanelOpen ? (_jsxs("div", { className: "mt-4 space-y-3", children: [_jsx("button", { type: "button", onClick: () => {
                                                    void navigator.clipboard.writeText(window.location.href);
                                                    setToastMessage("Copied meeting link");
                                                }, className: "w-full rounded-full px-5 py-3 text-sm font-semibold bg-white/10 text-ink", children: "Copy meeting link" }), _jsxs("label", { className: "flex flex-col gap-2 text-sm font-medium text-ink", children: [_jsx("span", { children: "Optional invitee email" }), _jsx("input", { className: "rounded-2xl border border-teal-200 bg-white px-4 py-3 outline-none focus:border-accent", value: inviteEmail, onChange: (event) => setInviteEmail(event.target.value) })] }), inviteError ? _jsx("p", { className: "text-sm text-rose-600", children: inviteError }) : null, _jsx("button", { type: "button", onClick: () => void handleGenerateInvite(), className: "w-full rounded-2xl bg-accent px-5 py-4 text-sm font-semibold text-white transition hover:bg-teal-700 disabled:opacity-60", children: "Generate magic invite link" })] })) : null] })) : null, _jsxs("section", { className: "rounded-[36px] bg-white/90 p-5 shadow-panel", children: [_jsx("h2", { className: "text-lg font-semibold text-ink", children: "Participants" }), _jsx("ul", { className: "mt-4 space-y-3", children: participantList.map((participant) => (_jsxs("li", { className: "flex items-center justify-between rounded-[28px] bg-sky px-4 py-3", children: [_jsxs("div", { children: [_jsx("p", { className: "text-sm font-semibold text-ink", children: participant.displayName }), _jsx("p", { className: "text-xs uppercase tracking-[0.16em] text-slate-500", children: participant.preferredLanguage })] }), _jsx("span", { className: "text-xs font-semibold text-slate-500", children: participant.isMuted ? "Muted" : "Live" })] }, participant.socketId))) })] })] })] }), _jsx(TranslationOverlay, { subtitle: subtitle }), toastMessage ? (_jsx("div", { className: "fixed bottom-6 right-6 rounded-[28px] bg-ink px-5 py-3 text-sm text-white shadow-panel", children: toastMessage })) : null] }));
};
export default Meet;
