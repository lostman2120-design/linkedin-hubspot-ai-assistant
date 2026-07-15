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
const decisionBreakdownStatuses = ["strong", "moderate", "weak", "missing", "negative"] as const;
const decisionBreakdownBases = ["fact", "inference", "mixed", "missing"] as const;
const dataSufficiencyValues = ["sufficient", "partial", "insufficient"] as const;
const readinessValues = ["ready", "almost_ready", "not_ready", "avoid"] as const;
const timingRecommendations = ["Contact now", "Research first", "Wait for a stronger signal", "Do not contact yet"] as const;
const researchPriorities = ["high", "medium", "low"] as const;
const outreachCoachVerdicts = ["Send after review", "Research before sending", "Rewrite before sending", "Do not send yet"] as const;

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
    actionReason: normalizeString(
      input.actionReason,
      "The visible evidence is not sufficient for a stronger sales decision.",
      700
    ),
    actionRisks: normalizeStringArray(input.actionRisks, 3, 220),
    actionPrerequisites: normalizeStringArray(input.actionPrerequisites, 3, 220),
    actionExpiration: normalizeString(input.actionExpiration, "Re-evaluate after reviewing company context", 220),
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
    decisionConfidence: normalizeConfidence(input.decisionConfidence ?? input.confidence),
    dataSufficiency: normalizeEnum(input.dataSufficiency, dataSufficiencyValues, "insufficient"),
    evidenceCoverage: normalizeLeadScore(input.evidenceCoverage),
    confidenceReason: normalizeString(input.confidenceReason, "Visible evidence is limited.", 500),
    limitedContextReasons: normalizeStringArray(input.limitedContextReasons, 8, 220),
    decisionBreakdown: normalizeDecisionBreakdown(input.decisionBreakdown),
    decisionChangeConditions: normalizeDecisionChangeConditions(input.decisionChangeConditions),
    nextBestResearchActions: normalizeNextBestResearchActions(input.nextBestResearchActions),
    outreachReadiness: normalizeOutreachReadiness(input.outreachReadiness),
    outreachCoach: normalizeOutreachCoach(input.outreachCoach),
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
    scoringVersion: normalizeString(input.scoringVersion, "0.5.0", 40),
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

function normalizeDecisionBreakdown(value: unknown): ProfileAnalysis["decisionBreakdown"] {
  const input = isRecord(value) ? value : {};
  const result = {} as ProfileAnalysis["decisionBreakdown"];

  for (const field of decisionBreakdownFields) {
    result[field] = normalizeDecisionBreakdownItem(input[field]);
  }

  return result;
}

function normalizeDecisionBreakdownItem(value: unknown): ProfileAnalysis["decisionBreakdown"]["roleFit"] {
  const input = isRecord(value) ? value : {};
  const status = normalizeDecisionBreakdownStatus(input.status);
  const basis = normalizeEnum(input.basis, decisionBreakdownBases, "missing");
  const source = normalizeString(input.source, "not_available", 120);
  const evidence = normalizeStringArray(input.evidence, 2, 220);
  const supportedStatus = status === "strong" && (basis === "missing" || source === "not_available" || (!evidence.length && source !== "computed"))
    ? "missing"
    : status;

  return {
    status: supportedStatus,
    score: normalizeLeadScore(input.score),
    explanation: normalizeString(input.explanation, "Not enough visible evidence is available yet.", 500),
    evidence: supportedStatus === "missing" && status === "strong" ? [] : evidence,
    source,
    basis: supportedStatus === "missing" && status === "strong" ? "missing" : basis
  };
}

function normalizeDecisionChangeConditions(value: unknown): ProfileAnalysis["decisionChangeConditions"] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .slice(0, 3)
    .map((item) => {
      if (!isRecord(item)) {
        return null;
      }

      const condition = normalizeString(item.condition, "", 220);
      if (!condition) {
        return null;
      }

      return {
        condition,
        currentState: normalizeString(item.currentState, "Not confirmed", 220),
        impactIfConfirmed: normalizeString(item.impactIfConfirmed, "Would change the sales decision.", 320),
        recommendedActionIfConfirmed: normalizeRecommendedAction(item.recommendedActionIfConfirmed, 60)
      };
    })
    .filter((item): item is ProfileAnalysis["decisionChangeConditions"][number] => Boolean(item));
}

function normalizeNextBestResearchActions(value: unknown): ProfileAnalysis["nextBestResearchActions"] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .slice(0, 2)
    .map((item) => {
      if (!isRecord(item)) {
        return null;
      }

      const action = normalizeString(item.action, "", 220);
      if (!action) {
        return null;
      }

      return {
        priority: normalizeEnum(item.priority, researchPriorities, "medium"),
        action,
        reason: normalizeString(item.reason, "This would improve the sales decision.", 320),
        expectedDecisionImpact: normalizeString(item.expectedDecisionImpact, "Could change the recommended action.", 320),
        safeSourceSuggestion: normalizeString(item.safeSourceSuggestion, "Review visible or public information manually.", 220)
      };
    })
    .filter((item): item is ProfileAnalysis["nextBestResearchActions"][number] => Boolean(item));
}

function normalizeOutreachReadiness(value: unknown): ProfileAnalysis["outreachReadiness"] {
  const input = isRecord(value) ? value : {};
  return {
    readiness: normalizeReadiness(input.readiness),
    readinessScore: normalizeLeadScore(input.readinessScore),
    timingRecommendation: normalizeTimingRecommendation(input.timingRecommendation),
    reason: normalizeString(input.reason, "More visible evidence is needed before outreach.", 500),
    blockers: normalizeStringArray(input.blockers, 2, 220),
    prerequisites: normalizeStringArray(input.prerequisites, 2, 220)
  };
}

function normalizeOutreachCoach(value: unknown): ProfileAnalysis["outreachCoach"] {
  const input = isRecord(value) ? value : {};
  return {
    verdict: normalizeCoachVerdict(input.verdict),
    message: normalizeString(input.message, "Review the evidence before sending any outreach.", 600),
    mainWarning: normalizeString(input.mainWarning, "Do not send unsupported claims.", 400),
    recommendedPreparation: normalizeString(input.recommendedPreparation, "Confirm the missing buying context first.", 400),
    humanReviewRequired: true
  };
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

function normalizeDecisionBreakdownStatus(value: unknown): ProfileAnalysis["decisionBreakdown"]["roleFit"]["status"] {
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
  if (["negative", "disqualified"].includes(normalized)) {
    return "negative";
  }
  if (["missing", "insufficient", "unavailable", "unknown", "not enough data"].includes(normalized)) {
    return "missing";
  }
  return normalizeEnum(value, decisionBreakdownStatuses, "missing");
}

function normalizeReadiness(value: unknown): ProfileAnalysis["outreachReadiness"]["readiness"] {
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
  return normalizeEnum(value, readinessValues, "not_ready");
}

function normalizeTimingRecommendation(value: unknown): ProfileAnalysis["outreachReadiness"]["timingRecommendation"] {
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
  return normalizeEnum(value, timingRecommendations, "Research first");
}

function normalizeCoachVerdict(value: unknown): ProfileAnalysis["outreachCoach"]["verdict"] {
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
  return normalizeEnum(value, outreachCoachVerdicts, "Research before sending");
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
