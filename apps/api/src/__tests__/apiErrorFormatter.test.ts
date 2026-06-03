import { describe, expect, it } from "vitest";
import { z } from "zod";
import { AppError, formatApiError, sanitizeSensitiveData } from "../utils/errors.js";

describe("formatApiError", () => {
  it("formats app errors for users", () => {
    const formatted = formatApiError(new AppError(401, "HubSpot rejected the token."));

    expect(formatted.statusCode).toBe(401);
    expect(formatted.body.statusCode).toBe(401);
    expect(formatted.body.error).toBe("HubSpot rejected the token.");
  });

  it("formats zod errors with details", () => {
    const result = z.object({ name: z.string() }).safeParse({ name: 123 });
    if (result.success) {
      throw new Error("Expected validation to fail.");
    }

    const formatted = formatApiError(result.error);
    expect(formatted.statusCode).toBe(400);
    expect(formatted.body.statusCode).toBe(400);
    expect(formatted.body.details?.[0]).toContain("name");
  });

  it("redacts tokens from development log data", () => {
    process.env.HUBSPOT_PRIVATE_APP_TOKEN = "pat-secret-value";
    process.env.OPENAI_API_KEY = "sk-secret-value";

    expect(
      sanitizeSensitiveData({
        authorization: "Bearer pat-secret-value",
        nested: {
          apiKey: "sk-secret-value",
          message: "Do not show sk-secret-value or pat-secret-value"
        }
      })
    ).toEqual({
      authorization: "[redacted]",
      nested: {
        apiKey: "[redacted]",
        message: "Do not show [redacted] or [redacted]"
      }
    });
  });
});
