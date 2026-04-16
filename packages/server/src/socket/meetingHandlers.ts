import type { Server, Socket } from "socket.io";
import type {
  Participant,
  SupportedLanguageCode,
  WaitingParticipant
} from "@multilang-call/shared";
import { SOCKET_EVENTS } from "@multilang-call/shared";
import type { RoomManager } from "./roomManager.js";
import type { MeetingService } from "../services/meetingService.js";

interface JoinMeetingPayload {
  meetingId: string;
  participantId: string;
  displayName: string;
  preferredLanguage: SupportedLanguageCode;
}

interface KnockPayload extends JoinMeetingPayload {
  inviteToken?: string;
}

const emitMeetingState = async (
  io: Server,
  meetingId: string,
  roomManager: RoomManager,
  meetingService: MeetingService
) => {
  const participants = await roomManager.getMeetingParticipants(meetingId);
  const meeting = await meetingService.getMeeting(meetingId);
  io.to(meetingId).emit(SOCKET_EVENTS.MEETING_STATE, {
    meetingId,
    defaultLanguage: meeting?.defaultLanguage,
    participants
  });
};

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

      const isHost = meeting.hostUserId === socket.data.userId;
      if (!isHost) {
        socket.emit("error", { message: "Participants must wait for host admission" });
        return;
      }

      const participant: Participant = {
        socketId: socket.id,
        participantId: socket.data.userId ?? participantId,
        displayName: socket.data.displayName ?? displayName,
        preferredLanguage,
        isMuted: false,
        isSpeaking: false
      };

      socket.join(meetingId);
      socket.join(`${meetingId}:host`);
      socket.join(`${meetingId}:${preferredLanguage}`);
      socket.data.meetingId = meetingId;
      socket.data.pending = false;
      socket.data.isHost = true;

      await roomManager.addParticipant(meetingId, participant);
      await emitMeetingState(io, meetingId, roomManager, meetingService);
      io.to(`${meetingId}:host`).emit(SOCKET_EVENTS.WAITING_ROOM_UPDATE, {
        waitingParticipants: await roomManager.getWaitingParticipants(meetingId)
      });
    }
  );

  socket.on(
    SOCKET_EVENTS.PARTICIPANT_KNOCK,
    async ({
      meetingId,
      participantId,
      displayName,
      preferredLanguage,
      inviteToken
    }: KnockPayload) => {
      const meeting = await meetingService.getMeeting(meetingId);
      if (!meeting) {
        socket.emit("error", { message: "Meeting not found" });
        return;
      }

      if (inviteToken) {
        const inviteValidation = await meetingService.validateMagicLink(inviteToken);
        if (!inviteValidation.valid || inviteValidation.meetingId !== meetingId) {
          socket.emit("error", {
            message: inviteValidation.valid ? "Invite does not match meeting" : inviteValidation.reason
          });
          return;
        }
      }

      const waiter: WaitingParticipant = {
        socketId: socket.id,
        participantId,
        displayName,
        preferredLanguage,
        requestedAt: Date.now()
      };

      const waitingParticipants = await roomManager.addToWaiting(meetingId, waiter);
      socket.data.meetingId = meetingId;
      socket.data.pending = true;
      socket.data.pendingParticipant = waiter;
      socket.data.pendingInviteToken = inviteToken ?? null;
      io.to(`${meetingId}:host`).emit(SOCKET_EVENTS.WAITING_ROOM_UPDATE, {
        waitingParticipants
      });
    }
  );

  socket.on(
    SOCKET_EVENTS.ADMIT_PARTICIPANT,
    async ({
      meetingId,
      targetSocketId
    }: {
      meetingId: string;
      targetSocketId: string;
    }) => {
      if (!socket.data.isHost) {
        socket.emit("error", { message: "Only the host can admit participants" });
        return;
      }

      const waiters = await roomManager.getWaitingParticipants(meetingId);
      const waiter = waiters.find((entry) => entry.socketId === targetSocketId);
      const targetSocket = io.sockets.sockets.get(targetSocketId);

      if (!waiter || !targetSocket) {
        io.to(`${meetingId}:host`).emit(SOCKET_EVENTS.WAITING_ROOM_UPDATE, {
          waitingParticipants: await roomManager.removeFromWaiting(meetingId, targetSocketId)
        });
        return;
      }

      const waitingParticipants = await roomManager.removeFromWaiting(meetingId, targetSocketId);
      targetSocket.join(meetingId);
      targetSocket.join(`${meetingId}:${waiter.preferredLanguage}`);
      targetSocket.data.meetingId = meetingId;
      targetSocket.data.pending = false;
      targetSocket.data.isHost = false;

      await roomManager.addParticipant(meetingId, {
        socketId: waiter.socketId,
        participantId: waiter.participantId,
        displayName: waiter.displayName,
        preferredLanguage: waiter.preferredLanguage,
        isMuted: false,
        isSpeaking: false
      });
      await meetingService.addAdmittedParticipant(meetingId, waiter.participantId);

      if (typeof targetSocket.data.pendingInviteToken === "string") {
        await meetingService.markMagicLinkUsed(targetSocket.data.pendingInviteToken);
        targetSocket.data.pendingInviteToken = null;
      }

      targetSocket.emit(SOCKET_EVENTS.KNOCK_ACCEPTED, { meetingId });
      await emitMeetingState(io, meetingId, roomManager, meetingService);
      io.to(`${meetingId}:host`).emit(SOCKET_EVENTS.WAITING_ROOM_UPDATE, {
        waitingParticipants
      });
    }
  );

  socket.on(
    SOCKET_EVENTS.DENY_PARTICIPANT,
    async ({
      meetingId,
      targetSocketId
    }: {
      meetingId: string;
      targetSocketId: string;
    }) => {
      if (!socket.data.isHost) {
        socket.emit("error", { message: "Only the host can deny participants" });
        return;
      }

      const waitingParticipants = await roomManager.removeFromWaiting(
        meetingId,
        targetSocketId
      );
      io.to(targetSocketId).emit(SOCKET_EVENTS.KNOCK_DENIED, { meetingId });
      io.to(`${meetingId}:host`).emit(SOCKET_EVENTS.WAITING_ROOM_UPDATE, {
        waitingParticipants
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

    if (socket.data.pending) {
      const waitingParticipants = await roomManager.removeFromWaiting(meetingId, socket.id);
      io.to(`${meetingId}:host`).emit(SOCKET_EVENTS.WAITING_ROOM_UPDATE, {
        waitingParticipants
      });
      return;
    }

    const participants = await roomManager.removeParticipant(meetingId, socket.id);
    io.to(meetingId).emit(SOCKET_EVENTS.PARTICIPANT_LEAVE, { socketId: socket.id });
    io.to(meetingId).emit(SOCKET_EVENTS.MEETING_STATE, { participants });
  });
};
