import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_USER_SETTINGS } from "@linkedin-hubspot-ai/shared";
import { createEnglishOnlyProfileAnalysisSchema } from "../services/openaiPromptRules.js";
import { OpenAiService, normalizeAnalysisResponseForSchema } from "../services/openai.service.js";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("OpenAI analysis response normalization", () => {
  it("normalizes malformed boolean DM variant list fields to empty arrays", () => {
    const normalized = normalizeAnalysisResponseForSchema({
      dmVariants: [
        {
          personalizationUsed: true,
          offerContextUsed: false,
          factsUsed: null,
          inferencesUsed: undefined,
          warnings: true
        }
      ]
    }) as { dmVariants: Array<Record<string, unknown>> };

    expect(normalized.dmVariants[0]?.personalizationUsed).toEqual([]);
    expect(normalized.dmVariants[0]?.offerContextUsed).toEqual([]);
    expect(normalized.dmVariants[0]?.factsUsed).toEqual([]);
    expect(normalized.dmVariants[0]?.inferencesUsed).toEqual([]);
    expect(normalized.dmVariants[0]?.warnings).toEqual([]);
  });

  it("preserves valid string arrays and filters invalid array items", () => {
    const normalized = normalizeAnalysisResponseForSchema({
      dmVariants: [
        {
          personalizationUsed: ["RevOps work", 123, "", "HubSpot workflow"],
          offerContextUsed: ["AI assistant"],
          factsUsed: ["Visible headline"],
          inferencesUsed: ["May care about CRM hygiene"],
          warnings: ["Review manually"]
        }
      ]
    }) as { dmVariants: Array<Record<string, unknown>> };

    expect(normalized.dmVariants[0]?.personalizationUsed).toEqual(["RevOps work", "HubSpot workflow"]);
    expect(normalized.dmVariants[0]?.offerContextUsed).toEqual(["AI assistant"]);
    expect(normalized.dmVariants[0]?.factsUsed).toEqual(["Visible headline"]);
    expect(normalized.dmVariants[0]?.inferencesUsed).toEqual(["May care about CRM hygiene"]);
    expect(normalized.dmVariants[0]?.warnings).toEqual(["Review manually"]);
  });

  it("normalizes known DM variant label aliases before schema validation", () => {
    const normalized = normalizeAnalysisResponseForSchema({
      dmVariants: [
        { label: " Soft opener " },
        { label: " direct   pitch " },
        { label: "Direct value pitch" },
        { label: "feedback request" }
      ]
    }) as { dmVariants: Array<Record<string, unknown>> };

    expect(normalized.dmVariants.map((variant) => variant.label)).toEqual([
      "Soft opener",
      "Direct value pitch",
      "Direct value pitch",
      "Feedback request"
    ]);
  });

  it("keeps unknown DM variant labels invalid", () => {
    const schema = createEnglishOnlyProfileAnalysisSchema();
    const unknownLabelResponse = buildAnalysisResponseWithValidVariantLists();
    unknownLabelResponse.dmVariants[1] = {
      ...unknownLabelResponse.dmVariants[1],
      label: "Helpful nudge"
    };

    const normalized = normalizeAnalysisResponseForSchema(unknownLabelResponse);

    expect(schema.safeParse(normalized).success).toBe(false);
  });

  it("lets all three DM variants pass schema validation after known boolean fields are normalized", () => {
    const schema = createEnglishOnlyProfileAnalysisSchema();
    const normalized = normalizeAnalysisResponseForSchema(buildAnalysisResponseWithBooleanVariantLists());
    const parsed = schema.parse(normalized);

    expect(parsed.dmVariants).toHaveLength(3);
    expect(parsed.dmVariants.every((variant) => Array.isArray(variant.personalizationUsed))).toBe(true);
    expect(parsed.dmVariants.every((variant) => Array.isArray(variant.offerContextUsed))).toBe(true);
  });

  it("normalizes harmless v0.5 decision intelligence field aliases before validation", () => {
    const schema = createEnglishOnlyProfileAnalysisSchema();
    const response = {
      ...buildAnalysisResponseWithValidVariantLists(),
      decisionConfidence: "MEDIUM",
      dataSufficiency: "PARTIAL",
      actionRisks: true,
      actionPrerequisites: null,
      limitedContextReasons: ["Company size missing", 123],
      decisionBreakdown: {
        roleFit: {
          status: "STRONG",
          score: 90,
          explanation: "Visible role match.",
          evidence: ["HubSpot Consultant", false],
          source: "headline",
          basis: "FACT"
        }
      },
      outreachReadiness: {
        readiness: "almost ready",
        readinessScore: 72,
        timingRecommendation: "research first",
        reason: "Research before outreach.",
        blockers: true,
        prerequisites: ["Confirm HubSpot usage"]
      },
      outreachCoach: {
        verdict: "research before sending",
        message: "Review first.",
        mainWarning: "Do not assume pain.",
        recommendedPreparation: "Confirm workflow context.",
        humanReviewRequired: false
      }
    };

    const normalized = normalizeAnalysisResponseForSchema(response) as Record<string, unknown>;
    const parsed = schema.parse(normalized);

    expect(normalized.dataSufficiency).toBe("partial");
    expect(parsed.decisionConfidence).toBe("medium");
    expect(["partial", "insufficient"]).toContain(parsed.dataSufficiency);
    expect(normalized.limitedContextReasons).toEqual(["Company size missing"]);
    expect(parsed.actionRisks).toEqual([]);
    expect(parsed.actionPrerequisites).toEqual([]);
    expect([["Company size missing"], []]).toContainEqual(parsed.limitedContextReasons);
    expect((normalized.decisionBreakdown as { roleFit: { status: string; basis: string } }).roleFit.status).toBe("strong");
    expect((normalized.decisionBreakdown as { roleFit: { status: string; basis: string } }).roleFit.basis).toBe("fact");
    expect((normalized.outreachReadiness as { readiness: string; blockers: string[] }).readiness).toBe("almost_ready");
    expect((normalized.outreachReadiness as { readiness: string; blockers: string[] }).blockers).toEqual([]);
    expect((normalized.outreachCoach as { verdict: string; humanReviewRequired: boolean }).verdict).toBe("Research before sending");
    expect((normalized.outreachCoach as { verdict: string; humanReviewRequired: boolean }).humanReviewRequired).toBe(true);
    if (parsed.decisionBreakdown) {
      expect(parsed.decisionBreakdown.roleFit.status).toBe("strong");
    }
  });

  it("normalizes production v0.5 enum aliases that previously caused a retry", () => {
    const schema = createEnglishOnlyProfileAnalysisSchema();
    const response = {
      ...buildAnalysisResponseWithValidVariantLists(),
      dataSufficiency: "partial",
      decisionBreakdown: {
        dataSufficiency: {
          status: "partial",
          score: 44,
          explanation: "Some evidence is present.",
          evidence: ["Visible headline"],
          source: "headline",
          basis: "fact"
        }
      },
      outreachReadiness: {
        readiness: "low",
        readinessScore: 35,
        timingRecommendation: "Wait until more information is gathered.",
        reason: "More context is needed.",
        blockers: ["No direct pain evidence", "Company size missing", "Buying intent missing"],
        prerequisites: ["Review About", "Confirm CRM ownership", "Review company size"]
      },
      outreachCoach: {
        verdict: "Proceed with caution.",
        message: "Review first.",
        mainWarning: "Do not assume pain.",
        recommendedPreparation: "Gather more context.",
        humanReviewRequired: false
      }
    };

    const normalized = normalizeAnalysisResponseForSchema(response) as Record<string, unknown>;
    const parsed = schema.parse(normalized);

    expect(parsed.decisionBreakdown.dataSufficiency.status).toBe("moderate");
    expect(parsed.outreachReadiness.readiness).toBe("not_ready");
    expect(parsed.outreachReadiness.timingRecommendation).toBe("Research first");
    expect(parsed.outreachReadiness.blockers).toHaveLength(2);
    expect(parsed.outreachReadiness.prerequisites).toHaveLength(2);
    expect(parsed.outreachCoach.verdict).toBe("Research before sending");
    expect(parsed.outreachCoach.humanReviewRequired).toBe(true);
  });

  it.each([
    ["partial", "moderate"],
    ["insufficient", "missing"]
  ])("normalizes dataSufficiency.status %s to %s", (status, expected) => {
    const normalized = normalizeAnalysisResponseForSchema({
      dataSufficiency: status,
      decisionBreakdown: {
        dataSufficiency: {
          status,
          score: 20,
          explanation: "Evidence coverage.",
          evidence: [],
          source: "computed",
          basis: "fact"
        }
      }
    }) as { decisionBreakdown: { dataSufficiency: { status: string } } };

    expect(normalized.decisionBreakdown.dataSufficiency.status).toBe(expected);
  });

  it.each([
    ["low", "not_ready"],
    ["medium", "almost_ready"]
  ])("normalizes outreach readiness %s to %s", (readiness, expected) => {
    const normalized = normalizeAnalysisResponseForSchema({
      outreachReadiness: {
        readiness,
        timingRecommendation: "research first"
      }
    }) as { outreachReadiness: { readiness: string } };

    expect(normalized.outreachReadiness.readiness).toBe(expected);
  });

  it("falls back unknown outreach coach verdict from readiness", () => {
    const normalized = normalizeAnalysisResponseForSchema({
      outreachReadiness: {
        readiness: "avoid",
        timingRecommendation: "Do not contact yet"
      },
      outreachCoach: {
        verdict: "Maybe later"
      }
    }) as { outreachCoach: { verdict: string } };

    expect(normalized.outreachCoach.verdict).toBe("Do not send yet");
  });

  it("does not trigger the retry request for the known boolean-versus-array response shape", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test-key");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      text: async () =>
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify(buildAnalysisResponseWithBooleanVariantLists())
              }
            }
          ]
        })
    });
    vi.stubGlobal("fetch", fetchMock);

    const analysis = await new OpenAiService().analyzeProfile(
      {
        fullName: "Avery Johnson",
        firstName: "Avery",
        lastName: "Johnson",
        headline: "VP Sales at Example Corp",
        companyName: "Example Corp",
        profileUrl: "https://www.linkedin.com/in/avery-johnson/"
      },
      DEFAULT_USER_SETTINGS
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(analysis.dmVariants).toHaveLength(3);
    expect(analysis.dmVariants[0]?.personalizationUsed).toEqual([]);
    expect(analysis.dmVariants[0]?.offerContextUsed).toEqual([]);
  });

  it("keeps a normal complete response working without a retry request", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test-key");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      text: async () =>
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify(buildAnalysisResponseWithValidVariantLists())
              }
            }
          ]
        })
    });
    vi.stubGlobal("fetch", fetchMock);

    const analysis = await new OpenAiService().analyzeProfile(
      {
        fullName: "Avery Johnson",
        firstName: "Avery",
        lastName: "Johnson",
        headline: "VP Sales at Example Corp",
        companyName: "Example Corp",
        profileUrl: "https://www.linkedin.com/in/avery-johnson/"
      },
      DEFAULT_USER_SETTINGS
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(analysis.dmVariants[0]?.personalizationUsed).toEqual(["Visible sales leadership role"]);
    expect(analysis.dmVariants[0]?.offerContextUsed).toEqual(["LinkedIn to HubSpot workflow"]);
  });

  it("does not trigger the retry request for the Direct pitch label alias", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test-key");
    const responseWithAlias = buildAnalysisResponseWithValidVariantLists();
    responseWithAlias.dmVariants[1] = {
      ...responseWithAlias.dmVariants[1],
      label: "Direct pitch"
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      text: async () =>
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify(responseWithAlias)
              }
            }
          ]
        })
    });
    vi.stubGlobal("fetch", fetchMock);

    const analysis = await new OpenAiService().analyzeProfile(
      {
        fullName: "Avery Johnson",
        firstName: "Avery",
        lastName: "Johnson",
        headline: "VP Sales at Example Corp",
        companyName: "Example Corp",
        profileUrl: "https://www.linkedin.com/in/avery-johnson/"
      },
      DEFAULT_USER_SETTINGS
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(analysis.dmVariants[1]?.label).toBe("Direct value pitch");
  });

  it("does not trigger the retry request for normalized v0.5 decision intelligence aliases", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test-key");
    const responseWithAliases = {
      ...buildAnalysisResponseWithValidVariantLists(),
      decisionConfidence: "MEDIUM",
      dataSufficiency: "PARTIAL",
      decisionBreakdown: {
        roleFit: {
          status: "STRONG",
          score: 90,
          explanation: "Visible role match.",
          evidence: ["HubSpot Consultant"],
          source: "headline",
          basis: "FACT"
        }
      },
      outreachReadiness: {
        readiness: "almost ready",
        readinessScore: 72,
        timingRecommendation: "research first",
        reason: "Research first.",
        blockers: false,
        prerequisites: ["Confirm HubSpot usage"]
      },
      outreachCoach: {
        verdict: "research before sending",
        message: "Review first.",
        mainWarning: "Do not assume pain.",
        recommendedPreparation: "Confirm workflow context.",
        humanReviewRequired: false
      }
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      text: async () =>
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify(responseWithAliases)
              }
            }
          ]
        })
    });
    vi.stubGlobal("fetch", fetchMock);

    const analysis = await new OpenAiService().analyzeProfile(
      {
        fullName: "Avery Johnson",
        firstName: "Avery",
        lastName: "Johnson",
        headline: "VP Sales at Example Corp",
        companyName: "Example Corp",
        profileUrl: "https://www.linkedin.com/in/avery-johnson/"
      },
      DEFAULT_USER_SETTINGS
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(analysis.outreachCoach.humanReviewRequired).toBe(true);
  });

  it("does not trigger the retry request for the production v0.5 enum alias response shape", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test-key");
    const responseWithAliases = {
      ...buildAnalysisResponseWithoutDmVariants(),
      dataSufficiency: "partial",
      decisionBreakdown: {
        dataSufficiency: {
          status: "partial",
          score: 44,
          explanation: "Some evidence is present.",
          evidence: ["Visible headline"],
          source: "headline",
          basis: "fact"
        }
      },
      outreachReadiness: {
        readiness: "low",
        readinessScore: 35,
        timingRecommendation: "Wait until more information is gathered.",
        reason: "More context is needed.",
        blockers: ["No direct pain evidence"],
        prerequisites: ["Review visible About section"]
      },
      outreachCoach: {
        verdict: "Proceed with caution.",
        message: "Review first.",
        mainWarning: "Do not assume pain.",
        recommendedPreparation: "Gather more context.",
        humanReviewRequired: false
      }
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      text: async () =>
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify(responseWithAliases)
              }
            }
          ]
        })
    });
    vi.stubGlobal("fetch", fetchMock);

    const analysis = await new OpenAiService().analyzeProfile(
      {
        fullName: "Avery Johnson",
        firstName: "Avery",
        lastName: "Johnson",
        headline: "VP Sales at Example Corp",
        companyName: "Example Corp",
        profileUrl: "https://www.linkedin.com/in/avery-johnson/"
      },
      DEFAULT_USER_SETTINGS
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(analysis.dmVariants).toEqual([]);
  });
});

