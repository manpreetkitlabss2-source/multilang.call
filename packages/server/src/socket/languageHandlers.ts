import type { Server, Socket } from "socket.io";
import { SOCKET_EVENTS } from "@multilang-call/shared";
import type { RoomManager } from "./roomManager.js";

interface LanguagePayload {
  meetingId: string;
  preferredLanguage: "en" | "hi" | "pa";
}

export const registerLanguageHandlers = (
  io: Server,
  socket: Socket,
  roomManager: RoomManager
) => {
  socket.on(
    SOCKET_EVENTS.LANGUAGE_CHANGE,
    async ({ meetingId, preferredLanguage }: LanguagePayload) => {
      const existingParticipants = await roomManager.getMeetingParticipants(meetingId);
      const currentParticipant = existingParticipants.find(
        (participant) => participant.socketId === socket.id
      );

      if (currentParticipant) {
        socket.leave(`${meetingId}:${currentParticipant.preferredLanguage}`);
      }
      socket.join(`${meetingId}:${preferredLanguage}`);

      const participants = await roomManager.changeLanguage(
        meetingId,
        socket.id,
        preferredLanguage
      );
      io.to(meetingId).emit(SOCKET_EVENTS.MEETING_STATE, { participants });
    }
  );
};
