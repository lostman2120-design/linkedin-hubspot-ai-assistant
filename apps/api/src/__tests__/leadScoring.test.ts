import { describe, expect, it } from "vitest";
import { DEFAULT_USER_SETTINGS } from "@linkedin-hubspot-ai/shared";
import { buildLeadScoringContext, normalizeProfileAnalysisScore } from "../services/leadScoring.js";

describe("lead scoring normalization", () => {
  it("returns different normalized scores for different mock profiles", () => {
    const settings = {
      ...DEFAULT_USER_SETTINGS,
      productOrServiceDescription: "RevOps analytics for B2B SaaS sales teams",
      targetCustomerProfile: "VP Sales and revenue operations leaders at B2B SaaS companies"
    };
    const strongFit = normalizeProfileAnalysisScore(
      {
        leadScore: 70,
        persona: "Revenue leader",
        painPoints: ["Pipeline visibility", "Sales productivity"],
        icebreaker: "I noticed your focus on revenue operations.",
        recommendedAction: "Send a concise RevOps note.",
        confidence: "high"
      },
      {
        fullName: "Avery Johnson",
        jobTitle: "VP Sales",
        companyName: "B2B SaaS Co",
        headline: "VP Sales at B2B SaaS Co",
        profileUrl: "https://www.linkedin.com/in/avery/"
      },
      settings
    );
    const weakFit = normalizeProfileAnalysisScore(
      {
        leadScore: 70,
        persona: "Academic profile",
        painPoints: ["Unknown"],
        icebreaker: "Unknown",
        recommendedAction: "Do not prioritize outreach.",
        confidence: "medium"
      },
      {
        fullName: "Jordan Lee",
        jobTitle: "Professor",
        headline: "Professor of history",
        profileUrl: "https://www.linkedin.com/in/jordan/"
      },
      settings
    );

    expect(strongFit.leadScore).not.toBe(weakFit.leadScore);
    expect(strongFit.leadScore).toBeGreaterThan(weakFit.leadScore);
  });

  it("uses generic B2B fallback context when scoring settings are empty", () => {
    const context = buildLeadScoringContext(
      {
        fullName: "Morgan Smith",
        jobTitle: "Head of Customer Success",
        companyName: "SaaS Co",
        profileUrl: "https://www.linkedin.com/in/morgan/"
      },
      { ...DEFAULT_USER_SETTINGS }
    );

    expect(context.heuristicScore).toBeGreaterThan(0);
    expect(context.missingSettingsWarning).toContain("generic B2B SaaS");
  });

  it("marks low-confidence sparse profiles as unknown instead of keeping a fake fixed score", () => {
    const normalized = normalizeProfileAnalysisScore(
      {
        leadScore: 70,
        persona: "Unknown",
        painPoints: ["Unknown"],
        icebreaker: "Unknown",
        recommendedAction: "Review manually.",
        confidence: "low"
      },
      {
        fullName: "Unknown Person",
        profileUrl: "https://www.linkedin.com/in/unknown/"
      },
      { ...DEFAULT_USER_SETTINGS }
    );

    expect(normalized.leadScore).toBe(0);
  });
});

