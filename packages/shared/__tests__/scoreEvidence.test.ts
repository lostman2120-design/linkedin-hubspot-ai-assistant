import { describe, expect, it } from "vitest";
import { ProfileAnalysisSchema } from "../index.js";

const baseAnalysis = {
  leadScore: 72,
  fitLabel: "Possible fit",
  persona: "RevOps leader",
  painPoints: ["Manual CRM work"],
  icebreaker: "I noticed your work around sales operations.",
  recommendedAction: "Send a concise feedback request.",
  recommendedNextAction: "Review the feedback request draft.",
  confidence: "medium",
  recommendedOutreachAngle: "Feedback request",
  whyThisAngle: "The visible profile suggests relevance without overclaiming.",
  dmVariants: [
    {
      label: "Soft opener",
      useCase: "Use for a light first touch.",
      text: "Hi Avery, noticed your RevOps work and thought this workflow may be relevant.",
      personalizationUsed: ["RevOps work"],
      offerContextUsed: ["LinkedIn to HubSpot workflow"],
      factsUsed: ["Visible RevOps headline"],
      inferencesUsed: ["May care about CRM hygiene"],
      warnings: ["Do not claim HubSpot usage unless visible"],
      riskLevel: "low"
    }
  ]
};

describe("score evidence schema", () => {
  it("parses a complete v0.3 analysis response", () => {
    const parsed = ProfileAnalysisSchema.parse({
      ...baseAnalysis,
      scoreEvidence: [
        {
          id: "ev-role-1",
          signalType: "positive",
          basis: "fact",
          category: "role",
          summary: "Works in RevOps",
          evidenceText: "RevOps Lead at Example Corp",
          sourceSection: "headline",
          confidence: "High",
          scoreImpact: 18
        },
        {
          id: "ev-inference-1",
          signalType: "positive",
          basis: "inference",
          category: "technology",
          summary: "May influence CRM workflow decisions",
          evidenceText: "RevOps Lead",
          sourceSection: "headline",
          confidence: "Medium",
          scoreImpact: 8
        }
      ],
      scoringMetadata: {
        scoringVersion: "0.3.0",
        finalScore: 72,
        fitLabel: "Possible fit",
        confidence: "medium",
        factsUsedCount: 1,
        inferencesUsedCount: 1,
        missingCriteriaCount: 2,
        disqualifierCount: 0,
        analysisDepth: "standard"
      }
    });

    expect(parsed.scoreEvidence).toHaveLength(2);
    expect(parsed.scoreEvidence[0].basis).toBe("fact");
    expect(parsed.scoringMetadata.finalScore).toBe(72);
    expect(parsed.dmVariants[0].offerContextUsed).toContain("LinkedIn to HubSpot workflow");
  });

  it("rejects overly long evidence excerpts", () => {
    const result = ProfileAnalysisSchema.safeParse({
      ...baseAnalysis,
      scoreEvidence: [
        {
          id: "ev-long",
          signalType: "positive",
          basis: "fact",
          category: "profile",
          summary: "Too long",
          evidenceText: "A".repeat(260),
          sourceSection: "about",
          confidence: "High",
          scoreImpact: 5
        }
      ]
    });

    expect(result.success).toBe(false);
  });

  it("defaults missing v0.3 fields for old v0.2 analysis objects", () => {
    const parsed = ProfileAnalysisSchema.parse(baseAnalysis);

    expect(parsed.scoreEvidence).toEqual([]);
    expect(parsed.scoringMetadata.scoringVersion).toBe("0.4.0");
    expect(parsed.scoringMetadata.analysisDepth).toBe("limited");
  });
});
