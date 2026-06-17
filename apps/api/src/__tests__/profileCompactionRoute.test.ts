import { describe, expect, it } from "vitest";
import { AnalyzeProfileRequestSchema, DEFAULT_USER_SETTINGS, PROFILE_TEXT_LIMITS } from "@linkedin-hubspot-ai/shared";
import { compactProfileRequestBody } from "../routes.js";

const longText = (label: string, repeat = 320) => Array.from({ length: repeat }, (_, index) => `${label} ${index + 1}`).join(" ");

describe("API profile request compaction", () => {
  it("normalizes long extracted profile context before analyze-profile schema validation", () => {
    const compactedBody = compactProfileRequestBody({
      profile: {
        fullName: "Avery Johnson",
        headline: "RevOps Lead at Example Corp",
        profileUrl: "https://www.linkedin.com/in/avery-johnson/",
        about: longText("About CRM hygiene"),
        currentRoleDescription: longText("Current role HubSpot process"),
        visibleProfileContext: {
          about: { text: longText("Visible about text"), source: "visible About section" },
          currentRole: { description: longText("Visible current role") },
          experience: { visibleItems: [longText("Experience item")] },
          rawVisibleContext: longText("Raw visible context")
        },
        visibleTextSample: longText("Visible sample")
      },
      userSettings: DEFAULT_USER_SETTINGS
    }) as { profile: { visibleTextSample?: string; visibleProfileContext?: { rawVisibleContext?: string } } };

    expect(compactedBody.profile.visibleTextSample?.length).toBeLessThanOrEqual(PROFILE_TEXT_LIMITS.visibleTextSample);
    expect(compactedBody.profile.visibleProfileContext?.rawVisibleContext?.length).toBeLessThanOrEqual(PROFILE_TEXT_LIMITS.rawVisibleContext);
    expect(() => AnalyzeProfileRequestSchema.parse(compactedBody)).not.toThrow();
  });
});
