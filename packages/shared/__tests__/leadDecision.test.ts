import { describe, expect, it } from "vitest";
import {
  OutreachStrategySchema,
  ProfileAnalysisSchema,
  RecommendedActionSchema,
  normalizeRecommendedAction
} from "../index.js";

describe("v0.4 lead decision schema", () => {
  it("validates only the four supported recommended actions", () => {
    expect(RecommendedActionSchema.parse("Pursue now")).toBe("Pursue now");
    expect(RecommendedActionSchema.safeParse("Send a DM").success).toBe(false);
  });

  it("normalizes known recommended action aliases", () => {
    expect(normalizeRecommendedAction(" pursue ", 10)).toBe("Pursue now");
    expect(normalizeRecommendedAction("CONTACT NOW", 10)).toBe("Pursue now");
    expect(normalizeRecommendedAction("needs research", 90)).toBe("Research more");
    expect(normalizeRecommendedAction("low priority", 90)).toBe("Low priority");
    expect(normalizeRecommendedAction("don't contact yet", 90)).toBe("Do not contact yet");
  });

  it("uses the score fallback for unknown recommended actions", () => {
    expect(normalizeRecommendedAction("Maybe later", 85)).toBe("Pursue now");
    expect(normalizeRecommendedAction("Maybe later", 60)).toBe("Research more");
    expect(normalizeRecommendedAction("Maybe later", 40)).toBe("Low priority");
    expect(normalizeRecommendedAction("Maybe later", 20)).toBe("Do not contact yet");
  });

  it("validates a complete outreach strategy", () => {
    const strategy = OutreachStrategySchema.parse({
      whyRelevant: "The visible role owns sales operations.",
      bestAngle: "CRM hygiene and seller productivity",
      painHypothesis: "Manual LinkedIn research may be difficult to preserve in CRM.",
      whatToAvoid: "Do not assume the prospect uses HubSpot.",
      suggestedCTA: "Ask whether cleaner lead context is a current priority."
    });

    expect(strategy.bestAngle).toBe("CRM hygiene and seller productivity");
  });

  it("keeps a valid v0.3 response working with safe v0.4 fallbacks", () => {
    const analysis = ProfileAnalysisSchema.parse({
      leadScore: 62,
      persona: "Revenue operations leader",
      painPoints: ["Keeping CRM context complete"],
      icebreaker: "I noticed your focus on revenue operations.",
      recommendedAction: "Send a concise feedback request.",
      recommendedOutreachAngle: "Feedback request",
      whyThisAngle: "The visible role is relevant, but buying intent is not confirmed.",
      whatToAvoid: ["Do not assume HubSpot usage"],
      confidence: "medium"
    });

    expect(analysis.recommendedAction).toBe("Research more");
    expect(analysis.outreachStrategy).toMatchObject({
      whyRelevant: "The visible role is relevant, but buying intent is not confirmed.",
      bestAngle: "Feedback request",
      painHypothesis: "Keeping CRM context complete",
      whatToAvoid: "Do not assume HubSpot usage"
    });
  });
});
