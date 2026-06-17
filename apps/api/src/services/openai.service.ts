import { DEFAULT_SELLER_CONTEXT } from "@linkedin-hubspot-ai/shared";
import type { GeneratedDm, LinkedInProfile, MessageType, ProfileAnalysis, UserSettings } from "@linkedin-hubspot-ai/shared";
import { z } from "zod";
import { AppError } from "../utils/errors.js";
import {
  buildEnglishOnlyInstruction,
  buildLeadScoringInstruction,
  createEnglishOnlyGeneratedDmSchema,
  createEnglishOnlyProfileAnalysisSchema
} from "./openaiPromptRules.js";
import { buildLeadScoringContext, normalizeProfileAnalysisScore } from "./leadScoring.js";

const OPENAI_CHAT_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions";

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  error?: {
    message?: string;
    type?: string;
    code?: string;
    param?: string;
  };
};

function getOpenAiApiKey(): string {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new AppError(500, "OpenAI API key is missing. Add OPENAI_API_KEY to the backend .env file and restart the API.");
  }

  return apiKey;
}

function buildSettingsSummary(userSettings: UserSettings): string {
  const sellerContext = userSettings.sellerContext ?? DEFAULT_SELLER_CONTEXT;

  return JSON.stringify(
    {
      productOrServiceDescription: userSettings.productOrServiceDescription || "Unknown",
      targetCustomerProfile: userSettings.targetCustomerProfile || "Unknown",
      targetIndustries: userSettings.targetIndustries || "Unknown",
      targetRoles: userSettings.targetRoles || "Unknown",
      targetCompanySize: userSettings.targetCompanySize || "Unknown",
      targetRegion: userSettings.targetRegion || "Unknown",
      mainPainPointsSolved: userSettings.mainPainPointsSolved || "Unknown",
      excludedRoles: userSettings.excludedRoles || "Unknown",
      preferredOutreachTone: userSettings.preferredOutreachTone || userSettings.dmTone,
      sellerContext,
      dmTone: userSettings.dmTone,
      defaultHubSpotLifecycleStage: userSettings.defaultHubSpotLifecycleStage,
      defaultFollowUpDays: userSettings.defaultFollowUpDays
    },
    null,
    2
  );
}

function safeProfileForPrompt(profile: LinkedInProfile): LinkedInProfile {
  return {
    ...profile,
    visibleProfileContext: profile.visibleProfileContext
      ? {
          ...profile.visibleProfileContext,
          rawVisibleContext: profile.visibleProfileContext.rawVisibleContext?.slice(0, 3000)
        }
      : undefined,
    visibleTextSample: profile.visibleTextSample?.slice(0, 1500)
  };
}

async function requestJsonFromOpenAi(messages: Array<{ role: "system" | "user"; content: string }>): Promise<unknown> {
  const response = await fetch(OPENAI_CHAT_COMPLETIONS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getOpenAiApiKey()}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini",
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages
    })
  });

  const rawText = await response.text();
  const raw = parseOpenAiResponse(rawText);

  if (!response.ok) {
    const formatted = formatOpenAiApiError(response.status, response.statusText, raw, rawText);
    throw new AppError(response.status, formatted.message, formatted.details, {
      provider: "openai",
      status: response.status,
      statusText: response.statusText,
      responseBody: raw ?? rawText
    });
  }

  const content = raw.choices?.[0]?.message?.content;
  if (!content) {
    throw new AppError(502, "OpenAI returned an empty response.");
  }

  try {
    return JSON.parse(content) as unknown;
  } catch {
    throw new AppError(502, "OpenAI returned text that was not valid JSON.");
  }
}

function parseOpenAiResponse(rawText: string): ChatCompletionResponse {
  try {
    return JSON.parse(rawText) as ChatCompletionResponse;
  } catch {
    return {};
  }
}

