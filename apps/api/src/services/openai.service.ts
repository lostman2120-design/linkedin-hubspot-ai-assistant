import { DEFAULT_SELLER_CONTEXT, normalizeRecommendedAction } from "@linkedin-hubspot-ai/shared";
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

type OpenAiJsonResult = {
  payload: unknown;
  responseChars: number;
};

function getOpenAiApiKey(): string {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new AppError(500, "OpenAI API key is missing. Add OPENAI_API_KEY to the backend .env file and restart the API.");
  }

  return apiKey;
}

function getOpenAiModel(): string {
  return process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
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
          rawVisibleContext: profile.visibleProfileContext.rawVisibleContext?.slice(0, 2200)
        }
      : undefined,
    visibleTextSample: profile.visibleTextSample?.slice(0, 1000)
  };
}

function safeScoringContextForPrompt(scoringContext: ReturnType<typeof buildLeadScoringContext>) {
  return {
    heuristicScore: scoringContext.heuristicScore,
    matchedSignals: scoringContext.matchedSignals.slice(0, 5),
    decisionSignals: scoringContext.decisionSignals,
    scoreEvidence: scoringContext.scoreEvidence.slice(0, 5),
    scoringMetadata: scoringContext.scoringMetadata,
    missingSettingsWarning: scoringContext.missingSettingsWarning
  };
}

async function requestJsonFromOpenAi(messages: Array<{ role: "system" | "user"; content: string }>): Promise<OpenAiJsonResult> {
  const response = await fetch(OPENAI_CHAT_COMPLETIONS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getOpenAiApiKey()}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: getOpenAiModel(),
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
    return {
      payload: JSON.parse(content) as unknown,
      responseChars: content.length
    };
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
const analysisListFieldLimits = {
  actionRisks: 2,
  actionPrerequisites: 2,
  limitedContextReasons: 4,
  positiveSignals: 5,
  negativeSignals: 3,
  missingInformation: 4,
  riskWarnings: 3,
  whatToAvoid: 3
} as const;
const decisionBreakdownFields = [
  "roleFit",
  "industryFit",
  "companyFit",
  "buyerRelevance",
  "painEvidence",
  "timingSignal",
  "relationshipSignal",
  "dataSufficiency",
  "riskLevel"
] as const;

export function normalizeAnalysisResponseForSchema(value: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }

  const leadScore = typeof value.leadScore === "number" && Number.isFinite(value.leadScore) ? value.leadScore : 0;
  const normalizedDataSufficiency = normalizeDataSufficiency(value.dataSufficiency);
  const normalizedOutreachReadiness = normalizeOutreachReadiness(value.outreachReadiness);
  const normalized: Record<string, unknown> = {
    ...value,
    recommendedAction: normalizeRecommendedAction(value.recommendedAction, leadScore),
    decisionConfidence: normalizeLowerEnum(value.decisionConfidence, ["high", "medium", "low"]),
    dataSufficiency: normalizedDataSufficiency,
    outreachReadiness: normalizedOutreachReadiness,
    outreachCoach: normalizeOutreachCoach(value.outreachCoach, normalizedOutreachReadiness),
    decisionBreakdown: normalizeDecisionBreakdown(value.decisionBreakdown, normalizedDataSufficiency),
    decisionChangeConditions: normalizeObjectArray(value.decisionChangeConditions, 3),
    nextBestResearchActions: normalizeObjectArray(value.nextBestResearchActions, 2),
    scoreEvidence: normalizeObjectArray(value.scoreEvidence, 5),
    dmVariants: Array.isArray(value.dmVariants) ? value.dmVariants.map((variant) => {
      if (!isRecord(variant)) {
        return variant;
      }

      const normalizedVariant: Record<string, unknown> = { ...variant };
      normalizedVariant.label = normalizeDmVariantLabel(normalizedVariant.label);
      for (const field of dmVariantListFields) {
        normalizedVariant[field] = normalizeStringArrayField(normalizedVariant[field], 2);
      }

      return normalizedVariant;
    }) : value.dmVariants
  };

  for (const [field, limit] of Object.entries(analysisListFieldLimits)) {
    normalized[field] = normalizeStringArrayField(normalized[field], limit);
  }

  return normalized;
}

function normalizeStringArrayField(value: unknown, maxItems = 6): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim())
    .slice(0, maxItems);
}

function normalizeObjectArray(value: unknown, maxItems: number): unknown {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isRecord).slice(0, maxItems);
}

