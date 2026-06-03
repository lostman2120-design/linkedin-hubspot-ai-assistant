import { describe, expect, it } from "vitest";
import { formatHubSpotApiError } from "../services/hubspot.service.js";
import { formatOpenAiApiError } from "../services/openai.service.js";

describe("provider error messages", () => {
  it("formats HubSpot permission scope errors", () => {
    const formatted = formatHubSpotApiError(
      403,
      "Forbidden",
      {
        message: "This hapikey does not have proper permissions. Missing scopes: crm.objects.contacts.write",
        category: "MISSING_SCOPES",
        correlationId: "abc-123"
      },
      ""
    );

    expect(formatted.message).toContain("HubSpot permission scope is missing");
    expect(formatted.message).toContain("Missing scopes");
    expect(formatted.details).toContain("HubSpot category: MISSING_SCOPES");
    expect(formatted.details).toContain("HubSpot correlation ID: abc-123");
  });

  it("formats HubSpot invalid property errors", () => {
    const formatted = formatHubSpotApiError(
      400,
      "Bad Request",
      {
        message: "Property values were not valid",
        validationResults: [
          {
            propertyName: "bad_linkedin_url",
            message: "Property bad_linkedin_url does not exist"
          }
        ]
      },
      ""
    );

    expect(formatted.message).toContain("HubSpot property name is invalid");
    expect(formatted.message).toContain("bad_linkedin_url");
  });

  it("formats OpenAI quota errors", () => {
    const formatted = formatOpenAiApiError(
      429,
      "Too Many Requests",
      {
        error: {
          message: "You exceeded your current quota, please check your plan and billing details.",
          type: "insufficient_quota",
          code: "insufficient_quota"
        }
      },
      ""
    );

    expect(formatted.message).toContain("OpenAI quota is exceeded");
    expect(formatted.message).toContain("billing");
    expect(formatted.details).toContain("OpenAI error code: insufficient_quota");
  });

  it("formats OpenAI authentication errors", () => {
    const formatted = formatOpenAiApiError(
      401,
      "Unauthorized",
      {
        error: {
          message: "Incorrect API key provided.",
          type: "invalid_request_error",
          code: "invalid_api_key"
        }
      },
      ""
    );

    expect(formatted.message).toContain("OpenAI API key is invalid or expired");
    expect(formatted.message).toContain("Incorrect API key");
  });
});

