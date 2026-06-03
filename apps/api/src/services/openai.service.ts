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
  return JSON.stringify(
    {
      productOrServiceDescription: userSettings.productOrServiceDescription || "Unknown",
      targetCustomerProfile: userSettings.targetCustomerProfile || "Unknown",
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

async function requestValidatedJson<T>(
  schema: z.ZodType<T>,
  systemPrompt: string,
  userPrompt: string,
  retryHint: string
): Promise<T> {
  const messages = [
    { role: "system" as const, content: systemPrompt },
    { role: "user" as const, content: userPrompt }
  ];

  const firstJson = await requestJsonFromOpenAi(messages);
  const firstParse = schema.safeParse(firstJson);
  if (firstParse.success) {
    return firstParse.data;
  }

  const retryJson = await requestJsonFromOpenAi([
    ...messages,
    {
      role: "user" as const,
      content: `${retryHint}\nSchema problems:\n${firstParse.error.issues
        .map((issue) => `${issue.path.join(".") || "response"}: ${issue.message}`)
        .join("\n")}`
    }
  ]);
  const retryParse = schema.safeParse(retryJson);

  if (!retryParse.success) {
    throw new AppError(502, "The AI response was not in the format this app needs. Please try again.");
  }

  return retryParse.data;
}

export class OpenAiService {
  async analyzeProfile(profile: LinkedInProfile, userSettings: UserSettings): Promise<ProfileAnalysis> {
    const analysisSchema = createEnglishOnlyProfileAnalysisSchema();
    const scoringContext = buildLeadScoringContext(profile, userSettings);

    const systemPrompt = [
      "You are a careful sales research assistant.",
      "Use only the visible LinkedIn profile information provided by the user.",
      "Separate facts from assumptions in your reasoning, but return only the requested JSON fields.",
      "If information is not available, return the word Unknown.",
      "Do not invent private information.",
      buildLeadScoringInstruction(Boolean(userSettings.targetCustomerProfile.trim())),
      "Persona descriptions, pain points, icebreakers, and recommended next actions must be English-only.",
      buildEnglishOnlyInstruction(),
      "Always return valid JSON."
    ].join(" ");

    const userPrompt = `Analyze this LinkedIn profile for sales fit.

Return one JSON object with these exact fields:
- leadScore: an integer from 0 to 100
- persona: a short English description
- painPoints: an array of short English strings
- icebreaker: a short English sentence
- recommendedAction: a short English sentence
- confidence: "high", "medium", or "low"

Do not use placeholder values. Calculate leadScore from the visible profile and settings.

User settings:
${buildSettingsSummary(userSettings)}

Backend scoring context:
${JSON.stringify(scoringContext, null, 2)}

Visible LinkedIn profile:
${JSON.stringify(safeProfileForPrompt(profile), null, 2)}
`;

    const analysis = await requestValidatedJson(
      analysisSchema,
      systemPrompt,
      userPrompt,
      "Return corrected JSON only. leadScore must be a meaningful integer from 0 to 100, not a copied placeholder. All text fields must be fluent English only."
    );

    return normalizeProfileAnalysisScore(analysis, profile, userSettings);
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
      buildEnglishOnlyInstruction(),
      "Always return valid JSON."
    ].join(" ");

    const userPrompt = `Write a ${messageType} LinkedIn message.

Return exactly this JSON shape:
{
  "message": "string",
  "personalizationScore": 0,
  "spamRisk": "low | medium | high",
  "warnings": ["string"]
}

Length rule: keep the message about ${maxLength} characters or less.

User settings:
${buildSettingsSummary(userSettings)}

Visible LinkedIn profile:
${JSON.stringify(safeProfileForPrompt(profile), null, 2)}

Profile analysis:
${JSON.stringify(analysis, null, 2)}
`;

    return requestValidatedJson(
      dmSchema,
      systemPrompt,
      userPrompt,
      "Return corrected JSON only. Make the message shorter, more personal, less salesy, and English-only."
    );
  }
}
