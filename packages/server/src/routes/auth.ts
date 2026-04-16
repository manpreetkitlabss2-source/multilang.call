import type { Express } from "express";
import { z } from "zod";
import { createAuthToken, loginUser, registerUser } from "../services/authService.js";

const registerSchema = z.object({
  email: z.string().email(),
  displayName: z.string().min(2).max(40),
  password: z.string().min(8),
  role: z.enum(["HOST", "PARTICIPANT"]).default("PARTICIPANT")
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

export const registerAuthRoutes = (app: Pick<Express, "post" | "get">) => {
  app.post("/auth/register", async (req, res) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    try {
      const user = await registerUser(
        parsed.data.email,
        parsed.data.displayName,
        parsed.data.password,
        parsed.data.role
      );

      return res.status(201).json({
        user,
        token: createAuthToken(user)
      });
    } catch (error) {
      return res.status(400).json({
        error: error instanceof Error ? error.message : "Unable to register user"
      });
    }
  });

  app.post("/auth/login", async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    try {
      const result = await loginUser(parsed.data.email, parsed.data.password);
      return res.json(result);
    } catch (error) {
      return res.status(401).json({
        error: error instanceof Error ? error.message : "Invalid email or password"
      });
    }
  });

  app.get("/auth/me", (req, res) => {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    return res.json(req.user);
  });
};
