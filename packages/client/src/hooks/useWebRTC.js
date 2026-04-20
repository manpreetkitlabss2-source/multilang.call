import { useEffect, useRef, useState } from "react";
import { SOCKET_EVENTS } from "@multilang-call/shared";
const rtcConfig = {
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
};
export const useWebRTC = (socket, participants) => {
    const [state, setState] = useState({
        localStream: null,
        remoteStreams: {},
        error: null
    });
    const peersRef = useRef({});
    const localStreamRef = useRef(null);
    useEffect(() => {
        let active = true;
        let activeStream = null;
        navigator.mediaDevices
            .getUserMedia({ audio: true, video: true })
            .then((stream) => {
            activeStream = stream;
            if (!active) {
                stream.getTracks().forEach((track) => track.stop());
                return;
            }
            localStreamRef.current = stream;
            setState((current) => ({ ...current, localStream: stream }));
        })
            .catch((error) => {
            setState((current) => ({
                ...current,
                error: error instanceof Error ? error.message : "Unable to access camera"
            }));
        });
        return () => {
            active = false;
            Object.values(peersRef.current).forEach((peer) => peer.close());
            peersRef.current = {};
            localStreamRef.current = null;
            activeStream?.getTracks().forEach((track) => track.stop());
        };
    }, []);
    useEffect(() => {
        if (!socket || !state.localStream) {
            return;
        }
        const ensurePeerConnection = (remoteSocketId) => {
            const existing = peersRef.current[remoteSocketId];
            if (existing) {
                return existing;
            }
            const connection = new RTCPeerConnection(rtcConfig);
            peersRef.current[remoteSocketId] = connection;
            localStreamRef.current?.getTracks().forEach((track) => {
                connection.addTrack(track, localStreamRef.current);
            });
            connection.ontrack = (event) => {
                const [remoteStream] = event.streams;
                if (!remoteStream) {
                    return;
                }
                setState((current) => ({
                    ...current,
                    remoteStreams: {
                        ...current.remoteStreams,
                        [remoteSocketId]: remoteStream
                    }
                }));
            };
            connection.onicecandidate = (event) => {
                if (!event.candidate) {
                    return;
                }
                socket.emit(SOCKET_EVENTS.WEBRTC_ICE_CANDIDATE, {
                    targetSocketId: remoteSocketId,
                    candidate: event.candidate.toJSON()
                });
            };
            connection.onconnectionstatechange = () => {
                if (connection.connectionState !== "failed") {
                    return;
                }
                connection.close();
                delete peersRef.current[remoteSocketId];
            };
            return connection;
        };
        const handleOffer = async ({ sourceSocketId, description }) => {
            const connection = ensurePeerConnection(sourceSocketId);
            await connection.setRemoteDescription(description);
            const answer = await connection.createAnswer();
            await connection.setLocalDescription(answer);
            socket.emit(SOCKET_EVENTS.WEBRTC_ANSWER, {
                targetSocketId: sourceSocketId,
                description: answer
            });
        };
        const handleAnswer = async ({ sourceSocketId, description }) => {
            const connection = peersRef.current[sourceSocketId];
            if (!connection) {
                return;
            }
            await connection.setRemoteDescription(description);
        };
        const handleIceCandidate = async ({ sourceSocketId, candidate }) => {
            const connection = peersRef.current[sourceSocketId];
            if (!connection) {
                return;
            }
            await connection.addIceCandidate(candidate);
        };
        socket.on(SOCKET_EVENTS.WEBRTC_OFFER, handleOffer);
        socket.on(SOCKET_EVENTS.WEBRTC_ANSWER, handleAnswer);
        socket.on(SOCKET_EVENTS.WEBRTC_ICE_CANDIDATE, handleIceCandidate);
        return () => {
            socket.off(SOCKET_EVENTS.WEBRTC_OFFER, handleOffer);
            socket.off(SOCKET_EVENTS.WEBRTC_ANSWER, handleAnswer);
            socket.off(SOCKET_EVENTS.WEBRTC_ICE_CANDIDATE, handleIceCandidate);
        };
    }, [socket, state.localStream]);
    useEffect(() => {
        if (!socket || !state.localStream || !socket.id) {
            return;
        }
        const remoteParticipants = participants.filter((participant) => participant.socketId !== "local" && participant.socketId !== socket.id);
        const activeSocketIds = new Set(remoteParticipants.map((participant) => participant.socketId));
        remoteParticipants.forEach(async (participant) => {
            const shouldInitiate = socket.id < participant.socketId;
            const connection = peersRef.current[participant.socketId] ??
                (() => {
                    const next = new RTCPeerConnection(rtcConfig);
                    peersRef.current[participant.socketId] = next;
                    localStreamRef.current?.getTracks().forEach((track) => {
                        next.addTrack(track, localStreamRef.current);
                    });
                    next.ontrack = (event) => {
                        const [remoteStream] = event.streams;
                        if (!remoteStream) {
                            return;
                        }
                        setState((current) => ({
                            ...current,
                            remoteStreams: {
                                ...current.remoteStreams,
                                [participant.socketId]: remoteStream
                            }
                        }));
                    };
                    next.onicecandidate = (event) => {
                        if (!event.candidate) {
                            return;
                        }
                        socket.emit(SOCKET_EVENTS.WEBRTC_ICE_CANDIDATE, {
                            targetSocketId: participant.socketId,
                            candidate: event.candidate.toJSON()
                        });
                    };
                    return next;
                })();
            if (!shouldInitiate || connection.signalingState !== "stable") {
                return;
            }
            const offer = await connection.createOffer();
            await connection.setLocalDescription(offer);
            socket.emit(SOCKET_EVENTS.WEBRTC_OFFER, {
                targetSocketId: participant.socketId,
                description: offer
            });
        });
        Object.entries(peersRef.current).forEach(([socketId, peer]) => {
            if (activeSocketIds.has(socketId)) {
                return;
            }
            peer.close();
            delete peersRef.current[socketId];
            setState((current) => {
                const nextStreams = { ...current.remoteStreams };
                delete nextStreams[socketId];
                return { ...current, remoteStreams: nextStreams };
            });
        });
    }, [participants, socket, state.localStream]);
    return {
        ...state,
        peerConnections: peersRef.current
    };
};
