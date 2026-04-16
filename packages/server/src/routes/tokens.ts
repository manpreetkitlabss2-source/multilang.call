import type { Express } from "express";

export const registerTokenRoutes = (app: Express) => {
  app.post("/tokens", (_req, res) => {
    res.json({
      token: crypto.randomUUID(),
      provider: "native-webrtc"
    });
  });
};
