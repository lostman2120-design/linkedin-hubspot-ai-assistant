import { GeneratedDmSchema, ProfileAnalysisSchema } from "@linkedin-hubspot-ai/shared";
import { z } from "zod";

export const ENGLISH_ONLY_AI_OUTPUT_RULES = [
  "Always write every AI-generated string in natural English.",
  "Never mirror the LinkedIn profile language.",
  "If the profile is in Japanese or any other non-English language, still write fluent English.",
  "Use natural US SaaS and sales language.",
  "Keep the wording concise, conversational, and modern for LinkedIn.",
  "Avoid aggressive sales language.",
  "Avoid robotic AI tone, stiff templates, and literal translations.",
  "Do not translate Japanese phrases word-for-word.",
  "Use Unknown in English when information is unavailable."
] as const;

const NON_ENGLISH_SCRIPT_REGEX = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Cyrillic}\p{Script=Arabic}]/u;

export function buildEnglishOnlyInstruction(): string {
  return ENGLISH_ONLY_AI_OUTPUT_RULES.join(" ");
}

export function buildLeadScoringInstruction(hasTargetCustomerProfile: boolean): string {
  const fitBasis = hasTargetCustomerProfile
    ? "Score fit primarily against the user's target customer profile and product or service."
    : [
        "The user's target customer profile is missing or too broad.",
        "Use a generic B2B SaaS sales relevance fallback based on seniority, department, likely buying influence, company context, and relevance to sales, marketing, customer success, operations, revenue, or growth work."
      ].join(" ");

  return [
    "Assign a meaningful leadScore from 0 to 100.",
    "Do not copy a placeholder score from the JSON example.",
    "Do not default to 0 unless the profile is clearly irrelevant, contains almost no useful visible information, or parsing fully fails.",
    fitBasis,
    "Scoring guide: 80-100 = strong fit, 60-79 = good fit, 40-59 = possible fit, 15-39 = weak fit, 0-14 = poor fit.",
    "Briefly reflect the score in recommendedAction without explaining hidden reasoning."
  ].join(" ");
}

export function containsNonEnglishScript(value: string): boolean {
  return NON_ENGLISH_SCRIPT_REGEX.test(value);
}

function addEnglishOnlyIssue(context: z.RefinementCtx, path: Array<string | number>): void {
  context.addIssue({
    code: z.ZodIssueCode.custom,
    message: "This field must be written in English only.",
    path
  });
}

export function validateEnglishOnlyStrings(value: unknown, context: z.RefinementCtx, path: Array<string | number> = []): void {
  if (typeof value === "string") {
    if (containsNonEnglishScript(value)) {
      addEnglishOnlyIssue(context, path);
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => validateEnglishOnlyStrings(item, context, [...path, index]));
    return;
  }

  if (typeof value === "object" && value !== null) {
    Object.entries(value).forEach(([key, item]) => validateEnglishOnlyStrings(item, context, [...path, key]));
  }
}

export function createEnglishOnlyProfileAnalysisSchema() {
  return ProfileAnalysisSchema.superRefine((value, context) => {
    validateEnglishOnlyStrings(
      {
        persona: value.persona,
        painPoints: value.painPoints,
        icebreaker: value.icebreaker,
        recommendedAction: value.recommendedAction,
        recommendedNextAction: value.recommendedNextAction,
        positiveSignals: value.positiveSignals,
        negativeSignals: value.negativeSignals,
        missingInformation: value.missingInformation,
        riskWarnings: value.riskWarnings,
        recommendedOutreachAngle: value.recommendedOutreachAngle,
        whyThisAngle: value.whyThisAngle,
        whatToAvoid: value.whatToAvoid,
        scoreEvidence: (value.scoreEvidence ?? []).map((item) => ({
          summary: item.summary,
          sourceSection: item.sourceSection,
          confidence: item.confidence
        })),
        dmVariants: (value.dmVariants ?? []).map((variant) => ({
          label: variant.label,
          useCase: variant.useCase,
          text: variant.text,
          personalizationUsed: variant.personalizationUsed,
          offerContextUsed: variant.offerContextUsed,
          factsUsed: variant.factsUsed,
          inferencesUsed: variant.inferencesUsed,
          warnings: variant.warnings,
          riskLevel: variant.riskLevel
        }))
      },
      context
    );
  });
}

export function createEnglishOnlyGeneratedDmSchema(maxLength: number) {
  return GeneratedDmSchema.superRefine((value, context) => {
    if ([...value.message].length > maxLength + 30) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `The message must be about ${maxLength} characters or less.`,
        path: ["message"]
      });
    }

    if (/quick call\??/i.test(value.message)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Avoid repetitive sales phrases like quick call.",
        path: ["message"]
      });
    }

    validateEnglishOnlyStrings(
      {
        message: value.message,
        warnings: value.warnings,
        offerContextUsed: value.offerContextUsed,
        factsUsed: value.factsUsed,
        inferencesUsed: value.inferencesUsed
      },
      context
    );
  });
}
