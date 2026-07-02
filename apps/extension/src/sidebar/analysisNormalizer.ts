import { normalizeRecommendedAction } from "@linkedin-hubspot-ai/shared";
import type { DmVariant, OutreachStrategy, ProfileAnalysis, ScoreEvidence, ScoringMetadata } from "@linkedin-hubspot-ai/shared";

const allowedVariantLabels = ["Soft opener", "Direct value pitch", "Feedback request"] as const;
const fallbackVariantLabels: DmVariant["label"][] = ["Soft opener", "Direct value pitch", "Feedback request"];
const scoreEvidenceSignalTypes = ["positive", "negative", "missing", "disqualifier"] as const;
const scoreEvidenceBases = ["fact", "inference"] as const;
const scoreEvidenceCategories = [
  "role",
  "industry",
  "company",
  "company_size",
  "region",
  "pain_point",
  "technology",
  "activity",
  "experience",
  "exclusion",
  "other"
] as const;
const scoreEvidenceSources = [
  "headline",
  "about",
  "experience",
  "education",
  "skills",
  "activity",
  "profile",
  "seller_context",
  "not_available"
] as const;

export function normalizeAnalysisResult(raw: unknown): ProfileAnalysis {
  const input = isRecord(raw) ? raw : {};
  const confidence = normalizeConfidence(input.confidence);
  const leadScore = normalizeLeadScore(input.leadScore);

  return {
    leadScore,
    fitLabel: normalizeString(input.fitLabel, "Not enough data", 80),
    confidence,
    persona: normalizeString(input.persona, "", 500),
    painPoints: normalizeStringArray(input.painPoints, 6, 220),
    icebreaker: normalizeString(input.icebreaker, "", 500),
    recommendedAction: normalizeRecommendedAction(input.recommendedAction, leadScore),
    recommendedNextAction: normalizeString(input.recommendedNextAction, "", 500),
    positiveSignals: normalizeStringArray(input.positiveSignals, 8, 220),
    negativeSignals: normalizeStringArray(input.negativeSignals, 8, 220),
    missingInformation: normalizeStringArray(input.missingInformation, 8, 220),
    riskWarnings: normalizeStringArray(input.riskWarnings, 8, 220),
    recommendedOutreachAngle: normalizeString(input.recommendedOutreachAngle, "", 160),
    whyThisAngle: normalizeString(input.whyThisAngle, "", 600),
    whatToAvoid: normalizeStringArray(input.whatToAvoid, 8, 220),
    outreachStrategy: normalizeOutreachStrategy(input.outreachStrategy, input),
    scoreEvidence: normalizeScoreEvidence(input.scoreEvidence),
    scoringMetadata: normalizeScoringMetadata(input.scoringMetadata, input.leadScore, input.fitLabel, confidence),
    dmVariants: normalizeDmVariants(input.dmVariants)
  };
}

export function normalizeDmVariants(value: unknown): DmVariant[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .slice(0, 3)
    .map((item, index) => normalizeDmVariant(item, index))
    .filter((variant): variant is DmVariant => Boolean(variant));
}

export function normalizeStringArray(value: unknown, maxItems: number, maxChars: number): string[] {
  const values = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  return values
    .map((item) => normalizeString(item, "", maxChars))
    .filter(Boolean)
    .slice(0, maxItems);
}

function normalizeDmVariant(value: unknown, index: number): DmVariant | null {
  if (!isRecord(value)) {
    return null;
  }

  const text = normalizeString(value.text, "", 900);
  if (!text) {
    return null;
  }

  return {
    label: normalizeVariantLabel(value.label, index),
    useCase: normalizeString(value.useCase, "", 300),
    text,
    personalizationUsed: normalizeStringArray(value.personalizationUsed, 8, 160),
    offerContextUsed: normalizeStringArray(value.offerContextUsed, 6, 180),
    factsUsed: normalizeStringArray(value.factsUsed, 6, 220),
    inferencesUsed: normalizeStringArray(value.inferencesUsed, 6, 220),
    warnings: normalizeStringArray(value.warnings, 6, 220),
    riskLevel: normalizeRiskLevel(value.riskLevel)
  };
}

function normalizeScoreEvidence(value: unknown): ScoreEvidence[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(normalizeScoreEvidenceItem)
    .filter((item): item is ScoreEvidence => Boolean(item))
    .slice(0, 20);
}

function normalizeScoreEvidenceItem(value: unknown): ScoreEvidence | null {
  if (!isRecord(value)) {
    return null;
  }

  const summary = normalizeString(value.summary, "", 240);
  if (!summary) {
    return null;
  }

  return {
    id: normalizeString(value.id, `ev-${summary.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}`, 80),
    signalType: normalizeEnum(value.signalType, scoreEvidenceSignalTypes, "missing"),
    basis: normalizeEnum(value.basis, scoreEvidenceBases, "inference"),
    category: normalizeEnum(value.category, scoreEvidenceCategories, "other"),
    summary,
    evidenceText: normalizeNullableString(value.evidenceText, 220),
    sourceSection: normalizeEnum(value.sourceSection, scoreEvidenceSources, "not_available"),
    confidence: normalizeEvidenceConfidence(value.confidence),
    scoreImpact: normalizeScoreImpact(value.scoreImpact)
  };
}

