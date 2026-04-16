import cors from "cors";
import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { registerMeetingRoutes } from "./routes/meetings.js";
import { registerTokenRoutes } from "./routes/tokens.js";
import { createMeetingService } from "./services/meetingService.js";
import { createPipelineClient } from "./services/pipelineClient.js";
import { registerSocketServer } from "./socket/index.js";

const port = Number(process.env.PORT ?? 4000);
const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

const meetingService = createMeetingService();
const pipelineClient = createPipelineClient();

registerMeetingRoutes(app, meetingService);
registerTokenRoutes(app);

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*"
  }
});

registerSocketServer(io, meetingService, pipelineClient);

httpServer.listen(port, () => {
  console.log(`server listening on ${port}`);
});
