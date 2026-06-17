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

  it("validates v0.2.0 score breakdown and DM variants", () => {
    const parsed = ProfileAnalysisSchema.parse({
      leadScore: 74,
      fitLabel: "Strong fit",
      persona: "RevOps leader",
      painPoints: ["Manual CRM updates"],
      icebreaker: "I noticed your focus on cleaner sales workflows.",
      recommendedAction: "Send a feedback-request DM.",
      recommendedNextAction: "Send the feedback-request variant and create a follow-up task.",
      confidence: "Medium",
      positiveSignals: ["Works near RevOps"],
      negativeSignals: ["HubSpot usage is not explicit"],
      missingInformation: ["Company size"],
      riskWarnings: ["Avoid assuming they use HubSpot"],
      recommendedOutreachAngle: "Feedback request",
      whyThisAngle: "Visible context suggests relevance, but buying intent is not explicit.",
      whatToAvoid: ["Do not overclaim"],
      dmVariants: [
        {
          label: "Soft opener",
          useCase: "Use for a first touch.",
          text: "Hi Avery, noticed your RevOps work and thought this workflow might be relevant.",
          personalizationUsed: ["RevOps work"],
          riskLevel: "Low"
        },
        {
          label: "Direct value pitch",
          useCase: "Use when fit is strong.",
          text: "Hi Avery, this helps HubSpot users save LinkedIn research into CRM notes faster.",
          personalizationUsed: ["HubSpot workflow"],
          riskLevel: "Medium"
        },
        {
          label: "Feedback request",
          useCase: "Use for early product feedback.",
          text: "Hi Avery, I am looking for feedback from people close to RevOps workflows.",
          personalizationUsed: ["RevOps workflows"],
          riskLevel: "Low"
        }
      ]
    });

    expect(parsed.confidence).toBe("medium");
    expect(parsed.dmVariants).toHaveLength(3);
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
      status: "active",
      source: "tester",
      type: "tester",
      expiresAt: "2099-01-01T00:00:00.000Z"
    });

    expect(parsed.plan).toBe("beta_pro");
    expect(parsed.source).toBe("tester");
  });

  it("validates a revoked Pro license verification response", () => {
    const parsed = LicenseVerifyResponseSchema.parse({
      valid: false,
      plan: "free",
      status: "revoked",
      source: "tester",
      type: "tester",
      message: "This license is no longer active."
    });

    expect(parsed.status).toBe("revoked");
  });
});
