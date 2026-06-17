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

  it("lets all three DM variants pass schema validation after known boolean fields are normalized", () => {
    const schema = createEnglishOnlyProfileAnalysisSchema();
    const normalized = normalizeAnalysisResponseForSchema(buildAnalysisResponseWithBooleanVariantLists());
    const parsed = schema.parse(normalized);

    expect(parsed.dmVariants).toHaveLength(3);
    expect(parsed.dmVariants.every((variant) => Array.isArray(variant.personalizationUsed))).toBe(true);
    expect(parsed.dmVariants.every((variant) => Array.isArray(variant.offerContextUsed))).toBe(true);
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
