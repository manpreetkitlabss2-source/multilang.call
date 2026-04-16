import type { Server } from "socket.io";
import type { MeetingService } from "../services/meetingService.js";
import type { PipelineClient } from "../services/pipelineClient.js";
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

  io.on("connection", (socket) => {
    registerMeetingHandlers(io, socket, roomManager, meetingService);
    registerLanguageHandlers(io, socket, roomManager);
    registerAudioHandlers(io, socket, roomManager, pipelineClient);
  });
};
