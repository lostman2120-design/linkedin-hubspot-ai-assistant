import { describe, expect, it } from "vitest";
import {
  buildHubSpotAnalysisNoteBody,
  buildHubSpotContactSyncPayload,
  getConfiguredHubSpotAiPropertyMapping,
  mapProfileToHubSpotProperties
} from "../utils/hubspotMapping.js";

const analysis = {
  leadScore: 84,
  persona: "Founder-led B2B SaaS buyer",
  painPoints: ["Manual CRM updates", "Inconsistent follow-up"],
  icebreaker: "Noticed your team is scaling outbound while keeping CRM data clean.",
  recommendedAction: "Send a concise first DM and save the lead context in HubSpot.",
  confidence: "high" as const
};

const generatedDm = {
  message: "Saw your work on retention. Thought this might be relevant for keeping HubSpot cleaner after LinkedIn research.",
  personalizationScore: 82,
  spamRisk: "low" as const,
  warnings: []
};

describe("mapProfileToHubSpotProperties", () => {
  it("maps visible LinkedIn fields to HubSpot contact properties", () => {
    expect(
      mapProfileToHubSpotProperties(
        {
          fullName: "Avery Johnson",
          jobTitle: "VP Sales",
          companyName: "Example Corp",
          profileUrl: "https://www.linkedin.com/in/avery-johnson/"
        },
        "lead"
      )
    ).toEqual({
      firstname: "Avery",
      lastname: "Johnson",
      jobtitle: "VP Sales",
      company: "Example Corp",
      hs_linkedin_url: "https://www.linkedin.com/in/avery-johnson/",
      lifecyclestage: "lead"
    });
  });

  it("adds AI fields when custom HubSpot properties are configured", () => {
    const payload = buildHubSpotContactSyncPayload({
      profile: {
        fullName: "Avery Johnson",
        headline: "VP Sales at Example Corp",
        companyName: "Example Corp",
        profileUrl: "https://www.linkedin.com/in/avery-johnson/"
      },
      analysis,
      generatedDm,
      lifecycleStage: "lead",
      aiPropertyMapping: {
        leadScore: "ai_lead_score",
        leadFit: "ai_lead_fit",
        persona: "ai_persona",
        nextAction: "ai_next_action",
        personalizationScore: "ai_personalization_score",
        spamRisk: "ai_spam_risk"
      }
    });

    expect(payload.properties).toMatchObject({
      firstname: "Avery",
      lastname: "Johnson",
      company: "Example Corp",
      jobtitle: "VP Sales at Example Corp",
      lifecyclestage: "lead",
      hs_linkedin_url: "https://www.linkedin.com/in/avery-johnson/",
      ai_lead_score: "84",
      ai_lead_fit: "Strong fit",
      ai_persona: "Founder-led B2B SaaS buyer",
      ai_next_action: "Send a concise first DM and save the lead context in HubSpot.",
      ai_personalization_score: "82",
      ai_spam_risk: "low"
    });
    expect(payload.customPropertyKeys).toEqual([
      "ai_lead_score",
      "ai_lead_fit",
      "ai_persona",
      "ai_next_action",
      "ai_personalization_score",
      "ai_spam_risk"
    ]);
  });

  it("keeps contact creation possible when AI custom properties are not configured", () => {
    const payload = buildHubSpotContactSyncPayload({
      profile: {
        fullName: "Avery Johnson",
        companyName: "Example Corp",
        profileUrl: "https://www.linkedin.com/in/avery-johnson/"
      },
      analysis,
      generatedDm,
      aiPropertyMapping: {}
    });

    expect(payload.properties).toEqual({
      firstname: "Avery",
      lastname: "Johnson",
      company: "Example Corp",
      hs_linkedin_url: "https://www.linkedin.com/in/avery-johnson/"
    });
    expect(payload.customPropertyKeys).toEqual([]);
    expect(payload.skippedProperties).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "leadScore", reason: "custom property not configured" }),
        expect.objectContaining({ field: "persona", reason: "custom property not configured" }),
        expect.objectContaining({ field: "nextAction", reason: "custom property not configured" })
      ])
    );
  });

  it("reads configured AI property names from environment variables", () => {
    const mapping = getConfiguredHubSpotAiPropertyMapping({
      HUBSPOT_SYNC_AI_CONTACT_PROPERTIES: "true",
      HUBSPOT_AI_PERSONA_PROPERTY: "custom_persona",
      HUBSPOT_AI_SPAM_RISK_PROPERTY: "off"
    });

    expect(mapping).toMatchObject({
      leadScore: "ai_lead_score",
      leadFit: "ai_lead_fit",
      persona: "custom_persona",
      nextAction: "ai_next_action"
    });
    expect(mapping.spamRisk).toBeUndefined();
  });

  it("builds a structured HubSpot note with profile, analysis, and DM details", () => {
    const noteBody = buildHubSpotAnalysisNoteBody({
      profile: {
        fullName: "Avery Johnson",
        headline: "VP Sales at Example Corp",
        companyName: "Example Corp",
        location: "Austin, Texas",
        profileUrl: "https://www.linkedin.com/in/avery-johnson/"
      },
      analysis: {
        ...analysis,
        fitLabel: "Strong fit",
        positiveSignals: ["Works near RevOps"],
        negativeSignals: ["HubSpot usage is not explicit"],
        missingInformation: ["Company size"],
        riskWarnings: ["Avoid direct pitch"],
        recommendedOutreachAngle: "Feedback request",
        whyThisAngle: "The profile is relevant, but buying intent is not explicit.",
        whatToAvoid: ["Do not claim they use HubSpot"],
        dmVariants: [
          {
            label: "Soft opener",
            useCase: "Use for first contact.",
            text: "Hi Avery, noticed your RevOps work.",
            personalizationUsed: ["RevOps work"],
            riskLevel: "low"
          },
          {
            label: "Direct value pitch",
            useCase: "Use when the fit is strong.",
            text: "Hi Avery, this helps HubSpot users save LinkedIn research.",
            personalizationUsed: ["HubSpot users"],
            riskLevel: "medium"
          },
          {
            label: "Feedback request",
            useCase: "Use for early feedback.",
            text: "Hi Avery, I am looking for feedback from RevOps leaders.",
            personalizationUsed: ["RevOps leaders"],
            riskLevel: "low"
          }
        ]
      },
      generatedDm
    });

    expect(noteBody).toContain("LinkedIn to HubSpot AI Assistant Summary");
    expect(noteBody).toContain("https://www.linkedin.com/in/avery-johnson/");
    expect(noteBody).toContain("84 (Strong fit)");
    expect(noteBody).toContain("Founder-led B2B SaaS buyer");
    expect(noteBody).toContain("Manual CRM updates");
    expect(noteBody).toContain("Feedback request");
    expect(noteBody).toContain("DM drafts");
    expect(noteBody).toContain("Suggested DM");
  });

  it("maps LinkedIn profile URL to HubSpot's default hs_linkedin_url property", () => {
    const properties = mapProfileToHubSpotProperties({
      fullName: "Avery Johnson",
      profileUrl: "https://www.linkedin.com/in/avery-johnson/"
    });

    expect(properties.hs_linkedin_url).toBe("https://www.linkedin.com/in/avery-johnson/");
    expect(properties.linkedin_url).toBeUndefined();
  });

  it("does not send Unknown as a HubSpot contact first name", () => {
    expect(() =>
      mapProfileToHubSpotProperties({
        fullName: "Unable to extract this field",
        companyName: "Example Corp",
        profileUrl: "https://www.linkedin.com/in/avery-johnson/"
      })
    ).toThrow("Could not detect the LinkedIn profile name.");
  });

  it("blocks company-only extraction before creating a HubSpot payload", () => {
    expect(() =>
      mapProfileToHubSpotProperties({
        fullName: "Example Corp",
        companyName: "Example Corp",
        profileUrl: "https://www.linkedin.com/in/avery-johnson/"
      })
    ).toThrow("Could not detect the LinkedIn profile name.");
  });

  it("does not write fake placeholder values to HubSpot properties", () => {
    const properties = mapProfileToHubSpotProperties(
      {
        fullName: "Avery Johnson",
        headline: "Unknown",
        jobTitle: "N/A",
        companyName: "--",
        location: "Unable to extract this field",
        profileUrl: "https://www.linkedin.com/in/avery-johnson/"
      },
      "lead"
    );

    expect(properties).toEqual({
      firstname: "Avery",
      lastname: "Johnson",
      hs_linkedin_url: "https://www.linkedin.com/in/avery-johnson/",
      lifecyclestage: "lead"
    });
  });
});
