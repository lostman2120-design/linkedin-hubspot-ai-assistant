import { z } from "zod";
import {
  DEFAULT_SELLER_CONTEXT,
  DEFAULT_USER_SETTINGS,
  DM_TONES,
  MESSAGE_TYPES,
  RECOMMENDED_ACTIONS,
  SELLER_CONTEXT_FIELD_LIMITS
} from "./constants.js";
import { PROFILE_TEXT_LIMITS } from "./profileCompaction.js";

const readableString = z.string().trim().min(1, "This field is required.");
const optionalCleanString = z.string().trim().optional();
const optionalLimitedString = (maxLength: number) => z.string().trim().max(maxLength).optional();
const ConfidenceSchema = z.preprocess(
  (value) => (typeof value === "string" ? value.toLowerCase() : value),
  z.enum(["high", "medium", "low"])
);
const EvidenceConfidenceSchema = z.preprocess(
  (value) => {
    if (typeof value !== "string") {
      return value;
    }

    const normalized = value.trim().toLowerCase();
    return normalized ? `${normalized.slice(0, 1).toUpperCase()}${normalized.slice(1)}` : value;
  },
  z.enum(["High", "Medium", "Low"])
);

const likelySecretPattern =
  /\b(sk-[A-Za-z0-9_-]{12,}|pat-[A-Za-z0-9_-]{12,}|xox[baprs]-[A-Za-z0-9_-]+|bearer\s+[A-Za-z0-9._-]{12,}|api[_\s-]?key\s*[:=]\s*\S+|token\s*[:=]\s*\S+|secret\s*[:=]\s*\S+)/i;

function rejectLikelySecrets(value: string, context: z.RefinementCtx, path: Array<string | number>): void {
  if (likelySecretPattern.test(value)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Seller Context should not contain API keys, tokens, passwords, or secrets.",
      path
    });
  }
}

export const DmVariantSchema = z.object({
  label: z.enum(["Soft opener", "Direct value pitch", "Feedback request"]),
  useCase: readableString.max(300),
  text: readableString.max(900),
  personalizationUsed: z.array(z.string().trim().min(1)).max(8).default([]),
  offerContextUsed: z.array(z.string().trim().min(1).max(180)).max(6).default([]),
  factsUsed: z.array(z.string().trim().min(1).max(220)).max(6).default([]),
  inferencesUsed: z.array(z.string().trim().min(1).max(220)).max(6).default([]),
  warnings: z.array(z.string().trim().min(1).max(220)).max(6).default([]),
  riskLevel: z.preprocess((value) => (typeof value === "string" ? value.toLowerCase() : value), z.enum(["low", "medium", "high"]))
});

export const SellerContextSchema = z
  .object({
    productOrServiceName: z.string().trim().max(SELLER_CONTEXT_FIELD_LIMITS.productOrServiceName).default(DEFAULT_SELLER_CONTEXT.productOrServiceName),
    productOrServiceDescription: z
      .string()
      .trim()
      .max(SELLER_CONTEXT_FIELD_LIMITS.productOrServiceDescription)
      .default(DEFAULT_SELLER_CONTEXT.productOrServiceDescription),
    targetOutcome: z.string().trim().max(SELLER_CONTEXT_FIELD_LIMITS.targetOutcome).default(DEFAULT_SELLER_CONTEXT.targetOutcome),
    mainDifferentiators: z
      .string()
      .trim()
      .max(SELLER_CONTEXT_FIELD_LIMITS.mainDifferentiators)
      .default(DEFAULT_SELLER_CONTEXT.mainDifferentiators),
    proofPoints: z.string().trim().max(SELLER_CONTEXT_FIELD_LIMITS.proofPoints).default(DEFAULT_SELLER_CONTEXT.proofPoints),
    pricingContext: z.string().trim().max(SELLER_CONTEXT_FIELD_LIMITS.pricingContext).default(DEFAULT_SELLER_CONTEXT.pricingContext),
    preferredCta: z.string().trim().max(SELLER_CONTEXT_FIELD_LIMITS.preferredCta).default(DEFAULT_SELLER_CONTEXT.preferredCta),
    claimsAllowed: z.string().trim().max(SELLER_CONTEXT_FIELD_LIMITS.claimsAllowed).default(DEFAULT_SELLER_CONTEXT.claimsAllowed),
    claimsToAvoid: z.string().trim().max(SELLER_CONTEXT_FIELD_LIMITS.claimsToAvoid).default(DEFAULT_SELLER_CONTEXT.claimsToAvoid),
    brandVoice: z.string().trim().max(SELLER_CONTEXT_FIELD_LIMITS.brandVoice).default(DEFAULT_SELLER_CONTEXT.brandVoice),
    competitorsOrAlternatives: z
      .string()
      .trim()
      .max(SELLER_CONTEXT_FIELD_LIMITS.competitorsOrAlternatives)
      .default(DEFAULT_SELLER_CONTEXT.competitorsOrAlternatives),
    compatibilityContext: z
      .string()
      .trim()
      .max(SELLER_CONTEXT_FIELD_LIMITS.compatibilityContext)
      .default(DEFAULT_SELLER_CONTEXT.compatibilityContext)
  })
  .superRefine((value, context) => {
    Object.entries(value).forEach(([key, item]) => rejectLikelySecrets(item, context, [key]));
  });