export function formatOpenAiApiError(
  status: number,
  statusText: string,
  raw: ChatCompletionResponse,
  rawText: string
): { message: string; details: string[] } {
  const detail = buildOpenAiErrorDetail(raw, rawText);
  const openAiSaid = detail ? ` OpenAI said: ${detail}` : "";
  const details = buildOpenAiErrorDetails(raw, detail);
  const lowerDetail = detail.toLowerCase();
  const code = raw.error?.code?.toLowerCase() ?? "";

  if (status === 400) {
    return {
      message: `OpenAI rejected the request because it was not valid.${openAiSaid}`,
      details
    };
  }

  if (status === 401) {
    return {
      message: `OpenAI API key is invalid or expired. Check OPENAI_API_KEY in the backend .env file.${openAiSaid}`,
      details
    };
  }

  if (status === 403) {
    return {
      message: `OpenAI project permission is missing. Check the API key permissions and project access.${openAiSaid}`,
      details
    };
  }

  if (status === 429 && (code.includes("quota") || lowerDetail.includes("quota") || lowerDetail.includes("billing"))) {
    return {
      message: `OpenAI quota is exceeded. Check billing or usage limits in OpenAI.${openAiSaid}`,
      details
    };
  }

  if (status === 429) {
    return {
      message: `OpenAI rate limit reached. Please wait a moment and try again.${openAiSaid}`,
      details
    };
  }

  if (status >= 500) {
    return {
      message: `OpenAI is temporarily unavailable. Please try again later.${openAiSaid}`,
      details
    };
  }

  return {
    message: `OpenAI API error (${status}${statusText ? ` ${statusText}` : ""}): ${detail || "OpenAI could not complete the request."}`,
    details
  };
}

function buildOpenAiErrorDetail(raw: ChatCompletionResponse, rawText: string): string {
  const error = raw.error;
  if (!error) {
    return rawText.slice(0, 500).trim();
  }

  return [error.message, error.type ? `type: ${error.type}` : undefined, error.code ? `code: ${error.code}` : undefined]
    .filter((item): item is string => Boolean(item))
    .join(" ");
}

function buildOpenAiErrorDetails(raw: ChatCompletionResponse, detail: string): string[] {
  const details = [
    detail,
    raw.error?.type ? `OpenAI error type: ${raw.error.type}` : undefined,
    raw.error?.code ? `OpenAI error code: ${raw.error.code}` : undefined,
    raw.error?.param ? `OpenAI error parameter: ${raw.error.param}` : undefined
  ].filter((item): item is string => Boolean(item));

  return [...new Set(details)];
}

const dmVariantListFields = ["personalizationUsed", "offerContextUsed", "factsUsed", "inferencesUsed", "warnings"] as const;

export function normalizeAnalysisResponseForSchema(value: unknown): unknown {
  if (!isRecord(value) || !Array.isArray(value.dmVariants)) {
    return value;
  }

  return {
    ...value,
    dmVariants: value.dmVariants.map((variant) => {
      if (!isRecord(variant)) {
        return variant;
      }

      const normalizedVariant: Record<string, unknown> = { ...variant };
      normalizedVariant.label = normalizeDmVariantLabel(normalizedVariant.label);
      for (const field of dmVariantListFields) {
        normalizedVariant[field] = normalizeStringArrayField(normalizedVariant[field]);
      }

      return normalizedVariant;
    })
  };
}

