import cors from "cors";
import express from "express";
import { router, stripeWebhookHandler } from "./routes.js";
import { createRateLimiter } from "./middleware/rateLimit.js";
import { AppError, formatApiError, logDetailedErrorForDevelopment } from "./utils/errors.js";

function parseAllowedOrigins(): string[] {
  return (process.env.ALLOWED_EXTENSION_ORIGIN ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function isLocalDevOrigin(origin: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

export function createApp() {
  const app = express();
  const allowedOrigins = parseAllowedOrigins();

  app.use(
    cors({
      origin(origin, callback) {
        if (!origin) {
          callback(null, true);
          return;
        }

        if (allowedOrigins.includes(origin) || isLocalDevOrigin(origin)) {
          callback(null, true);
          return;
        }

        callback(new AppError(403, "This browser extension is not allowed to use this API."));
      }
    })
  );
  app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), stripeWebhookHandler);
  app.use(express.json({ limit: "64kb" }));
  app.use(createRateLimiter({ windowMs: 15 * 60 * 1000, max: 120 }));
  app.use(router);

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    void _next;
    const formatted = formatApiError(error);
    logDetailedErrorForDevelopment(error, {
      method: _req.method,
      path: _req.path,
      statusCode: formatted.statusCode
    });
    res.status(formatted.statusCode).json(formatted.body);
  });

  return app;
}
