import type { NextFunction, Request, Response } from "express";
import type { JwtPayload } from "@multilang-call/shared";
import { verifyToken } from "../services/authService.js";

type UserRole = JwtPayload["role"];

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

const isPublicPath = (path: string) =>
  path === "/auth/login" ||
  path === "/auth/register" ||
  path.startsWith("/invite") ||
  path.startsWith("/s/");

export const authMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (isPublicPath(req.path)) {
    return next();
  }

  const authorization = req.headers.authorization;
  if (!authorization) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const [scheme, token] = authorization.split(" ");
  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    req.user = verifyToken(token);
    return next();
  } catch {
    return res.status(401).json({ error: "Unauthorized" });
  }
};

export const requireRole =
  (role: UserRole) => (req: Request, res: Response, next: NextFunction) => {
    if (req.user?.role !== role) {
      return res.status(403).json({ error: "Forbidden" });
    }

    return next();
  };