function normalizeStringArrayField(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function normalizeDmVariantLabel(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  const normalized = value.trim().replace(/\s+/g, " ").toLowerCase();
  if (normalized === "soft opener") {
    return "Soft opener";
  }

  if (normalized === "direct pitch" || normalized === "direct value pitch") {
    return "Direct value pitch";
  }

  if (normalized === "feedback request") {
    return "Feedback request";
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function requestValidatedJson<T>(
  schema: z.ZodType<T>,
  systemPrompt: string,
  userPrompt: string,
  retryHint: string,
  options: { logAnalysisPerformance?: boolean; normalizeBeforeValidation?: (value: unknown) => unknown } = {}
): Promise<T> {
  const messages = [
    { role: "system" as const, content: systemPrompt },
    { role: "user" as const, content: userPrompt }
  ];

  if (options.logAnalysisPerformance) {
    console.log("[openai-analysis] first request started");
  }
  const firstStartedAt = Date.now();
  const firstJson = await requestJsonFromOpenAi(messages);
  if (options.logAnalysisPerformance) {
    console.log("[openai-analysis] first request completed", {
      durationMs: Date.now() - firstStartedAt
    });
  }

  const normalizedFirstJson = options.normalizeBeforeValidation ? options.normalizeBeforeValidation(firstJson) : firstJson;
  const firstParse = schema.safeParse(normalizedFirstJson);
  if (firstParse.success) {
    if (options.logAnalysisPerformance) {
      console.log("[openai-analysis] first schema validation succeeded");
    }
    return firstParse.data;
  }

  if (options.logAnalysisPerformance) {
    console.warn("[openai-analysis] first schema validation failed", {
      issues: firstParse.error.issues.map((issue) => ({
        path: issue.path.join(".") || "response",
        message: issue.message
      }))
    });
    console.log("[openai-analysis] retry started");
  }
  const retryStartedAt = Date.now();
  const retryJson = await requestJsonFromOpenAi([
    ...messages,
    {
      role: "user" as const,
      content: `${retryHint}\nSchema problems:\n${firstParse.error.issues
        .map((issue) => `${issue.path.join(".") || "response"}: ${issue.message}`)
        .join("\n")}`
    }
  ]);
  if (options.logAnalysisPerformance) {
    console.log("[openai-analysis] retry completed", {
      durationMs: Date.now() - retryStartedAt
    });
  }

  const normalizedRetryJson = options.normalizeBeforeValidation ? options.normalizeBeforeValidation(retryJson) : retryJson;
  const retryParse = schema.safeParse(normalizedRetryJson);

  if (!retryParse.success) {
    throw new AppError(502, "The AI response was not in the format this app needs. Please try again.");
  }

  return retryParse.data;
}

export class OpenAiService {
  async analyzeProfile(profile: LinkedInProfile, userSettings: UserSettings): Promise<ProfileAnalysis> {
    const analyzeStartedAt = Date.now();
    const analysisSchema = createEnglishOnlyProfileAnalysisSchema();
    const scoringContext = buildLeadScoringContext(profile, userSettings);

    try {
      const systemPrompt = [
        "You are a careful sales research assistant.",
        "Use only the visible LinkedIn profile information provided by the user.",
        "Separate facts from assumptions in your reasoning, but return only the requested JSON fields.",
        "If information is not available, return the word Unknown.",
        "Do not invent private information.",
        buildLeadScoringInstruction(Boolean(userSettings.targetCustomerProfile.trim() || userSettings.targetRoles.trim())),
        "Persona descriptions, pain points, icebreakers, and recommended next actions must be English-only.",
        "Score fit against the user's ICP settings when present.",
        "Use the Seller Context to understand what the user sells, the target outcome, differentiators, proof points, CTA, allowed claims, claims to avoid, brand voice, and compatibility context.",
        "Do not invent proof, customer results, HubSpot usage, budget, buying intent, company size, or technology stack.",
        "Facts must be based on visible profile text or saved user settings. Inferences must be labeled as inferences.",
        "Recommend Research first or Skip when fit is weak or context is limited.",
        "Do not claim the person uses HubSpot unless it is explicitly visible.",
        "Generate three concise LinkedIn DM variants: Soft opener, Direct value pitch, and Feedback request.",
        buildEnglishOnlyInstruction(),
        "Always return valid JSON."
      ].join(" ");

      const userPrompt = `Analyze this LinkedIn profile for sales fit.

Return one JSON object with these exact fields:
- leadScore: an integer from 0 to 100
- fitLabel: "Strong fit", "Possible fit", "Weak fit", or "Not enough data"
- positiveSignals: an array of short English strings
- negativeSignals: an array of short English strings
- missingInformation: an array of short English strings
- riskWarnings: an array of short English strings
- recommendedNextAction: a short English sentence
- recommendedOutreachAngle: a short English label such as Feedback request, Soft opener, Direct pitch, Research first, or Skip / not a good fit
- whyThisAngle: a short English explanation
- whatToAvoid: an array of short English strings
- persona: a short English description
- painPoints: an array of short English strings
- icebreaker: a short English sentence
- recommendedAction: a short English sentence
- confidence: "high", "medium", or "low"
- scoreEvidence: an array of evidence objects with id, signalType, basis, category, summary, evidenceText, sourceSection, confidence, scoreImpact
- scoringMetadata: scoringVersion, finalScore, fitLabel, confidence, factsUsedCount, inferencesUsedCount, missingCriteriaCount, disqualifierCount, analysisDepth
- dmVariants: exactly three objects with label, useCase, text, personalizationUsed, offerContextUsed, factsUsed, inferencesUsed, warnings, riskLevel

For every dmVariants item, these fields must always be arrays of strings, never booleans:
{
  "personalizationUsed": ["string"],
  "offerContextUsed": ["string"],
  "factsUsed": ["string"],
  "inferencesUsed": ["string"],
  "warnings": ["string"]
}

Compact valid DM variant example:
{
  "label": "Soft opener",
  "useCase": "Use for a first touch.",
  "text": "Hi Avery, noticed your RevOps work and thought this workflow might be relevant.",
  "personalizationUsed": ["RevOps work"],
  "offerContextUsed": ["LinkedIn to HubSpot workflow"],
  "factsUsed": ["Visible RevOps role"],
  "inferencesUsed": ["May care about cleaner CRM context"],
  "warnings": ["Review manually before sending."],
  "riskLevel": "low"
}

Do not use placeholder values. Calculate leadScore from the visible profile and ICP settings.
Do not overclaim. Separate visible facts from cautious inferences in the signal arrays.
Each DM variant must be concise, natural English, and LinkedIn-appropriate.
Each DM variant must explain which offer context, visible facts, and cautious inferences it used.
Respect claimsToAvoid and compatibilityContext from Seller Context.

User settings:
${buildSettingsSummary(userSettings)}

Backend scoring context:
${JSON.stringify(scoringContext, null, 2)}

Visible LinkedIn profile:
${JSON.stringify(safeProfileForPrompt(profile), null, 2)}
`;

      const analysis = await requestValidatedJson(
        analysisSchema as z.ZodType<ProfileAnalysis>,
        systemPrompt,
        userPrompt,
        "Return corrected JSON only. leadScore must be a meaningful integer from 0 to 100, not a copied placeholder. All text fields must be fluent English only.",
        { logAnalysisPerformance: true, normalizeBeforeValidation: normalizeAnalysisResponseForSchema }
      );

      return ensureAnalysisDefaults(normalizeProfileAnalysisScore(analysis, profile, userSettings), profile, userSettings);
    } finally {
      console.log("[openai-analysis] total completed", {
        durationMs: Date.now() - analyzeStartedAt
      });
    }
  }

  async generateDm(
    profile: LinkedInProfile,
    analysis: ProfileAnalysis,
    messageType: MessageType,
    userSettings: UserSettings
  ): Promise<GeneratedDm> {
    const maxLength = messageType === "connection" ? 300 : 650;
    const dmSchema = createEnglishOnlyGeneratedDmSchema(maxLength);

    const systemPrompt = [
      "You write respectful LinkedIn outreach messages for sales professionals.",
      "Use only the visible facts and the analysis supplied by the user.",
      "Do not automate sending. The user will review and send manually.",
      "Every outreach message must be written in English, no matter what language appears in the LinkedIn profile.",
      "Never mirror the profile language.",
      "Use modern LinkedIn-native phrasing that sounds like a real US SaaS sales professional.",
      "Avoid aggressive sales language, pressure, and repetitive phrases such as quick call.",
      "First DMs should not feel too salesy. Follow-ups should not feel pushy.",
      "Use the recommended outreach angle and ICP settings when deciding the message angle.",
      "Use Seller Context so the message reflects the offer, target outcome, differentiators, proof points, CTA, claims allowed, claims to avoid, brand voice, and compatibility context.",
      "Do not invent proof. Do not claim a pain point as fact without visible evidence. Do not imply replacement if compatibility context says the offer works alongside existing tools.",
      buildEnglishOnlyInstruction(),
      "Always return valid JSON."
    ].join(" ");

    const userPrompt = `Write a ${messageType} LinkedIn message.

Return exactly this JSON shape:
{
  "message": "string",
  "personalizationScore": 0,
  "spamRisk": "low | medium | high",
  "warnings": ["string"],
  "offerContextUsed": ["string"],
  "factsUsed": ["string"],
  "inferencesUsed": ["string"]
}

Length rule: keep the message about ${maxLength} characters or less.

User settings:
${buildSettingsSummary(userSettings)}

Visible LinkedIn profile:
${JSON.stringify(safeProfileForPrompt(profile), null, 2)}

Profile analysis:
${JSON.stringify(analysis, null, 2)}
`;

    return requestValidatedJson<GeneratedDm>(
      dmSchema as z.ZodType<GeneratedDm>,
      systemPrompt,
      userPrompt,
      "Return corrected JSON only. Make the message shorter, more personal, less salesy, and English-only."
    );
  }
}

function ensureAnalysisDefaults(analysis: ProfileAnalysis, profile: LinkedInProfile, userSettings: UserSettings): ProfileAnalysis {
  const dmVariants = analysis.dmVariants.length === 3 ? analysis.dmVariants : fallbackDmVariants(analysis, profile, userSettings);
  const recommendedNextAction = analysis.recommendedNextAction || analysis.recommendedAction;

  return {
    ...analysis,
    recommendedNextAction,
    recommendedAction: analysis.recommendedAction || recommendedNextAction,
    recommendedOutreachAngle: analysis.recommendedOutreachAngle || "Research first",
    whyThisAngle:
      analysis.whyThisAngle ||
      "There is not enough visible buying context to recommend a more aggressive sales angle.",
    dmVariants
  };
}

function fallbackDmVariants(analysis: ProfileAnalysis, profile: LinkedInProfile, userSettings: UserSettings): ProfileAnalysis["dmVariants"] {
  const sellerContext = userSettings.sellerContext ?? DEFAULT_SELLER_CONTEXT;
  const firstName = profile.firstName || profile.fullName.split(/\s+/)[0] || "there";
  const context = profile.headline || profile.currentRoleTitle || profile.companyName || "your work";
  const offer = userSettings.productOrServiceDescription || "a lightweight LinkedIn to HubSpot workflow";

  return [
    {
      label: "Soft opener",
      useCase: "Use when this is a first touch and the visible buying signal is not strong yet.",
      text: `Hi ${firstName}, noticed ${context}. I am exploring a lighter way for HubSpot users to turn LinkedIn research into cleaner CRM context. Thought it could be relevant to your work.`,
      personalizationUsed: [context],
      offerContextUsed: [sellerContext.productOrServiceName],
      factsUsed: [context],
      inferencesUsed: [],
      warnings: ["Review manually before sending."],
      riskLevel: "low"
    },
    {
      label: "Direct value pitch",
      useCase: "Use when the profile clearly matches the ICP and a direct value angle feels appropriate.",
      text: `Hi ${firstName}, your profile stood out because of ${context}. I am building ${offer}. It helps teams score LinkedIn leads, draft outreach, and save the context to HubSpot without extra copy-paste.`,
      personalizationUsed: [context],
      offerContextUsed: [sellerContext.targetOutcome],
      factsUsed: [context],
      inferencesUsed: analysis.scoreEvidence.filter((item) => item.basis === "inference").slice(0, 2).map((item) => item.summary),
      warnings: analysis.whatToAvoid.slice(0, 2),
      riskLevel: analysis.leadScore >= 70 ? "medium" : "high"
    },
    {
      label: "Feedback request",
      useCase: "Use for early feedback, Product Hunt outreach, or when a softer ask is safer than a pitch.",
      text: `Hi ${firstName}, I am getting feedback from people close to LinkedIn prospecting and HubSpot workflows. Your ${context} caught my eye. Would a quick look at this workflow be useful to sanity-check?`,
      personalizationUsed: [context],
      offerContextUsed: [sellerContext.preferredCta],
      factsUsed: [context],
      inferencesUsed: [],
      warnings: ["Keep the ask soft and manual."],
      riskLevel: "low"
    }
  ];
}