function normalizeScoringMetadata(
  value: unknown,
  leadScore: unknown,
  fitLabel: unknown,
  confidence: ProfileAnalysis["confidence"]
): ScoringMetadata {
  const input = isRecord(value) ? value : {};
  const finalScore = normalizeLeadScore(input.finalScore ?? leadScore);

  return {
    scoringVersion: normalizeString(input.scoringVersion, "0.4.0", 40),
    finalScore,
    fitLabel: normalizeString(fitLabel ?? input.fitLabel, "Not enough data", 80) as ScoringMetadata["fitLabel"],
    confidence: normalizeConfidence(input.confidence ?? confidence),
    factsUsedCount: normalizeNonNegativeCount(input.factsUsedCount),
    inferencesUsedCount: normalizeNonNegativeCount(input.inferencesUsedCount),
    missingCriteriaCount: normalizeNonNegativeCount(input.missingCriteriaCount),
    disqualifierCount: normalizeNonNegativeCount(input.disqualifierCount),
    analysisDepth: normalizeEnum(input.analysisDepth, ["limited", "standard", "deep"] as const, "limited")
  };
}

function normalizeLeadScore(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return clampScore(value);
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return clampScore(parsed);
    }
  }

  return 0;
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function normalizeConfidence(value: unknown): ProfileAnalysis["confidence"] {
  const normalizedValue = typeof value === "string" ? value.trim().toLowerCase() : "";
  return normalizedValue === "high" || normalizedValue === "medium" || normalizedValue === "low" ? normalizedValue : "low";
}

function normalizeRiskLevel(value: unknown): DmVariant["riskLevel"] {
  const normalizedValue = typeof value === "string" ? value.trim().toLowerCase() : "";
  return normalizedValue === "high" || normalizedValue === "medium" || normalizedValue === "low" ? normalizedValue : "low";
}

function normalizeEvidenceConfidence(value: unknown): ScoreEvidence["confidence"] {
  const normalizedValue = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (normalizedValue === "high") {
    return "High";
  }

  if (normalizedValue === "medium") {
    return "Medium";
  }

  return "Low";
}

function normalizeScoreImpact(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return Math.max(-100, Math.min(100, Math.round(value)));
}

function normalizeNonNegativeCount(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}

function normalizeNullableString(value: unknown, maxChars: number): string | null {
  const normalized = normalizeString(value, "", maxChars);
  return normalized || null;
}

function normalizeEnum<const T extends readonly string[]>(value: unknown, allowedValues: T, fallback: T[number]): T[number] {
  if (typeof value !== "string") {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  return allowedValues.find((item) => item.toLowerCase() === normalized) ?? fallback;
}

function normalizeVariantLabel(value: unknown, index: number): DmVariant["label"] {
  if (typeof value === "string") {
    const normalizedValue = value.trim().replace(/\s+/g, " ").toLowerCase();
    if (normalizedValue === "direct pitch") {
      return "Direct value pitch";
    }

    const exactLabel = allowedVariantLabels.find((label) => label.toLowerCase() === normalizedValue);
    if (exactLabel) {
      return exactLabel;
    }
  }

  return fallbackVariantLabels[index] ?? "Soft opener";
}

function normalizeOutreachStrategy(value: unknown, analysis: Record<string, unknown>): OutreachStrategy {
  const input = isRecord(value) ? value : {};
  const painPoints = normalizeStringArray(analysis.painPoints, 6, 220);
  const avoidItems = normalizeStringArray(analysis.whatToAvoid, 8, 220);

  return {
    whyRelevant: normalizeString(
      input.whyRelevant,
      normalizeString(analysis.whyThisAngle, "More visible evidence is needed to confirm relevance.", 700),
      700
    ),
    bestAngle: normalizeString(input.bestAngle, normalizeString(analysis.recommendedOutreachAngle, "Research first", 300), 300),
    painHypothesis: normalizeString(input.painHypothesis, painPoints[0] || "The prospect's current pain is not confirmed.", 700),
    whatToAvoid: normalizeString(
      input.whatToAvoid,
      avoidItems.join("; ") || "Avoid assumptions that are not supported by visible profile evidence.",
      700
    ),
    suggestedCTA: normalizeString(input.suggestedCTA, "Ask one short, low-pressure question.", 400)
  };
}

function normalizeString(value: unknown, fallback: string, maxChars: number): string {
  if (typeof value !== "string") {
    return fallback;
  }

  const cleaned = value.replace(/\s+/g, " ").trim();
  if (!cleaned) {
    return fallback;
  }

  return cleaned.length > maxChars ? `${cleaned.slice(0, Math.max(0, maxChars - 3)).trimEnd()}...` : cleaned;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
