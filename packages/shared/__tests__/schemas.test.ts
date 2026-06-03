import { describe, expect, it } from "vitest";
import { GeneratedDmSchema, LicenseVerifyResponseSchema, LinkedInProfileSchema, ProfileAnalysisSchema } from "../schemas.js";

describe("shared zod schemas", () => {
  it("validates a LinkedIn profile", () => {
    const parsed = LinkedInProfileSchema.parse({
      fullName: "Avery Johnson",
      headline: "VP Sales at Example Corp",
      profileUrl: "https://www.linkedin.com/in/avery-johnson/"
    });

    expect(parsed.fullName).toBe("Avery Johnson");
  });

  it("rejects an invalid lead score", () => {
    expect(() =>
      ProfileAnalysisSchema.parse({
        leadScore: 101,
        persona: "Sales leader",
        painPoints: ["Unknown"],
        icebreaker: "Unknown",
        recommendedAction: "Review manually",
        confidence: "medium"
      })
    ).toThrow();
  });

  it("validates a generated DM response", () => {
    const parsed = GeneratedDmSchema.parse({
      message: "Hi Avery, I liked your note about revenue operations.",
      personalizationScore: 82,
      spamRisk: "low",
      warnings: []
    });

    expect(parsed.spamRisk).toBe("low");
  });

  it("validates a license verification response", () => {
    const parsed = LicenseVerifyResponseSchema.parse({
      valid: true,
      plan: "beta_pro",
      status: "active"
    });

    expect(parsed.plan).toBe("beta_pro");
  });
});