export const ScoreEvidenceSchema = z.object({
  id: readableString.max(80),
  signalType: z.enum(["positive", "negative", "missing", "disqualifier"]),
  basis: z.enum(["fact", "inference"]),
  category: z.enum([
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
  ]),
  summary: readableString.max(240),
  evidenceText: z.string().trim().max(220).nullable(),
  sourceSection: z.enum([
    "headline",
    "about",
    "experience",
    "education",
    "skills",
    "activity",
    "profile",
    "seller_context",
    "not_available"
  ]),
  confidence: EvidenceConfidenceSchema,
  scoreImpact: z.number().int().min(-100).max(100).nullable()
});

export const ScoringMetadataSchema = z.object({
  scoringVersion: z.string().trim().default("0.5.0"),
  finalScore: z.number().int().min(0).max(100).default(0),
  fitLabel: z.enum(["Strong fit", "Possible fit", "Weak fit", "Not enough data"]).default("Not enough data"),
  confidence: ConfidenceSchema.default("low"),
  factsUsedCount: z.number().int().min(0).max(100).default(0),
  inferencesUsedCount: z.number().int().min(0).max(100).default(0),
  missingCriteriaCount: z.number().int().min(0).max(100).default(0),
  disqualifierCount: z.number().int().min(0).max(100).default(0),
  analysisDepth: z.enum(["limited", "standard", "deep"]).default("limited")
});

export const RecommendedActionSchema = z.enum(RECOMMENDED_ACTIONS);

export const OutreachStrategySchema = z.object({
  whyRelevant: readableString.max(700),
  bestAngle: readableString.max(300),
  painHypothesis: readableString.max(700),
  whatToAvoid: readableString.max(700),
  suggestedCTA: readableString.max(400)
});

const DecisionBreakdownStatusSchema = z.preprocess(
  (value) => (typeof value === "string" ? value.trim().toLowerCase() : value),
  z.enum(["strong", "moderate", "weak", "missing", "negative"])
);

const DecisionBreakdownBasisSchema = z.preprocess(
  (value) => (typeof value === "string" ? value.trim().toLowerCase() : value),
  z.enum(["fact", "inference", "mixed", "missing"])
);

const DataSufficiencySchema = z.preprocess(
  (value) => (typeof value === "string" ? value.trim().toLowerCase() : value),
  z.enum(["sufficient", "partial", "insufficient"])
);

const OutreachReadinessSchemaValue = z.preprocess(
  (value) => (typeof value === "string" ? value.trim().toLowerCase().replace(/\s+/g, "_") : value),
  z.enum(["ready", "almost_ready", "not_ready", "avoid"])
);

const TimingRecommendationSchema = z.enum(["Contact now", "Research first", "Wait for a stronger signal", "Do not contact yet"]);

const ResearchPrioritySchema = z.preprocess(
  (value) => (typeof value === "string" ? value.trim().toLowerCase() : value),
  z.enum(["high", "medium", "low"])
);

