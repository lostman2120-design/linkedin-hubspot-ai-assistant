import { describe, expect, it } from "vitest";
import { normalizeAnalysisResult } from "../sidebar/analysisNormalizer";

describe("normalizeAnalysisResult", () => {
  it("keeps complete v0.2 analysis results render-safe", () => {
    const normalized = normalizeAnalysisResult({
      leadScore: 74,
      fitLabel: "Strong fit",
      confidence: "Medium",
      persona: "RevOps leader",
      painPoints: ["Manual CRM updates"],
      icebreaker: "I noticed your work around CRM hygiene.",
      recommendedAction: "Send a feedback request.",
      recommendedNextAction: "Send the feedback-request draft.",
      positiveSignals: ["Works near RevOps"],
      negativeSignals: ["HubSpot usage is not explicit"],
      missingInformation: ["Company size"],
      riskWarnings: ["Avoid assuming tool usage"],
      recommendedOutreachAngle: "Feedback request",
      whyThisAngle: "The visible profile suggests relevance without clear buying intent.",
      whatToAvoid: ["Do not overclaim"],
      dmVariants: [
        {
          label: "Soft opener",
          useCase: "Use for first contact.",
          text: "Hi Avery, noticed your RevOps work and thought this might be relevant.",
          personalizationUsed: ["RevOps work"],
          riskLevel: "Low"
        }
      ]
    });

    expect(normalized.confidence).toBe("medium");
    expect(normalized.positiveSignals).toEqual(["Works near RevOps"]);
    expect(normalized.dmVariants[0]).toMatchObject({ label: "Soft opener", riskLevel: "low" });
  });

  it("turns missing or malformed arrays into empty arrays", () => {
    const normalized = normalizeAnalysisResult({
      leadScore: "72",
      confidence: null,
      positiveSignals: undefined,
      negativeSignals: "HubSpot usage is not visible",
      missingInformation: null,
      riskWarnings: [null, "Avoid a hard pitch"],
      whatToAvoid: undefined,
      dmVariants: null
    });

    expect(normalized.leadScore).toBe(72);
    expect(normalized.confidence).toBe("low");
    expect(normalized.positiveSignals).toEqual([]);
    expect(normalized.negativeSignals).toEqual(["HubSpot usage is not visible"]);
    expect(normalized.missingInformation).toEqual([]);
    expect(normalized.riskWarnings).toEqual(["Avoid a hard pitch"]);
    expect(normalized.whatToAvoid).toEqual([]);
    expect(normalized.dmVariants).toEqual([]);
  });

  it("handles old-format v0.1 analysis responses without crashing render code", () => {
    const normalized = normalizeAnalysisResult({
      leadScore: 64,
      persona: "Sales leader",
      painPoints: ["Manual prospecting"],
      icebreaker: "Saw your sales leadership background.",
      recommendedAction: "Review manually",
      confidence: "high"
    });

    expect(normalized.fitLabel).toBe("Not enough data");
    expect(normalized.positiveSignals).toEqual([]);
    expect(normalized.dmVariants).toEqual([]);
    expect(normalized.recommendedAction).toBe("Review manually");
  });

  it("filters malformed DM variants and normalizes valid ones", () => {
    const normalized = normalizeAnalysisResult({
      leadScore: 88,
      confidence: "high",
      dmVariants: [
        { label: "Custom label", text: "Useful draft", personalizationUsed: "RevOps", riskLevel: "HIGH" },
        { label: "Feedback request", text: "", riskLevel: "low" },
        "bad"
      ]
    });

    expect(normalized.dmVariants).toHaveLength(1);
    expect(normalized.dmVariants[0]).toMatchObject({
      label: "Soft opener",
      text: "Useful draft",
      personalizationUsed: ["RevOps"],
      riskLevel: "high"
    });
  });

  it("normalizes v0.3 score evidence and metadata without trusting malformed items", () => {
    const normalized = normalizeAnalysisResult({
      leadScore: 81,
      confidence: "high",
      scoreEvidence: [
        {
          id: "ev-visible",
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
          id: "ev-bad",
          signalType: "positive",
          basis: "fact",
          category: "role",
          summary: "A".repeat(400),
          evidenceText: "B".repeat(400),
          sourceSection: "headline",
          confidence: "High",
          scoreImpact: 500
        },
        null
      ],
      scoringMetadata: {
        scoringVersion: "0.3.0",
        finalScore: 81,
        fitLabel: "Strong fit",
        confidence: "high",
        factsUsedCount: 1,
        inferencesUsedCount: 0,
        missingCriteriaCount: 1,
        disqualifierCount: 0,
        analysisDepth: "standard"
      }
    });

    expect(normalized.scoreEvidence).toHaveLength(2);
    expect(normalized.scoreEvidence[0]).toMatchObject({ basis: "fact", sourceSection: "headline" });
    expect(normalized.scoreEvidence[1].summary.length).toBeLessThanOrEqual(240);
    expect(normalized.scoreEvidence[1].evidenceText?.length).toBeLessThanOrEqual(220);
    expect(normalized.scoreEvidence[1].scoreImpact).toBe(100);
    expect(normalized.scoringMetadata).toMatchObject({ finalScore: 81, analysisDepth: "standard" });
  });

  it("keeps old v0.2 analysis responses render-safe when evidence is missing", () => {
    const normalized = normalizeAnalysisResult({
      leadScore: 62,
      persona: "Sales leader",
      painPoints: ["Manual CRM work"],
      icebreaker: "Saw your sales leadership background.",
      recommendedAction: "Review manually.",
      confidence: "medium",
      scoreEvidence: null
    });

    expect(normalized.scoreEvidence).toEqual([]);
    expect(normalized.scoringMetadata.analysisDepth).toBe("limited");
  });
});
