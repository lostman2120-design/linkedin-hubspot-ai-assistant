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

  it("does not count LinkedIn URL or profile labels as pain-point evidence", () => {
    const context = buildLeadScoringContext(
      {
        fullName: "Jordan Lee",
        profileUrl: "https://www.linkedin.com/in/jordan/",
        visibleTextSample: "LinkedIn profile LinkedIn URL https://www.linkedin.com/in/jordan/"
      },
      DEFAULT_USER_SETTINGS
    );

    expect(context.decisionSignals.operationalPainEvidence).toBe(false);
    expect(context.scoreEvidence.filter((item) => item.signalType === "positive" && item.category === "pain_point")).toHaveLength(0);
  });

  it("does not turn a Founder title alone into Strong fit", () => {
    const normalized = normalizeProfileAnalysisScore(
      {
        leadScore: 82,
        fitLabel: "Strong fit",
        persona: "Founder",
        painPoints: ["Unknown"],
        icebreaker: "Noticed your founder role.",
        recommendedAction: "Pursue now",
        confidence: "high"
      },
      {
        fullName: "Taylor Morgan",
        headline: "Founder",
        companyName: "Stealth Company",
        currentRoleCompany: "Stealth Company",
        profileUrl: "https://www.linkedin.com/in/taylor/"
      },
      DEFAULT_USER_SETTINGS
    );

    expect(normalized.fitLabel).not.toBe("Strong fit");
    expect(normalized.leadScore).toBeLessThanOrEqual(54);
    expect(normalized.recommendedAction).not.toBe("Pursue now");
  });

  it("keeps a high-profile philanthropy founder fixture below Strong fit", () => {
    const normalized = normalizeProfileAnalysisScore(
      {
        leadScore: 74,
        fitLabel: "Strong fit",
        persona: "High-profile founder and philanthropist",
        painPoints: ["LinkedIn prospecting"],
        icebreaker: "Noticed your foundation work.",
        recommendedAction: "Research more",
        confidence: "high"
      },
      {
        fullName: "Bill Gates",
        headline: "Co-chair at Gates Foundation | Founder | Philanthropist",
        companyName: "Gates Foundation",
        currentRoleCompany: "Gates Foundation",
        about: "Focused on global health, education, philanthropy, and nonprofit initiatives.",
        profileUrl: "https://www.linkedin.com/in/williamhgates/"
      },
      DEFAULT_USER_SETTINGS
    );

    expect(normalized.fitLabel).not.toBe("Strong fit");
    expect(normalized.leadScore).toBeLessThanOrEqual(39);
    expect(["Low priority", "Do not contact yet"]).toContain(normalized.recommendedAction);
    expect(normalized.actionReason).toContain("outside the saved commercial ICP");
    expect(normalized.actionReason).not.toMatch(/DM|message angle/i);
    expect(normalized.positiveSignals.join(" ")).not.toMatch(/non-ICP|public|nonprofit|investor|government/i);
    expect([...normalized.negativeSignals, ...normalized.riskWarnings].join(" ")).toContain("outside the saved commercial ICP");
  });

  it("allows Strong fit when several independent ICP and operational signals are visible", () => {
    const normalized = normalizeProfileAnalysisScore(
      {
        leadScore: 90,
        fitLabel: "Strong fit",
        persona: "RevOps buyer",
        painPoints: ["CRM hygiene", "Outbound workflow quality"],
        icebreaker: "Noticed your RevOps work.",
        recommendedAction: "Pursue now",
        confidence: "high"
      },
      {
        fullName: "Avery Johnson",
        headline: "RevOps Lead at Acme B2B SaaS",
        companyName: "Acme B2B SaaS",
        currentRoleCompany: "Acme B2B SaaS",
        about: "Owns HubSpot CRM hygiene, outbound lead generation, and sales operations for a 51-200 employees B2B SaaS team.",
        profileUrl: "https://www.linkedin.com/in/avery/"
      },
      DEFAULT_USER_SETTINGS
    );

    expect(normalized.fitLabel).toBe("Strong fit");
    expect(normalized.leadScore).toBeGreaterThanOrEqual(80);
    expect(normalized.recommendedAction).toBe("Pursue now");
  });

  it("deduplicates repeated AI inferences and strips URLs from evidence", () => {
    const repeatedInference = {
      id: "ai-inference-1",
      signalType: "positive" as const,
      basis: "inference" as const,
      category: "technology" as const,
      summary: "May influence CRM workflow decisions",
      evidenceText: "LinkedIn URL: https://www.linkedin.com/in/avery/ RevOps Lead at Acme",
      sourceSection: "headline" as const,
      confidence: "Medium" as const,
      scoreImpact: 5
    };
    const normalized = normalizeProfileAnalysisScore(
      {
        leadScore: 70,
        persona: "RevOps lead",
        painPoints: ["CRM hygiene"],
        icebreaker: "Noticed your RevOps work.",
        recommendedAction: "Research more",
        confidence: "medium",
        scoreEvidence: [repeatedInference, { ...repeatedInference, id: "ai-inference-2" }]
      },
      {
        fullName: "Avery Johnson",
        headline: "RevOps Lead at Acme",
        profileUrl: "https://www.linkedin.com/in/avery/"
      },
      DEFAULT_USER_SETTINGS
    );

    expect(normalized.scoreEvidence.filter((item) => item.summary === repeatedInference.summary)).toHaveLength(1);
    expect(JSON.stringify(normalized.scoreEvidence)).not.toContain("https://www.linkedin.com");
  });

  it("does not trust a company extracted from a low-confidence unrelated source", () => {
    const context = buildLeadScoringContext(
      {
        fullName: "Avery Johnson",
        headline: "Independent advisor",
        companyName: "Unrelated Enterprise",
        extractionSources: { companyName: "generic related-company link" },
        contextConfidence: "low",
        profileUrl: "https://www.linkedin.com/in/avery/"
      },
      DEFAULT_USER_SETTINGS
    );

    expect(context.decisionSignals.reliableCompany).toBe(false);
    expect(context.scoreEvidence).toContainEqual(
      expect.objectContaining({ signalType: "missing", category: "company" })
    );
  });

  it("keeps a Joris-style HubSpot and RevOps consultant at Possible fit or better", () => {
    const settings = {
      ...DEFAULT_USER_SETTINGS,
      targetRoles: "HubSpot Consultant, RevOps Consultant, CRM Consultant, SDR Manager, Sales Operations Lead",
      targetIndustries: "HubSpot consulting, RevOps, B2B SaaS, agencies, CRM implementation",
      mainPainPointsSolved: "HubSpot CRM implementation, CRM hygiene, outbound prospecting, lead generation, RevOps automation"
    };
    const normalized = normalizeProfileAnalysisScore(
      {
        leadScore: 44,
        fitLabel: "Possible fit",
        persona: "HubSpot and RevOps consultant",
        painPoints: ["CRM workflow quality"],
        icebreaker: "Noticed your HubSpot and RevOps consulting work.",
        recommendedAction: "Research more",
        confidence: "medium"
      },
      {
        fullName: "Joris Milloux",
        headline: "Consultant HubSpot CRM (Diamond Partner) | RevOps & AI",
        extractionWarnings: ["Limited profile context detected. AI score may be less accurate."],
        contextConfidence: "medium",
        profileUrl: "https://www.linkedin.com/in/joris-milloux/"
      },
      settings
    );

    expect(normalized.leadScore).toBeGreaterThanOrEqual(60);
    expect(normalized.leadScore).toBeLessThanOrEqual(82);
    expect(["Possible fit", "Strong fit"]).toContain(normalized.fitLabel);
    expect(["Research more", "Pursue now"]).toContain(normalized.recommendedAction);
    expect(normalized.confidence).toBe("medium");
    expect(normalized.actionReason).toBe(
      "HubSpot / CRM / RevOps consultant context is strong, but profile context is limited, so review before outreach."
    );
    expect(normalized.positiveSignals).toContain("Strong HubSpot / CRM / RevOps consultant context");
    expect(normalized.positiveSignals.filter((signal) => /hubspot|crm|revops/i.test(signal)).length).toBeLessThanOrEqual(2);
  });

  it("does not lower a strong profile merely because the detailed target lists contain more unmatched options", () => {
    const profile = {
      fullName: "Joris Milloux",
      headline: "Consultant HubSpot CRM (Diamond Partner) | RevOps & AI",
      extractionWarnings: ["Limited profile context detected. AI score may be less accurate."],
      contextConfidence: "medium" as const,
      profileUrl: "https://www.linkedin.com/in/joris-milloux/"
    };
    const modelAnalysis = {
      leadScore: 44,
      persona: "HubSpot and RevOps consultant",
      painPoints: ["CRM workflow quality"],
      icebreaker: "Noticed your HubSpot work.",
      recommendedAction: "Research more" as const,
      confidence: "medium" as const
    };
    const focused = normalizeProfileAnalysisScore(modelAnalysis, profile, {
      ...DEFAULT_USER_SETTINGS,
      targetRoles: "HubSpot Consultant",
      targetIndustries: "RevOps",
      mainPainPointsSolved: "HubSpot CRM implementation"
    });
    const detailed = normalizeProfileAnalysisScore(modelAnalysis, profile, {
      ...DEFAULT_USER_SETTINGS,
      targetRoles: "HubSpot Consultant, RevOps Consultant, SDR Manager, VP Sales, Marketing Operations Lead, Recruiting Manager",
      targetIndustries: "RevOps, B2B SaaS, agencies, recruiting, consulting, sales technology",
      mainPainPointsSolved: "HubSpot CRM implementation, CRM hygiene, outbound prospecting, lead generation, pipeline reporting"
    });

    expect(detailed.leadScore).toBeGreaterThanOrEqual(focused.leadScore);
    expect(detailed.recommendedAction).not.toBe("Low priority");
  });

  it("allows a score of 90 or more only with deep independent evidence", () => {
    const sparse = normalizeProfileAnalysisScore(
      {
        leadScore: 100,
        persona: "HubSpot consultant",
        painPoints: ["CRM workflows"],
        icebreaker: "Noticed your HubSpot work.",
        recommendedAction: "Pursue now",
        confidence: "high"
      },
      {
        fullName: "Joris Milloux",
        headline: "Consultant HubSpot CRM (Diamond Partner) | RevOps & AI",
        contextConfidence: "medium",
        profileUrl: "https://www.linkedin.com/in/joris-milloux/"
      },
      DEFAULT_USER_SETTINGS
    );
    const deep = normalizeProfileAnalysisScore(
      {
        leadScore: 100,
        persona: "RevOps buyer",
        painPoints: ["CRM hygiene", "Outbound workflows"],
        icebreaker: "Noticed your RevOps work.",
        recommendedAction: "Pursue now",
        confidence: "high"
      },
      {
        fullName: "Avery Johnson",
        headline: "RevOps Lead at Acme B2B SaaS",
        companyName: "Acme B2B SaaS",
        currentRoleCompany: "Acme B2B SaaS",
        currentRoleDescription: "Owns HubSpot CRM hygiene, outbound lead generation, and sales operations.",
        about: "Leads RevOps and CRM implementation for a 51-200 employees B2B SaaS company.",
        contextConfidence: "high",
        profileUrl: "https://www.linkedin.com/in/avery/"
      },
      DEFAULT_USER_SETTINGS
    );
    const lowConfidence = normalizeProfileAnalysisScore(
      {
        leadScore: 100,
        persona: "HubSpot consultant",
        painPoints: ["CRM workflows"],
        icebreaker: "Noticed your HubSpot work.",
        recommendedAction: "Pursue now",
        confidence: "low"
      },
      {
        fullName: "Joris Milloux",
        headline: "Consultant HubSpot CRM (Diamond Partner) | RevOps & AI",
        contextConfidence: "low",
        profileUrl: "https://www.linkedin.com/in/joris-milloux/"
      },
      DEFAULT_USER_SETTINGS
    );

    expect(sparse.leadScore).toBeLessThanOrEqual(82);
    expect(lowConfidence.leadScore).toBeLessThanOrEqual(54);
    expect(lowConfidence.fitLabel).not.toBe("Strong fit");
    expect(deep.leadScore).toBeGreaterThanOrEqual(90);
    expect(deep.confidence).toBe("high");
  });

  it("adds disqualifiers only when the configured exclusion is visible in the profile", () => {
    const settings = {
      ...DEFAULT_USER_SETTINGS,
      excludedRoles: "government, education-only, consumer brand"
    };
    const relevantContext = buildLeadScoringContext(
      {
        fullName: "Joris Milloux",
        headline: "HubSpot CRM Consultant | RevOps",
        about: "Helping B2B teams improve CRM operations.",
        profileUrl: "https://www.linkedin.com/in/joris-milloux/"
      },
      settings
    );
    const excludedContext = buildLeadScoringContext(
      {
        fullName: "Jordan Lee",
        headline: "Government education policy advisor",
        profileUrl: "https://www.linkedin.com/in/jordan/"
      },
      settings
    );

    expect(relevantContext.scoreEvidence.some((item) => item.signalType === "disqualifier")).toBe(false);
    expect(excludedContext.scoreEvidence.some((item) => item.signalType === "disqualifier")).toBe(true);
  });
});