const OutreachCoachVerdictSchema = z.enum(["Send after review", "Research before sending", "Rewrite before sending", "Do not send yet"]);

const DecisionBreakdownItemSchema = z.object({
  status: DecisionBreakdownStatusSchema.default("missing"),
  score: z.number().int().min(0).max(100).default(0),
  explanation: z.string().trim().min(1).max(500).default("Not enough visible evidence is available yet."),
  evidence: z.array(z.string().trim().min(1).max(220)).max(5).default([]),
  source: z.string().trim().min(1).max(120).default("not_available"),
  basis: DecisionBreakdownBasisSchema.default("missing")
});

const fallbackDecisionBreakdownItem = {
  status: "missing" as const,
  score: 0,
  explanation: "Not enough visible evidence is available yet.",
  evidence: [],
  source: "not_available",
  basis: "missing" as const
};

export const DecisionBreakdownSchema = z.object({
  roleFit: DecisionBreakdownItemSchema.default(fallbackDecisionBreakdownItem),
  industryFit: DecisionBreakdownItemSchema.default(fallbackDecisionBreakdownItem),
  companyFit: DecisionBreakdownItemSchema.default(fallbackDecisionBreakdownItem),
  buyerRelevance: DecisionBreakdownItemSchema.default(fallbackDecisionBreakdownItem),
  painEvidence: DecisionBreakdownItemSchema.default(fallbackDecisionBreakdownItem),
  timingSignal: DecisionBreakdownItemSchema.default(fallbackDecisionBreakdownItem),
  relationshipSignal: DecisionBreakdownItemSchema.default(fallbackDecisionBreakdownItem),
  dataSufficiency: DecisionBreakdownItemSchema.default(fallbackDecisionBreakdownItem),
  riskLevel: DecisionBreakdownItemSchema.default(fallbackDecisionBreakdownItem)
});

export const DecisionChangeConditionSchema = z.object({
  condition: readableString.max(220),
  currentState: readableString.max(220),
  impactIfConfirmed: readableString.max(320),
  recommendedActionIfConfirmed: RecommendedActionSchema
});

export const NextBestResearchActionSchema = z.object({
  priority: ResearchPrioritySchema.default("medium"),
  action: readableString.max(220),
  reason: readableString.max(320),
  expectedDecisionImpact: readableString.max(320),
  safeSourceSuggestion: readableString.max(220)
});

export const OutreachReadinessSchema = z.object({
  readiness: OutreachReadinessSchemaValue.default("not_ready"),
  readinessScore: z.number().int().min(0).max(100).default(0),
  timingRecommendation: TimingRecommendationSchema.default("Research first"),
  reason: readableString.max(500).default("More visible evidence is needed before outreach."),
  blockers: z.array(z.string().trim().min(1).max(220)).max(6).default([]),
  prerequisites: z.array(z.string().trim().min(1).max(220)).max(6).default([])
});

export const OutreachCoachSchema = z.object({
  verdict: OutreachCoachVerdictSchema.default("Research before sending"),
  message: readableString.max(600).default("Review the evidence before sending any outreach."),
  mainWarning: readableString.max(400).default("Do not send unsupported claims."),
  recommendedPreparation: readableString.max(400).default("Confirm the missing buying context first."),
  humanReviewRequired: z.literal(true).default(true)
});

export function recommendedActionForScore(leadScore: number): (typeof RECOMMENDED_ACTIONS)[number] {
  if (leadScore >= 80) {
    return "Pursue now";
  }

  if (leadScore >= 55) {
    return "Research more";
  }

  if (leadScore >= 35) {
    return "Low priority";
  }

  return "Do not contact yet";
}

export function normalizeRecommendedAction(value: unknown, leadScore: number): (typeof RECOMMENDED_ACTIONS)[number] {
  if (typeof value !== "string") {
    return recommendedActionForScore(leadScore);
  }

  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/\s+/g, " ");

  if (["pursue", "pursue now", "contact now"].includes(normalized)) {
    return "Pursue now";
  }

  if (["research", "research more", "needs research"].includes(normalized)) {
    return "Research more";
  }

  if (normalized === "low priority") {
    return "Low priority";
  }

  if (["do not contact", "do not contact yet", "dont contact yet"].includes(normalized)) {
    return "Do not contact yet";
  }

  return recommendedActionForScore(leadScore);
}