function buildAnalysisResponseWithBooleanVariantLists() {
  return {
    leadScore: 74,
    fitLabel: "Possible fit",
    persona: "Sales leader at a B2B company",
    painPoints: ["Manual CRM updates", "Keeping sales context clean"],
    icebreaker: "I noticed your sales leadership role at Example Corp.",
    recommendedAction: "Send a concise feedback-request message.",
    recommendedNextAction: "Review the profile and send a soft opener.",
    confidence: "medium",
    positiveSignals: ["Sales leadership role"],
    negativeSignals: ["HubSpot usage is not visible"],
    missingInformation: ["Current CRM stack"],
    riskWarnings: ["Do not assume buying intent"],
    recommendedOutreachAngle: "Feedback request",
    whyThisAngle: "The profile shows relevant sales leadership context, but no direct buying signal.",
    whatToAvoid: ["Avoid claiming they use HubSpot"],
    dmVariants: [
      {
        label: "Soft opener",
        useCase: "Use for a first touch.",
        text: "Hi Avery, noticed your sales leadership work and thought this workflow might be relevant.",
        personalizationUsed: true,
        offerContextUsed: true,
        factsUsed: ["Visible sales leadership role"],
        inferencesUsed: ["May care about cleaner CRM context"],
        warnings: ["Review manually before sending."],
        riskLevel: "low"
      },
      {
        label: "Direct value pitch",
        useCase: "Use only if the profile is a clear fit.",
        text: "Hi Avery, this helps sales teams turn LinkedIn research into cleaner HubSpot context.",
        personalizationUsed: false,
        offerContextUsed: true,
        factsUsed: ["Visible company context"],
        inferencesUsed: ["May care about sales team efficiency"],
        warnings: ["Keep the message short."],
        riskLevel: "medium"
      },
      {
        label: "Feedback request",
        useCase: "Use when asking for product feedback.",
        text: "Hi Avery, I am getting feedback from sales leaders on a lighter LinkedIn to HubSpot workflow.",
        personalizationUsed: true,
        offerContextUsed: false,
        factsUsed: ["Visible sales leadership role"],
        inferencesUsed: ["May have a view on CRM hygiene"],
        warnings: ["Do not automate sending."],
        riskLevel: "low"
      }
    ]
  };
}

function buildAnalysisResponseWithValidVariantLists() {
  const response = buildAnalysisResponseWithBooleanVariantLists();

  return {
    ...response,
    dmVariants: response.dmVariants.map((variant) => ({
      ...variant,
      personalizationUsed: ["Visible sales leadership role"],
      offerContextUsed: ["LinkedIn to HubSpot workflow"]
    }))
  };
}

function buildAnalysisResponseWithoutDmVariants() {
  const response: Record<string, unknown> = { ...buildAnalysisResponseWithValidVariantLists() };
  delete response.dmVariants;
  return response;
}
