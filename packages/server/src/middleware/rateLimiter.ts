import type { Request, Response, NextFunction } from "express";

const requestCounts = new Map<string, { count: number; windowStart: number }>();

export const rateLimiter = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const key: string = req.ip || "unknown";
  const now = Date.now();
  const current = requestCounts.get(key);

  if (!current || now - current.windowStart > 60_000) {
    requestCounts.set(key, { count: 1, windowStart: now });
    return next();
  }

  if (current.count >= 120) {
    return res.status(429).json({ error: "Too many requests" });
  }

  current.count += 1;
  return next();
};