function normalizeLowerEnum<const T extends readonly string[]>(value: unknown, allowed: T): T[number] | unknown {
  if (typeof value !== "string") {
    return value;
  }

  const normalized = value.trim().toLowerCase().replace(/\s+/g, "_");
  return allowed.find((item) => item === normalized) ?? value;
}

function normalizeTitleEnum<const T extends readonly string[]>(value: unknown, allowed: T): T[number] | unknown {
  if (typeof value !== "string") {
    return value;
  }

  const normalized = value.trim().replace(/\s+/g, " ").toLowerCase();
  return allowed.find((item) => item.toLowerCase() === normalized) ?? value;
}

function normalizeAlias(value: unknown): string {
  return typeof value === "string"
    ? value
        .trim()
        .replace(/[.!?]+$/g, "")
        .replace(/[_-]+/g, " ")
        .replace(/\s+/g, " ")
        .toLowerCase()
    : "";
}

function normalizeDataSufficiency(value: unknown): unknown {
  const normalized = normalizeAlias(value);
  if (["sufficient", "high", "complete"].includes(normalized)) {
    return "sufficient";
  }
  if (["partial", "medium", "some"].includes(normalized)) {
    return "partial";
  }
  if (["insufficient", "unavailable", "unknown", "not enough data", "missing"].includes(normalized)) {
    return "insufficient";
  }
  return normalizeLowerEnum(value, ["sufficient", "partial", "insufficient"]);
}

function dataSufficiencyToBreakdownStatus(value: unknown): "strong" | "moderate" | "missing" {
  if (value === "sufficient") {
    return "strong";
  }
  if (value === "partial") {
    return "moderate";
  }
  return "missing";
}

function normalizeDecisionBreakdownStatus(value: unknown): unknown {
  const normalized = normalizeAlias(value);
  if (["strong", "sufficient", "high", "complete"].includes(normalized)) {
    return "strong";
  }
  if (["moderate", "partial", "medium", "some"].includes(normalized)) {
    return "moderate";
  }
  if (["weak", "low", "limited"].includes(normalized)) {
    return "weak";
  }
  if (["missing", "insufficient", "unavailable", "unknown", "not enough data"].includes(normalized)) {
    return "missing";
  }
  if (["negative", "disqualified"].includes(normalized)) {
    return "negative";
  }
  return normalizeLowerEnum(value, ["strong", "moderate", "weak", "missing", "negative"] as const);
}

function normalizeDecisionBreakdown(value: unknown, dataSufficiency: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }

  const normalized: Record<string, unknown> = { ...value };
  for (const field of decisionBreakdownFields) {
    if (!isRecord(normalized[field])) {
      continue;
    }

    const item = { ...(normalized[field] as Record<string, unknown>) };
    item.status = field === "dataSufficiency" ? dataSufficiencyToBreakdownStatus(dataSufficiency) : normalizeDecisionBreakdownStatus(item.status);
    item.basis = normalizeLowerEnum(item.basis, ["fact", "inference", "mixed", "missing"] as const);
    item.evidence = normalizeStringArrayField(item.evidence, 2);
    normalized[field] = item;
  }

  return normalized;
}

function normalizeReadiness(value: unknown): unknown {
  const normalized = normalizeAlias(value);
  if (["ready", "high", "contact now"].includes(normalized)) {
    return "ready";
  }
  if (["almost ready", "almost_ready", "medium", "partial", "proceed with caution"].includes(normalized)) {
    return "almost_ready";
  }
  if (["not ready", "not_ready", "low", "research first", "insufficient"].includes(normalized)) {
    return "not_ready";
  }
  if (["avoid", "skip", "do not contact", "do not send"].includes(normalized)) {
    return "avoid";
  }
  return normalizeLowerEnum(value, ["ready", "almost_ready", "not_ready", "avoid"] as const);
}

function normalizeTimingRecommendation(value: unknown): unknown {
  const normalized = normalizeAlias(value);
  if (["contact now", "ready to contact"].includes(normalized)) {
    return "Contact now";
  }
  if (["research first", "gather more information", "wait until more information is gathered"].includes(normalized)) {
    return "Research first";
  }
  if (["wait", "wait for trigger", "stronger signal needed", "wait for a stronger signal"].includes(normalized)) {
    return "Wait for a stronger signal";
  }
  if (["do not contact", "do not contact yet", "avoid outreach"].includes(normalized)) {
    return "Do not contact yet";
  }
  return normalizeTitleEnum(value, ["Contact now", "Research first", "Wait for a stronger signal", "Do not contact yet"] as const);
}

