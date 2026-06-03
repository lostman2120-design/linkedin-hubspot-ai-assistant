import type { ApiErrorResponse } from "@linkedin-hubspot-ai/shared";
import { ZodError } from "zod";

type ErrorLogContext = {
  method?: string;
  path?: string;
  statusCode?: number;
};

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly details?: string[],
    public readonly logDetails?: unknown
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function formatZodError(error: ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "request";
    return `${path}: ${issue.message}`;
  });
}

export function formatApiError(error: unknown): { statusCode: number; body: ApiErrorResponse } {
  if (error instanceof AppError) {
    return {
      statusCode: error.statusCode,
      body: {
        statusCode: error.statusCode,
        error: error.message,
        details: error.details
      }
    };
  }

  if (error instanceof ZodError) {
    return {
      statusCode: 400,
      body: {
        statusCode: 400,
        error: "Some information was missing or not in the right format.",
        details: formatZodError(error)
      }
    };
  }

  return {
    statusCode: 500,
    body: {
      statusCode: 500,
      error: "The backend API had an internal error. Please try again in a moment."
    }
  };
}

export function toUserFacingMessage(error: unknown, fallback: string): string {
  if (error instanceof AppError) {
    return error.message;
  }

  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return fallback;
}

export function logDetailedErrorForDevelopment(error: unknown, context: ErrorLogContext = {}): void {
  if (process.env.NODE_ENV !== "development") {
    return;
  }

  const payload =
    error instanceof AppError
      ? {
          name: error.name,
          message: error.message,
          statusCode: error.statusCode,
          details: error.details,
          logDetails: error.logDetails
        }
      : error instanceof Error
        ? {
            name: error.name,
            message: error.message,
            stack: error.stack
          }
        : error;

  console.error(
    "[development] API error details",
    JSON.stringify(
      sanitizeSensitiveData({
        context,
        error: payload
      }),
      null,
      2
    )
  );
}

export function sanitizeSensitiveData(value: unknown): unknown {
  const secrets = [process.env.OPENAI_API_KEY, process.env.HUBSPOT_PRIVATE_APP_TOKEN].filter(
    (secret): secret is string => Boolean(secret)
  );

  return sanitizeValue(value, secrets);
}

function sanitizeValue(value: unknown, secrets: string[]): unknown {
  if (typeof value === "string") {
    return redactSecretStrings(value, secrets);
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, secrets));
  }

  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => {
        if (isSensitiveKey(key)) {
          return [key, "[redacted]"];
        }

        return [key, sanitizeValue(item, secrets)];
      })
    );
  }

  return value;
}

function isSensitiveKey(key: string): boolean {
  return /(authorization|api[-_]?key|access[-_]?token|private[-_]?app[-_]?token|secret|token|password)/i.test(key);
}

function redactSecretStrings(value: string, secrets: string[]): string {
  const withoutBearer = value.replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]");
  return secrets.reduce((currentValue, secret) => currentValue.split(secret).join("[redacted]"), withoutBearer);
}
