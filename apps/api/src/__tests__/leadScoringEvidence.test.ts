import { describe, expect, it } from "vitest";
import { DEFAULT_USER_SETTINGS } from "@linkedin-hubspot-ai/shared";
import { buildLeadScoringContext, normalizeProfileAnalysisScore } from "../services/leadScoring.js";

describe("evidence-based lead scoring", () => {
  it("creates confirmed fact evidence from visible profile text", () => {
    const context = buildLeadScoringContext(
      {
        fullName: "Avery Johnson",
        headline: "RevOps Lead at B2B SaaS Co",
        companyName: "B2B SaaS Co",
        profileUrl: "https://www.linkedin.com/in/avery/",
        about: "Helping B2B SaaS revenue teams improve HubSpot workflow quality."
      },
      {
        ...DEFAULT_USER_SETTINGS,
        targetRoles: "RevOps, Revenue Operations",
        targetIndustries: "B2B SaaS",
        mainPainPointsSolved: "HubSpot workflow quality, manual CRM entry"
      }
    );

    expect(context.scoreEvidence.some((item) => item.basis === "fact" && item.signalType === "positive")).toBe(true);
    expect(context.scoreEvidence.some((item) => item.evidenceText?.includes("RevOps Lead"))).toBe(true);
    expect(context.scoringMetadata.factsUsedCount).toBeGreaterThan(0);
  });

  it("keeps missing information separate from facts", () => {
    const context = buildLeadScoringContext(
      {
        fullName: "Jordan Lee",
        profileUrl: "https://www.linkedin.com/in/jordan/"
      },
      DEFAULT_USER_SETTINGS
    );

    expect(context.scoreEvidence.some((item) => item.signalType === "missing" && item.basis === "fact")).toBe(true);
    expect(context.scoreEvidence.filter((item) => item.signalType === "positive")).toHaveLength(0);
  });

  it("adds disqualifier evidence and reduces fit for excluded roles", () => {
    const normalized = normalizeProfileAnalysisScore(
      {
        leadScore: 70,
        persona: "Academic profile",
        painPoints: ["Unknown"],
        icebreaker: "Unknown",
        recommendedAction: "Research first.",
        confidence: "medium"
      },
      {
        fullName: "Jordan Lee",
        headline: "Student intern",
        profileUrl: "https://www.linkedin.com/in/jordan/"
      },
      {
        ...DEFAULT_USER_SETTINGS,
        excludedRoles: "student, intern"
      }
    );

    expect(normalized.scoreEvidence.some((item) => item.signalType === "disqualifier")).toBe(true);
    expect(normalized.scoringMetadata.disqualifierCount).toBeGreaterThan(0);
    expect(normalized.leadScore).toBeLessThan(70);
  });

  it("does not invent HubSpot usage or company size when not visible", () => {
    const context = buildLeadScoringContext(
      {
        fullName: "Morgan Smith",
        headline: "Head of Sales",
        profileUrl: "https://www.linkedin.com/in/morgan/"
      },
      DEFAULT_USER_SETTINGS
    );

    const evidenceText = JSON.stringify(context.scoreEvidence).toLowerCase();
    expect(evidenceText).not.toContain("uses hubspot");
    expect(evidenceText).not.toContain("company size is");
    expect(context.scoreEvidence.some((item) => item.signalType === "missing" && item.category === "company_size")).toBe(true);
  });
});