function normalizeOutreachReadiness(value: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }

  return {
    ...value,
    readiness: normalizeReadiness(value.readiness),
    timingRecommendation: normalizeTimingRecommendation(value.timingRecommendation),
    blockers: normalizeStringArrayField(value.blockers, 2),
    prerequisites: normalizeStringArrayField(value.prerequisites, 2)
  };
}

function readinessForCoachFallback(outreachReadiness: unknown): string {
  if (!isRecord(outreachReadiness) || typeof outreachReadiness.readiness !== "string") {
    return "not_ready";
  }
  return outreachReadiness.readiness;
}

function normalizeCoachVerdict(value: unknown, outreachReadiness: unknown): unknown {
  const normalized = normalizeAlias(value);
  if (["send after review", "proceed after review"].includes(normalized)) {
    return "Send after review";
  }
  if (["research before sending", "proceed with caution", "gather more information"].includes(normalized)) {
    return "Research before sending";
  }
  if (["rewrite before sending", "revise first"].includes(normalized)) {
    return "Rewrite before sending";
  }
  if (["do not send", "do not send yet", "avoid outreach"].includes(normalized)) {
    return "Do not send yet";
  }

  const exact = normalizeTitleEnum(value, ["Send after review", "Research before sending", "Rewrite before sending", "Do not send yet"] as const);
  if (typeof exact === "string" && exact !== value) {
    return exact;
  }

  const readiness = readinessForCoachFallback(outreachReadiness);
  if (readiness === "ready") {
    return "Send after review";
  }
  if (readiness === "avoid") {
    return "Do not send yet";
  }
  return "Research before sending";
}

function normalizeOutreachCoach(value: unknown, outreachReadiness: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }

  return {
    ...value,
    verdict: normalizeCoachVerdict(value.verdict, outreachReadiness),
    humanReviewRequired: true
  };
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
  options: { logAnalysisPerformance?: boolean; normalizeBeforeValidation?: (value: unknown) => unknown; requestedSections?: string[] } = {}
): Promise<T> {
  const messages = [
    { role: "system" as const, content: systemPrompt },
    { role: "user" as const, content: userPrompt }
  ];
  const promptChars = systemPrompt.length + userPrompt.length;
  const requestedSections = options.requestedSections ?? [];
  const estimatedResponseFieldCount = estimateResponseFieldCount(userPrompt);
  const model = getOpenAiModel();
  let totalResponseSize = 0;

  if (options.logAnalysisPerformance) {
    console.log("[openai-analysis] first request started", {
      model,
      promptChars,
      requestedSections,
      estimatedResponseFieldCount
    });
  }
  const firstStartedAt = Date.now();
  const firstResult = await requestJsonFromOpenAi(messages);
  totalResponseSize += firstResult.responseChars;
  if (options.logAnalysisPerformance) {
    console.log("[openai-analysis] first request completed", {
      durationMs: Date.now() - firstStartedAt,
      responseChars: firstResult.responseChars
    });
  }

  const normalizationStartedAt = Date.now();
  const normalizedFirstJson = options.normalizeBeforeValidation ? options.normalizeBeforeValidation(firstResult.payload) : firstResult.payload;
  if (options.logAnalysisPerformance) {
    console.log("[openai-analysis] normalization completed", {
      durationMs: Date.now() - normalizationStartedAt
    });
  }

  const validationStartedAt = Date.now();
  const firstParse = schema.safeParse(normalizedFirstJson);
  if (firstParse.success) {
    if (options.logAnalysisPerformance) {
      console.log("[openai-analysis] first schema validation succeeded", {
        durationMs: Date.now() - validationStartedAt,
        totalResponseSize
      });
    }
    return firstParse.data;
  }

  if (options.logAnalysisPerformance) {
    console.warn("[openai-analysis] first schema validation failed", {
      durationMs: Date.now() - validationStartedAt,
      retryReasonCount: firstParse.error.issues.length,
      issues: firstParse.error.issues.map((issue) => ({
        path: issue.path.join(".") || "response",
        message: issue.message
      }))
    });
    console.log("[openai-analysis] retry started", {
      model,
      retryReasonCount: firstParse.error.issues.length
    });
  }
  const retryStartedAt = Date.now();
  const retryResult = await requestJsonFromOpenAi([
    ...messages,
    {
      role: "user" as const,
      content: `${retryHint}\nSchema problems:\n${firstParse.error.issues
        .map((issue) => `${issue.path.join(".") || "response"}: ${issue.message}`)
        .join("\n")}`
    }
  ]);
  totalResponseSize += retryResult.responseChars;
  if (options.logAnalysisPerformance) {
    console.log("[openai-analysis] retry completed", {
      durationMs: Date.now() - retryStartedAt,
      responseChars: retryResult.responseChars
    });
  }

  const retryNormalizationStartedAt = Date.now();
  const normalizedRetryJson = options.normalizeBeforeValidation ? options.normalizeBeforeValidation(retryResult.payload) : retryResult.payload;
  if (options.logAnalysisPerformance) {
    console.log("[openai-analysis] retry normalization completed", {
      durationMs: Date.now() - retryNormalizationStartedAt
    });
  }
  const retryValidationStartedAt = Date.now();
  const retryParse = schema.safeParse(normalizedRetryJson);

  if (!retryParse.success) {
    throw new AppError(502, "The AI response was not in the format this app needs. Please try again.");
  }

  if (options.logAnalysisPerformance) {
    console.log("[openai-analysis] retry schema validation succeeded", {
      durationMs: Date.now() - retryValidationStartedAt,
      totalResponseSize
    });
  }

  return retryParse.data;
}