export const LinkedInVisibleProfileContextSchema = z.object({
  identity: z
    .object({
      fullName: optionalCleanString,
      firstName: optionalCleanString,
      lastName: optionalCleanString,
      headline: optionalLimitedString(PROFILE_TEXT_LIMITS.headline),
      location: optionalLimitedString(200),
      profileUrl: optionalLimitedString(500)
    })
    .optional(),
  currentRole: z
    .object({
      title: optionalCleanString,
      company: optionalCleanString,
      description: optionalLimitedString(PROFILE_TEXT_LIMITS.currentRoleDescription)
    })
    .optional(),
  about: z
    .object({
      text: optionalLimitedString(PROFILE_TEXT_LIMITS.aboutText),
      source: optionalCleanString
    })
    .optional(),
  experience: z
    .object({
      visibleItems: z.array(z.string().trim().min(1).max(PROFILE_TEXT_LIMITS.experienceItem)).max(8).default([])
    })
    .optional(),
  education: z
    .object({
      visibleItems: z.array(z.string().trim().min(1).max(PROFILE_TEXT_LIMITS.educationItem)).max(6).default([])
    })
    .optional(),
  skills: z
    .object({
      visibleItems: z.array(z.string().trim().min(1).max(PROFILE_TEXT_LIMITS.skillItem)).max(12).default([])
    })
    .optional(),
  activity: z
    .object({
      visibleSnippets: z.array(z.string().trim().min(1).max(PROFILE_TEXT_LIMITS.activityTotal)).max(5).default([])
    })
    .optional(),
  rawVisibleContext: z.string().trim().max(PROFILE_TEXT_LIMITS.rawVisibleContext).optional(),
  extractionSources: z.record(z.string()).optional(),
  extractionWarnings: z.array(z.string().trim().min(1)).max(12).default([]),
  identityConfidence: z.enum(["high", "medium", "low"]).optional(),
  headlineConfidence: z.enum(["high", "medium", "low"]).optional(),
  contextConfidence: z.enum(["high", "medium", "low"]).optional(),
  profileLanguage: optionalCleanString
});

export const LinkedInProfileSchema = z.object({
  fullName: z.string().trim().default(""),
  firstName: z.string().trim().optional(),
  lastName: z.string().trim().optional(),
  headline: z.string().trim().max(PROFILE_TEXT_LIMITS.headline).optional(),
  companyName: z.string().trim().optional(),
  jobTitle: z.string().trim().optional(),
  location: z.string().trim().optional(),
  profileUrl: z.string().url("The LinkedIn profile URL is not valid."),
  linkedinUrl: z.string().url("The LinkedIn profile URL is not valid.").optional(),
  extractionConfidence: z.enum(["high", "medium", "low"]).optional(),
  extractionSources: z.record(z.string()).optional(),
  extractionWarnings: z.array(z.string().trim().min(1)).optional(),
  contextConfidence: z.enum(["high", "medium", "low"]).optional(),
  about: z.string().trim().max(PROFILE_TEXT_LIMITS.aboutText).optional(),
  currentRoleTitle: z.string().trim().max(300).optional(),
  currentRoleCompany: z.string().trim().max(300).optional(),
  currentRoleDescription: z.string().trim().max(PROFILE_TEXT_LIMITS.currentRoleDescription).optional(),
  profileLanguage: z.string().trim().optional(),
  visibleProfileContext: LinkedInVisibleProfileContextSchema.optional(),
  visibleTextSample: z.string().trim().max(PROFILE_TEXT_LIMITS.visibleTextSample).optional()
});

