import { describe, expect, it } from "vitest";
import { DEFAULT_SELLER_CONTEXT, DEFAULT_USER_SETTINGS } from "@linkedin-hubspot-ai/shared";
import { buildHubSpotAnalysisNoteBody } from "../utils/hubspotMapping.js";

describe("v0.3 HubSpot analysis note", () => {
  it("includes ICP, Seller Context summary, score evidence, and DM variants", () => {
    const note = buildHubSpotAnalysisNoteBody({
      profile: {
        fullName: "Avery Johnson",
        headline: "RevOps Lead at Example Corp",
        companyName: "Example Corp",
        profileUrl: "https://www.linkedin.com/in/avery/"
      },
      userSettings: {
        ...DEFAULT_USER_SETTINGS,
        targetRoles: "RevOps, Sales leaders",
        targetIndustries: "B2B SaaS",
        sellerContext: {
          ...DEFAULT_SELLER_CONTEXT,
          productOrServiceName: "LinkedIn to HubSpot AI Assistant",
          targetOutcome: "Reduce manual LinkedIn to HubSpot copy-paste.",
          preferredCta: "Ask for workflow feedback."
        }
      },
      analysis: {
        leadScore: 78,
        fitLabel: "Possible fit",
        persona: "RevOps leader",
        painPoints: ["Manual CRM work"],
        icebreaker: "I noticed your RevOps work.",
        recommendedAction: "Send a feedback request.",
        recommendedNextAction: "Review the feedback-request draft.",
        confidence: "medium",
        recommendedOutreachAngle: "Feedback request",
        whyThisAngle: "Visible RevOps context suggests a soft ask.",
        whatToAvoid: ["Do not claim HubSpot usage."],
        positiveSignals: ["RevOps role"],
        negativeSignals: [],
        missingInformation: ["HubSpot usage is not visible"],
        riskWarnings: ["Avoid overclaiming"],
        scoreEvidence: [
          {
            id: "ev-role",
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
            id: "ev-inference",
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
          finalScore: 78,
          fitLabel: "Possible fit",
          confidence: "medium",
          factsUsedCount: 1,
          inferencesUsedCount: 1,
          missingCriteriaCount: 1,
          disqualifierCount: 0,
          analysisDepth: "standard"
        },
        dmVariants: [
          {
            label: "Feedback request",
            useCase: "Use for a soft ask.",
            text: "Hi Avery, noticed your RevOps work. Would feedback on a LinkedIn to HubSpot workflow be useful?",
            personalizationUsed: ["RevOps work"],
            offerContextUsed: ["LinkedIn to HubSpot AI Assistant"],
            factsUsed: ["RevOps Lead at Example Corp"],
            inferencesUsed: ["May influence CRM workflow decisions"],
            warnings: ["Do not claim HubSpot usage."],
            riskLevel: "low"
          }
        ]
      }
    });

    expect(note).toContain("Active ICP summary");
    expect(note).toContain("Offer/product");
    expect(note).toContain("LinkedIn to HubSpot AI Assistant");
    expect(note).toContain("Analysis depth");
    expect(note).toContain("Confirmed positive evidence");
    expect(note).toContain("AI inferences");
    expect(note).toContain("RevOps Lead at Example Corp");
    expect(note).toContain("DM drafts");
    expect(note).toContain("v0.3.0");
    expect(note).not.toContain("Guaranteed revenue");
  });
});