function estimateResponseFieldCount(userPrompt: string): number {
  return userPrompt.split(/\r?\n/).filter((line) => line.trim().startsWith("- ")).length;
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
        "Use Research more or Low priority when visible evidence is limited, risk is high, or fit is unclear.",
        "Do not claim the person uses HubSpot unless it is explicitly visible.",
        "For Sales Decision Intelligence fields, use cautious explanations and unconfirmed conditional language.",
        "Never recommend crawling, scraping, automatic LinkedIn browsing, cookie access, or automatic DM sending.",
        "Always state that human review is required before outreach.",
        "Do not generate full DM drafts during profile analysis. DM drafts are generated only after the user clicks a message-generation action.",
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
- recommendedAction: exactly one of "Pursue now", "Research more", "Low priority", or "Do not contact yet"
- actionReason: a concise English explanation of why recommendedAction is appropriate; explain the sales decision, not the DM wording
- actionRisks: up to two short strings
- actionPrerequisites: up to two short strings
- actionExpiration: a short re-evaluation condition
- recommendedNextAction: a short English sentence
- decisionConfidence: "high", "medium", or "low"
- dataSufficiency: "sufficient", "partial", or "insufficient"
- evidenceCoverage: an integer from 0 to 100
- confidenceReason: a short English explanation
- limitedContextReasons: an array of short English strings
- recommendedOutreachAngle: a short English label such as Feedback request, Soft opener, Direct pitch, Research first, or Skip / not a good fit
- whyThisAngle: a short English explanation
- whatToAvoid: up to three short English strings
- outreachStrategy: an object with whyRelevant, bestAngle, painHypothesis, whatToAvoid, and suggestedCTA; every field must be a concise English string
- decisionBreakdown: an object with roleFit, industryFit, companyFit, buyerRelevance, painEvidence, timingSignal, relationshipSignal, dataSufficiency, riskLevel
- decisionChangeConditions: up to three objects with condition, currentState, impactIfConfirmed, recommendedActionIfConfirmed
- nextBestResearchActions: up to two objects with priority, action, reason, expectedDecisionImpact, safeSourceSuggestion
- outreachReadiness: an object with readiness, readinessScore, timingRecommendation, reason, blockers, prerequisites
- outreachCoach: an object with verdict, message, mainWarning, recommendedPreparation, humanReviewRequired
- persona: a short English description
- painPoints: an array of short English pain hypotheses; do not present unconfirmed pains as confirmed facts
- icebreaker: a short English sentence
- confidence: "high", "medium", or "low"
- scoreEvidence: up to five evidence objects with id, signalType, basis, category, summary, evidenceText, sourceSection, confidence, scoreImpact
- scoringMetadata: scoringVersion, finalScore, fitLabel, confidence, factsUsedCount, inferencesUsedCount, missingCriteriaCount, disqualifierCount, analysisDepth
- dmVariants: return an empty array during Analyze Profile

Every decisionBreakdown item must have exactly:
{
  "status": "strong",
  "score": 0,
  "explanation": "string",
  "evidence": ["string"],
  "source": "string",
  "basis": "fact"
}
Allowed decisionBreakdown.status values are exactly: "strong", "moderate", "weak", "missing", "negative".
Allowed decisionBreakdown.basis values are exactly: "fact", "inference", "mixed", "missing".
Do not return "partial" for decisionBreakdown.status. Use "moderate".
Do not use status "strong" when source is "not_available", basis is "missing", or evidence is empty.

Allowed outreachReadiness.readiness values are exactly: "ready", "almost_ready", "not_ready", "avoid".
Do not return "low" for outreachReadiness.readiness. Use "not_ready".
Allowed outreachReadiness.timingRecommendation values are exactly: "Contact now", "Research first", "Wait for a stronger signal", "Do not contact yet".
Do not return full sentences for timingRecommendation.
Allowed outreachCoach.verdict values are exactly: "Send after review", "Research before sending", "Rewrite before sending", "Do not send yet".
Do not return "Proceed with caution" for outreachCoach.verdict. Use "Research before sending".

outreachCoach.humanReviewRequired must always be true.
Do not use "Send now"; use "Send after review" only when appropriate.
Research actions must be safe manual actions only, such as reviewing visible profile sections, public company information, or asking a low-pressure qualification question.

Compact valid enum example:
{
  "decisionBreakdown": {
    "dataSufficiency": {
      "status": "moderate",
      "score": 56,
      "explanation": "Some visible evidence exists, but context is incomplete.",
      "evidence": ["Visible headline"],
      "source": "headline",
      "basis": "fact"
    }
  },
  "outreachReadiness": {
    "readiness": "almost_ready",
    "readinessScore": 72,
    "timingRecommendation": "Research first",
    "reason": "Relevant context is visible, but direct pain is not confirmed.",
    "blockers": ["No direct pain evidence"],
    "prerequisites": ["Confirm CRM workflow relevance"]
  },
  "outreachCoach": {
    "verdict": "Research before sending",
    "message": "Review the assumptions before writing.",
    "mainWarning": "Do not claim unconfirmed pain.",
    "recommendedPreparation": "Check visible About or Experience details.",
    "humanReviewRequired": true
  },
  "dmVariants": []
}

Do not use placeholder values. Calculate leadScore from the visible profile and ICP settings.
Do not use LinkedIn URLs, LinkedIn source labels, or the fact that this is a LinkedIn profile as pain-point evidence.
A Founder, CEO, or Lead keyword alone is not enough for Strong fit.
Strong fit requires multiple independent ICP signals. Missing company size lowers confidence to medium or low.
When industry, company size, operational pain, and buyer relevance are weak or missing, use Research more or Low priority even if seniority is visible.
actionReason must explain the Recommended Action using visible matches, missing criteria, and risks. It must not describe the DM angle.
Do not overclaim. Separate visible facts from cautious inferences in the signal arrays.
Do not invent facts that are not visible in the LinkedIn profile or saved Seller Context.
If evidence is insufficient, set recommendedAction to "Research more" or "Low priority".
Respect claimsToAvoid and compatibilityContext from Seller Context.

User settings:
${buildSettingsSummary(userSettings)}

Backend scoring context:
${JSON.stringify(safeScoringContextForPrompt(scoringContext), null, 2)}

Visible LinkedIn profile:
${JSON.stringify(safeProfileForPrompt(profile), null, 2)}
`;

      const analysis = await requestValidatedJson(
        analysisSchema as z.ZodType<ProfileAnalysis>,
        systemPrompt,
        userPrompt,
        "Return corrected JSON only. leadScore must be a meaningful integer from 0 to 100, not a copied placeholder. All text fields must be fluent English only.",
        {
          logAnalysisPerformance: true,
          normalizeBeforeValidation: normalizeAnalysisResponseForSchema,
          requestedSections: [
            "lead decision",
            "decision breakdown",
            "outreach readiness",
            "research actions",
            "score evidence",
            "outreach strategy"
          ]
        }
      );

      return ensureAnalysisDefaults(normalizeProfileAnalysisScore(analysis, profile, userSettings));
    } finally {
      console.log("[openai-analysis] total completed", {
        durationMs: Date.now() - analyzeStartedAt,
        model: getOpenAiModel()
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

function ensureAnalysisDefaults(analysis: ProfileAnalysis): ProfileAnalysis {
  const recommendedNextAction = analysis.recommendedNextAction || analysis.recommendedAction;

  return {
    ...analysis,
    recommendedNextAction,
    recommendedAction: analysis.recommendedAction || recommendedNextAction,
    recommendedOutreachAngle: analysis.recommendedOutreachAngle || "Research first",
    whyThisAngle:
      analysis.whyThisAngle ||
      "There is not enough visible buying context to recommend a more aggressive sales angle.",
    dmVariants: analysis.dmVariants.slice(0, 3)
  };
}