export const UserSettingsSchema = z.object({
  backendApiUrl: z.string().url().default(DEFAULT_USER_SETTINGS.backendApiUrl),
  productOrServiceDescription: z.string().trim().max(2000).default(""),
  targetCustomerProfile: z.string().trim().max(2000).default(""),
  targetIndustries: z.string().trim().max(1000).default(DEFAULT_USER_SETTINGS.targetIndustries),
  targetRoles: z.string().trim().max(1000).default(DEFAULT_USER_SETTINGS.targetRoles),
  targetCompanySize: z.string().trim().max(500).default(DEFAULT_USER_SETTINGS.targetCompanySize),
  targetRegion: z.string().trim().max(500).default(DEFAULT_USER_SETTINGS.targetRegion),
  mainPainPointsSolved: z.string().trim().max(1500).default(DEFAULT_USER_SETTINGS.mainPainPointsSolved),
  excludedRoles: z.string().trim().max(1000).default(DEFAULT_USER_SETTINGS.excludedRoles),
  preferredOutreachTone: z.string().trim().max(500).default(DEFAULT_USER_SETTINGS.preferredOutreachTone),
  sellerContext: SellerContextSchema.default(DEFAULT_SELLER_CONTEXT),
  dmTone: z.enum(DM_TONES).default(DEFAULT_USER_SETTINGS.dmTone),
  defaultHubSpotLifecycleStage: z.string().trim().max(80).default(DEFAULT_USER_SETTINGS.defaultHubSpotLifecycleStage),
  defaultFollowUpDays: z.number().int().min(1).max(60).default(DEFAULT_USER_SETTINGS.defaultFollowUpDays)
});

export const ProfileAnalysisSchema = z
  .object({
    leadScore: z.number().int().min(0).max(100),
    fitLabel: z.enum(["Strong fit", "Possible fit", "Weak fit", "Not enough data"]).default("Not enough data"),
    persona: readableString,
    painPoints: z.array(z.string().trim().min(1)).max(6),
    icebreaker: readableString,
    recommendedAction: z.unknown().optional(),
    actionReason: z.string().trim().default("The visible evidence is not sufficient for a stronger sales decision."),
    actionRisks: z.array(z.string().trim().min(1)).max(3).default([]),
    actionPrerequisites: z.array(z.string().trim().min(1)).max(3).default([]),
    actionExpiration: z.string().trim().default("Re-evaluate after reviewing company context"),
    recommendedNextAction: z.string().trim().default("Review the profile and decide whether to reach out."),
    confidence: ConfidenceSchema,
    decisionConfidence: ConfidenceSchema.optional(),
    dataSufficiency: DataSufficiencySchema.default("insufficient"),
    evidenceCoverage: z.number().int().min(0).max(100).default(0),
    confidenceReason: z.string().trim().default("Visible evidence is limited."),
    limitedContextReasons: z.array(z.string().trim().min(1)).max(8).default([]),
    positiveSignals: z.array(z.string().trim().min(1)).max(8).default([]),
    negativeSignals: z.array(z.string().trim().min(1)).max(8).default([]),
    missingInformation: z.array(z.string().trim().min(1)).max(8).default([]),
    riskWarnings: z.array(z.string().trim().min(1)).max(8).default([]),
    recommendedOutreachAngle: z.string().trim().default("Research first"),
    whyThisAngle: z.string().trim().default("There is not enough visible context to recommend a more specific angle."),
    whatToAvoid: z.array(z.string().trim().min(1)).max(8).default([]),
    outreachStrategy: z.unknown().optional(),
    scoreEvidence: z.array(ScoreEvidenceSchema).max(20).default([]),
    scoringMetadata: ScoringMetadataSchema.default({}),
    decisionBreakdown: DecisionBreakdownSchema.default({}),
    decisionChangeConditions: z.array(DecisionChangeConditionSchema).max(5).default([]),
    nextBestResearchActions: z.array(NextBestResearchActionSchema).max(3).default([]),
    outreachReadiness: OutreachReadinessSchema.default({}),
    outreachCoach: OutreachCoachSchema.default({}),
    dmVariants: z.array(DmVariantSchema).max(3).default([])
  })
  .transform((value) => ({
    ...value,
    recommendedAction: normalizeRecommendedAction(value.recommendedAction, value.leadScore),
    decisionConfidence: value.decisionConfidence ?? value.confidence,
    outreachStrategy: normalizeOutreachStrategy(value.outreachStrategy, value)
  }));

