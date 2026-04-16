import type { Server, Socket } from "socket.io";
import type { Participant, SupportedLanguageCode } from "@multilang-call/shared";
import { SOCKET_EVENTS } from "@multilang-call/shared";
import type { RoomManager } from "./roomManager.js";
import type { MeetingService } from "../services/meetingService.js";

interface JoinMeetingPayload {
  meetingId: string;
  participantId: string;
  displayName: string;
  preferredLanguage: SupportedLanguageCode;
}

export const registerMeetingHandlers = (
  io: Server,
  socket: Socket,
  roomManager: RoomManager,
  meetingService: MeetingService
) => {
  socket.on(
    SOCKET_EVENTS.MEETING_JOIN,
    async ({
      meetingId,
      participantId,
      displayName,
      preferredLanguage
    }: JoinMeetingPayload) => {
      const meeting = await meetingService.getMeeting(meetingId);
      if (!meeting) {
        socket.emit("error", { message: "Meeting not found" });
        return;
      }

      const participant: Participant = {
        socketId: socket.id,
        participantId,
        displayName,
        preferredLanguage,
        isMuted: false,
        isSpeaking: false
      };

      socket.join(meetingId);
      socket.join(`${meetingId}:${preferredLanguage}`);
      socket.data.meetingId = meetingId;

      const participants = await roomManager.addParticipant(meetingId, participant);
      io.to(meetingId).emit(SOCKET_EVENTS.MEETING_STATE, {
        meetingId,
        defaultLanguage: meeting.defaultLanguage,
        participants
      });
    }
  );

  socket.on(
    SOCKET_EVENTS.MUTE_STATUS,
    async ({ meetingId, isMuted }: { meetingId: string; isMuted: boolean }) => {
      const participants = await roomManager.setMuted(meetingId, socket.id, isMuted);
      io.to(meetingId).emit(SOCKET_EVENTS.MEETING_STATE, { participants });
    }
  );

  socket.on(
    SOCKET_EVENTS.WEBRTC_OFFER,
    ({ targetSocketId, description }: { targetSocketId: string; description: RTCSessionDescriptionInit }) => {
      io.to(targetSocketId).emit(SOCKET_EVENTS.WEBRTC_OFFER, {
        sourceSocketId: socket.id,
        description
      });
    }
  );

  socket.on(
    SOCKET_EVENTS.WEBRTC_ANSWER,
    ({ targetSocketId, description }: { targetSocketId: string; description: RTCSessionDescriptionInit }) => {
      io.to(targetSocketId).emit(SOCKET_EVENTS.WEBRTC_ANSWER, {
        sourceSocketId: socket.id,
        description
      });
    }
  );

  socket.on(
    SOCKET_EVENTS.WEBRTC_ICE_CANDIDATE,
    ({ targetSocketId, candidate }: { targetSocketId: string; candidate: RTCIceCandidateInit }) => {
      io.to(targetSocketId).emit(SOCKET_EVENTS.WEBRTC_ICE_CANDIDATE, {
        sourceSocketId: socket.id,
        candidate
      });
    }
  );

  socket.on("disconnect", async () => {
    const meetingId = socket.data.meetingId as string | undefined;
    if (!meetingId) {
      return;
    }

    const participants = await roomManager.removeParticipant(meetingId, socket.id);
    io.to(meetingId).emit(SOCKET_EVENTS.PARTICIPANT_LEAVE, { socketId: socket.id });
    io.to(meetingId).emit(SOCKET_EVENTS.MEETING_STATE, { participants });
  });
};
