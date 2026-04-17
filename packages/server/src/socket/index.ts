import type { Server } from "socket.io";
import type { MeetingService } from "../services/meetingService.js";
import type { PipelineClient } from "../services/pipelineClient.js";
import { verifyToken } from "../services/authService.js";
import { createRoomManager } from "./roomManager.js";
import { registerMeetingHandlers } from "./meetingHandlers.js";
import { registerLanguageHandlers } from "./languageHandlers.js";
import { registerAudioHandlers } from "./audioHandlers.js";

export const registerSocketServer = (
  io: Server,
  meetingService: MeetingService,
  pipelineClient: PipelineClient
) => {
  const roomManager = createRoomManager();
  
  io.use((socket, next) => {
    const token = socket.handshake.auth.token as string | undefined;
    if (!token) {
      socket.data.userId = undefined;
      return next();
    }

    try {
      const payload = verifyToken(token);
      socket.data.userId = payload.userId;
      socket.data.displayName = payload.displayName;
      socket.data.role = payload.role;
      return next();
    } catch {
      // Invalid/expired token — allow connection but without auth (invite flow)
      socket.data.userId = undefined;
      return next();
    }
  });

  io.on("connection", (socket) => {
    registerMeetingHandlers(io, socket, roomManager, meetingService);
    registerLanguageHandlers(io, socket, roomManager);
    registerAudioHandlers(io, socket, roomManager, pipelineClient);
  });
};