function normalizeOutreachStrategy(
  value: unknown,
  fallback: {
    recommendedOutreachAngle: string;
    whyThisAngle: string;
    painPoints: string[];
    whatToAvoid: string[];
  }
): z.infer<typeof OutreachStrategySchema> {
  const input = typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const text = (field: string, defaultValue: string, maxLength: number) => {
    const raw = input[field];
    if (typeof raw !== "string" || !raw.trim()) {
      return defaultValue;
    }

    return raw.replace(/\s+/g, " ").trim().slice(0, maxLength);
  };

  return {
    whyRelevant: text("whyRelevant", fallback.whyThisAngle || "More visible evidence is needed to confirm relevance.", 700),
    bestAngle: text("bestAngle", fallback.recommendedOutreachAngle || "Research first", 300),
    painHypothesis: text("painHypothesis", fallback.painPoints[0] || "The prospect's current pain is not confirmed.", 700),
    whatToAvoid: text(
      "whatToAvoid",
      fallback.whatToAvoid.join("; ") || "Avoid assumptions that are not supported by visible profile evidence.",
      700
    ),
    suggestedCTA: text("suggestedCTA", "Ask one short, low-pressure question.", 400)
  };
}

export const GeneratedDmSchema = z.object({
  message: readableString.max(1200),
  personalizationScore: z.number().int().min(0).max(100),
  spamRisk: z.enum(["low", "medium", "high"]),
  warnings: z.array(z.string().trim().min(1)).max(6),
  offerContextUsed: z.array(z.string().trim().min(1).max(180)).max(6).default([]),
  factsUsed: z.array(z.string().trim().min(1).max(220)).max(6).default([]),
  inferencesUsed: z.array(z.string().trim().min(1).max(220)).max(6).default([])
});

export const HubSpotSyncResultSchema = z.object({
  contactId: readableString,
  created: z.boolean(),
  updated: z.boolean(),
  noteId: readableString.optional(),
  partialPropertySync: z.boolean().optional(),
  customPropertiesUpdated: z.boolean().optional(),
  skippedProperties: z.array(z.string().trim().min(1)).optional(),
  message: z.string().trim().optional()
});

export const ApiErrorResponseSchema = z.object({
  statusCode: z.number().int().min(400).max(599).optional(),
  code: z.string().trim().optional(),
  error: readableString,
  details: z.array(z.string()).optional()
});

export const LicenseVerifyRequestSchema = z.object({
  licenseKey: readableString.max(200)
});

export const LicenseVerifyResponseSchema = z.object({
  valid: z.boolean(),
  plan: z.enum(["free", "beta_pro", "pro"]),
  status: z.enum(["active", "invalid", "expired", "revoked", "past_due", "canceled", "inactive"]),
  source: z.enum(["stripe", "internal", "tester"]).optional(),
  type: z.enum(["stripe", "internal", "tester"]).optional(),
  email: z.string().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  currentPeriodEnd: z.string().datetime().nullable().optional(),
  message: z.string().trim().optional()
});

export const AnalyzeProfileRequestSchema = z.object({
  profile: LinkedInProfileSchema,
  userSettings: UserSettingsSchema
});

export const GenerateDmRequestSchema = z.object({
  profile: LinkedInProfileSchema,
  analysis: ProfileAnalysisSchema,
  messageType: z.enum(MESSAGE_TYPES),
  userSettings: UserSettingsSchema
});

export const UpsertContactRequestSchema = z.object({
  profile: LinkedInProfileSchema,
  analysis: ProfileAnalysisSchema,
  generatedDm: GeneratedDmSchema.optional(),
  userSettings: UserSettingsSchema.optional()
});

export const CreateNoteRequestSchema = z.object({
  contactId: readableString,
  profile: LinkedInProfileSchema,
  analysis: ProfileAnalysisSchema,
  dmMessage: z.string().trim().optional(),
  userSettings: UserSettingsSchema.optional()
});

export const CreateTaskRequestSchema = z.object({
  contactId: z.string().trim().optional(),
  profile: LinkedInProfileSchema.optional(),
  daysFromNow: z.number().int().min(1).max(365),
  taskTitle: readableString.max(160),
  taskBody: readableString.max(3000)
});
