import cors from "cors";
import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { authMiddleware } from "./middleware/auth.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerMagicLinkRoutes } from "./routes/magicLinks.js";
import { registerMeetingRoutes } from "./routes/meetings.js";
import { registerSchedulingRoutes } from "./routes/scheduling.js";
import { registerTokenRoutes } from "./routes/tokens.js";
import { createMeetingService } from "./services/meetingService.js";
import { createPipelineClient } from "./services/pipelineClient.js";
import { startCleanupService } from "./services/cleanupService.js";
import { registerSocketServer } from "./socket/index.js";
import { verifyToken } from "./services/authService.js";

const port = Number(process.env.PORT ?? 4000);
const app = express();
const allowedOrigin = process.env.CLIENT_URL ?? "http://localhost:5173";
app.use(cors({ origin: allowedOrigin, credentials: true }));
app.use(express.json({ limit: "2mb" }));

const meetingService = createMeetingService();
const pipelineClient = createPipelineClient();
const stopCleanup = startCleanupService();

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.use(authMiddleware);
registerAuthRoutes(app);
registerMeetingRoutes(app, meetingService);
registerTokenRoutes(app);
registerMagicLinkRoutes(app, meetingService);
registerSchedulingRoutes(app);

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigin,
    credentials: true
  }
});

// packages/server/src/socket/index.ts
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error("AUTH_REQUIRED"));

  try {
    const payload = verifyToken(token);  // this must throw on bad tokens
    socket.data.userId = payload.userId;
    socket.data.displayName = payload.displayName;
    next();
  } catch {
    next(new Error("AUTH_INVALID"));  // ← this causes connect_error on the client
  }
});

registerSocketServer(io, meetingService, pipelineClient);

httpServer.listen(port, () => {
  console.log(`server listening on ${port}`);
});

process.on("SIGTERM", () => {
  stopCleanup();
  process.exit(0);
});

process.on("SIGINT", () => {
  stopCleanup();
  process.exit(0);
});
