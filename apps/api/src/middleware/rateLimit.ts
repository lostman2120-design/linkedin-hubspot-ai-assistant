import type { RequestHandler } from "express";
import { AppError } from "../utils/errors.js";

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

export function createRateLimiter(options: { windowMs: number; max: number }): RequestHandler {
  const buckets = new Map<string, RateLimitBucket>();

  return (req, _res, next) => {
    const now = Date.now();
    const key = `${req.ip}:${req.get("origin") ?? "no-origin"}`;
    const current = buckets.get(key);

    if (!current || current.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + options.windowMs });
      next();
      return;
    }

    current.count += 1;

    if (current.count > options.max) {
      next(new AppError(429, "Too many requests. Please wait a few minutes and try again.", [
        "The backend API rate limit was reached."
      ]));
      return;
    }

    next();
  };
}
