import { DEFAULT_SELLER_CONTEXT } from "@linkedin-hubspot-ai/shared";
import type { LinkedInProfile, ProfileAnalysis, ScoreEvidence, ScoringMetadata, UserSettings } from "@linkedin-hubspot-ai/shared";

const SENIORITY_TERMS = [
  "chief",
  "ceo",
  "coo",
  "cfo",
  "cto",
  "founder",
  "owner",
  "president",
  "vp",
  "vice president",
  "head",
  "director",
  "leader",
  "manager"
];

const RELEVANT_BUSINESS_TERMS = [
  "sales",
  "revenue",
  "revops",
  "go-to-market",
  "gtm",
  "growth",
  "marketing",
  "customer success",
  "operations",
  "partnership",
  "business development",
  "pipeline",
  "crm",
  "saas"
];

const OPERATIONAL_PAIN_TERMS = [
  "hubspot",
  "crm",
  "revops",
  "revenue operations",
  "sales ops",
  "sales operations",
  "outbound",
  "prospecting",
  "lead generation",
  "lead qualification",
  "pipeline",
  "sales workflow",
  "crm hygiene"
];

const NON_ICP_CONTEXT_TERMS = [
  "philanthropy",
  "philanthropist",
  "foundation",
  "nonprofit",
  "non-profit",
  "charity",
  "government",
  "minister",
  "public policy",
  "university",
  "professor",
  "education",
  "investor",
  "venture capitalist",
  "family office"
];

const STRONG_COMMERCIAL_SIGNAL_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: "HubSpot Consultant", pattern: /\b(?:hubspot\b.{0,80}\bconsultant|consultant\b.{0,80}\bhubspot)\b/i },
  { label: "HubSpot Partner", pattern: /\b(?:hubspot\b.{0,80}\bpartner|diamond partner\b.{0,80}\bhubspot|hubspot\b.{0,80}\bdiamond partner)\b/i },
  { label: "HubSpot CRM", pattern: /\b(?:hubspot\b.{0,40}\bcrm|crm\b.{0,40}\bhubspot)\b/i },
  { label: "RevOps Consultant", pattern: /\b(?:revops\b.{0,80}\bconsultant|consultant\b.{0,80}\brevops)\b/i },
  { label: "CRM Consultant", pattern: /\b(?:crm\b.{0,80}\bconsultant|consultant\b.{0,80}\bcrm)\b/i },
  { label: "CRM Implementation", pattern: /\bcrm\s+(?:implementation|migration|operations?)\b/i },
  { label: "Sales Operations", pattern: /\b(?:sales operations|sales ops)\b/i },
  { label: "Marketing Operations", pattern: /\b(?:marketing operations|marketing ops)\b/i },
  { label: "B2B Sales", pattern: /\bb2b\s+sales\b/i }
];

const UNIVERSAL_LINKEDIN_TERMS = new Set(["linkedin", "profile", "profiles"]);

const POOR_FIT_TERMS = ["student", "intern", "retired", "teacher", "professor", "engineer", "developer"];
const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "your",
  "you",
  "our",
  "that",
  "this",
  "from",
  "into",
  "are",
  "who",
  "teams",
  "team",
  "company",
  "companies",
  "business",
  "solution",
  "platform"
]);

export type LeadScoringContext = {
  heuristicScore: number;
  matchedSignals: string[];
  scoreEvidence: ScoreEvidence[];
  scoringMetadata: ScoringMetadata;
  decisionSignals: LeadDecisionSignals;
  missingSettingsWarning?: string;
};

export type LeadDecisionSignals = {
  roleMatch: boolean;
  industryMatch: boolean;
  companySizeEvidence: boolean;
  operationalPainEvidence: boolean;
  buyerRelevance: boolean;
  sellerContextConnection: boolean;
  strongCommercialContext: boolean;
  reliableCompany: boolean;
  nonIcpContext: boolean;
};

type EvidenceSource = {
  section: ScoreEvidence["sourceSection"];
  text: string;
};

function normalize(value: string | undefined): string {
  return (value ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

function profileText(profile: LinkedInProfile): string {
  return stripUniversalLinkedInContext(
    [
      profile.fullName,
      profile.headline,
      profile.companyName,
      profile.jobTitle,
      profile.location,
      profile.about,
      profile.currentRoleTitle,
      profile.currentRoleCompany,
      profile.currentRoleDescription,
      profile.visibleProfileContext?.rawVisibleContext,
      profile.visibleTextSample
    ]
      .filter(Boolean)
      .join(" ")
  );
}

function sellerContextText(userSettings: UserSettings): string {
  const sellerContext = userSettings.sellerContext ?? DEFAULT_SELLER_CONTEXT;

  return normalize(
    [
      userSettings.productOrServiceDescription,
      sellerContext.productOrServiceName,
      sellerContext.productOrServiceDescription,
      sellerContext.targetOutcome,
      sellerContext.mainDifferentiators,
      sellerContext.proofPoints,
      sellerContext.claimsAllowed,
      sellerContext.brandVoice
    ]
      .filter(Boolean)
      .join(" ")
  );
}

function profileEvidenceSources(profile: LinkedInProfile): EvidenceSource[] {
  const sources: EvidenceSource[] = [
    { section: "headline", text: [profile.headline, profile.jobTitle, profile.currentRoleTitle].filter(Boolean).join(" ") },
    { section: "profile", text: profile.companyName ?? "" },
    { section: "about", text: profile.about ?? "" },
    { section: "experience", text: profile.currentRoleDescription ?? "" },
    { section: "profile", text: profile.visibleTextSample ?? "" },
    { section: "profile", text: profile.visibleProfileContext?.rawVisibleContext ?? "" }
  ];

  return sources
    .map((source) => ({ ...source, text: sanitizeEvidenceText(source.text) }))
    .filter((source) => source.text.trim().length > 0);
}

function keywords(value: string): string[] {
  return [
    ...new Set(
      normalize(value)
        .split(/[^a-z0-9]+/)
        .filter((token) => token.length >= 4 && !STOP_WORDS.has(token) && !UNIVERSAL_LINKEDIN_TERMS.has(token))
    )
  ].slice(0, 16);
}

function countMatches(text: string, terms: string[]): number {
  return terms.filter((term) => containsTerm(text, term)).length;
}

function scoreKeywordMatches(text: string, keywordText: string, maxScore: number): { score: number; matches: string[] } {
  const matches = keywords(keywordText).filter((keyword) => containsTerm(text, keyword));
  return {
    score: Math.min(maxScore, matches.length * 6),
    matches
  };
}

function stripUniversalLinkedInContext(value: string): string {
  return normalize(value)
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\blinkedin(?:\s+url|\s+profile)?\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function containsTerm(text: string, term: string): boolean {
  const normalizedTerm = normalize(term);
  if (!normalizedTerm || UNIVERSAL_LINKEDIN_TERMS.has(normalizedTerm)) {
    return false;
  }

  const escaped = normalizedTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`, "i").test(text);
}

function settingPhrases(value: string): string[] {
  return [...new Set(value.split(/[,;|\n]+/).map(normalize).filter(Boolean))];
}

function rolePhraseMatches(roleText: string, configuredRoles: string): string[] {
  return settingPhrases(configuredRoles).filter((role) => {
    if (role === "lead") {
      return /\b(?:growth|sales|marketing|revenue|revops|operations|customer success|product)\s+lead\b/i.test(roleText);
    }

    if (containsTerm(roleText, role)) {
      return true;
    }

    const meaningfulTerms = keywords(role);
    return meaningfulTerms.length >= 2 && meaningfulTerms.every((term) => containsTerm(roleText, term));
  });
}

function phraseMatches(text: string, configuredTerms: string): string[] {
  return settingPhrases(configuredTerms).filter((term) => containsTerm(text, term));
}

function operationalPainMatches(text: string, configuredPainPoints: string): string[] {
  const configured = normalize(configuredPainPoints);
  return OPERATIONAL_PAIN_TERMS.filter((term) => {
    const painIsConfigured = containsTerm(configured, term) ||
      (term === "outbound" && containsTerm(configured, "prospecting")) ||
      (term === "lead generation" && containsTerm(configured, "prospecting"));
    return painIsConfigured && containsTerm(text, term);
  });
}

function hasCompanySizeEvidence(text: string): boolean {
  return /\b(?:company size|team size|headcount)\b|\b\d{1,6}\s*(?:-|to)\s*\d{1,6}\s+(?:employees|people|staff|team members)\b|\b\d{1,6}\+?\s+(?:employees|staff|team members)\b/i.test(
    text
  );
}

function findStrongCommercialMatches(text: string): string[] {
  return STRONG_COMMERCIAL_SIGNAL_PATTERNS.filter((signal) => signal.pattern.test(text)).map((signal) => signal.label);
}

function hasReliableCompany(profile: LinkedInProfile): boolean {
  if (!profile.companyName) {
    return false;
  }

  const source = normalize(profile.extractionSources?.companyName ?? profile.visibleProfileContext?.extractionSources?.companyName);
  if (profile.contextConfidence === "low" || /global|generic|visible sample|related|suggest/i.test(source)) {
    return false;
  }

  if (!source) {
    return Boolean(profile.currentRoleCompany && normalize(profile.currentRoleCompany) === normalize(profile.companyName));
  }

  return /current company|profile-top-card|experience|headline inference|right-panel/.test(source);
}

function createEvidence(input: Omit<ScoreEvidence, "id">): ScoreEvidence {
  const evidenceText = input.evidenceText ? sanitizeEvidenceText(input.evidenceText) : "";
  return {
    id: `ev-${input.signalType}-${input.category}-${Math.abs(hashText(`${input.summary}-${evidenceText}`))}`,
    ...input,
    summary: truncateNatural(input.summary, 240),
    evidenceText: evidenceText ? truncateNatural(evidenceText, 220) : null
  };
}

function evidenceForMatches(input: {
  sources: EvidenceSource[];
  matches: string[];
  signalType?: ScoreEvidence["signalType"];
  basis?: ScoreEvidence["basis"];
  category: ScoreEvidence["category"];
  summary: string;
  scoreImpact: number;
  confidence?: ScoreEvidence["confidence"];
}): ScoreEvidence | null {
  const match = input.matches.find(Boolean);
  const source = match ? findSourceForTerm(input.sources, match) : input.sources[0];
  if (!source) {
    return null;
  }

  return createEvidence({
    signalType: input.signalType ?? "positive",
    basis: input.basis ?? "fact",
    category: input.category,
    summary: input.summary,
    evidenceText: excerptAroundTerm(source.text, match),
    sourceSection: source.section,
    confidence: input.confidence ?? "High",
    scoreImpact: input.scoreImpact
  });
}

function missingEvidence(category: ScoreEvidence["category"], summary: string): ScoreEvidence {
  return createEvidence({
    signalType: "missing",
    basis: "fact",
    category,
    summary,
    evidenceText: null,
    sourceSection: "not_available",
    confidence: "High",
    scoreImpact: -6
  });
}

function buildScoringMetadata(
  scoreEvidence: ScoreEvidence[],
  finalScore: number,
  fitLabel: ProfileAnalysis["fitLabel"],
  confidence: ProfileAnalysis["confidence"]
): ScoringMetadata {
  const factsUsedCount = scoreEvidence.filter((item) => item.basis === "fact" && item.signalType !== "missing").length;
  const inferencesUsedCount = scoreEvidence.filter((item) => item.basis === "inference").length;
  const missingCriteriaCount = scoreEvidence.filter((item) => item.signalType === "missing").length;
  const disqualifierCount = scoreEvidence.filter((item) => item.signalType === "disqualifier").length;
  const analysisDepth = factsUsedCount + inferencesUsedCount >= 5 ? "deep" : factsUsedCount + inferencesUsedCount >= 2 ? "standard" : "limited";

  return {
    scoringVersion: "0.4.0",
    finalScore,
    fitLabel,
    confidence,
    factsUsedCount,
    inferencesUsedCount,
    missingCriteriaCount,
    disqualifierCount,
    analysisDepth
  };
}

export function buildLeadScoringContext(
  profile: LinkedInProfile,
  userSettings: UserSettings
): LeadScoringContext {
  const text = profileText(profile);
  const roleText = stripUniversalLinkedInContext(
    [profile.headline, profile.jobTitle, profile.currentRoleTitle].filter(Boolean).join(" ")
  );
  const sources = profileEvidenceSources(profile);
  const scoreEvidence: ScoreEvidence[] = [];
  const matchedSignals: string[] = [];
  const settingsAreComplete = Boolean(
    userSettings.productOrServiceDescription.trim() &&
      userSettings.targetCustomerProfile.trim() &&
      userSettings.targetRoles.trim()
  );

  let score = 5;
  const seniorityMatches = countMatches(roleText, SENIORITY_TERMS);
  const relevantMatches = countMatches(text, RELEVANT_BUSINESS_TERMS);
  const poorFitMatches = countMatches(text, POOR_FIT_TERMS);
  const targetMatches = userSettings.targetRoles.trim() || userSettings.targetIndustries.trim()
    ? { score: 0, matches: [] as string[] }
    : scoreKeywordMatches(text, userSettings.targetCustomerProfile, 8);
  const productMatches = scoreKeywordMatches(text, `${userSettings.productOrServiceDescription} ${sellerContextText(userSettings)}`, 8);
  const industryMatches = phraseMatches(text, userSettings.targetIndustries);
  const roleMatches = rolePhraseMatches(roleText, userSettings.targetRoles);
  const painPointMatches = operationalPainMatches(text, userSettings.mainPainPointsSolved);
  const strongCommercialMatches = findStrongCommercialMatches(text);
  const excludedMatches = scoreKeywordMatches(text, userSettings.excludedRoles, 24);
  const companySizeEvidence = hasCompanySizeEvidence(text);
  const reliableCompany = hasReliableCompany(profile);
  const operationalContextCount = countMatches(text, OPERATIONAL_PAIN_TERMS);
  const nonIcpContext = countMatches(text, NON_ICP_CONTEXT_TERMS) > 0 && operationalContextCount < 2;

  if (profile.jobTitle || profile.headline) {
    score += 4;
  }

  if (reliableCompany) {
    score += 4;
  }

  if (seniorityMatches > 0) {
    const impact = Math.min(6, seniorityMatches * 3);
    score += impact;
    matchedSignals.push("seniority");
    const seniorityEvidence = evidenceForMatches({
      sources,
      matches: SENIORITY_TERMS.filter((term) => containsTerm(roleText, term)),
      basis: "inference",
      category: "role",
      summary: "May have seniority or influence based on visible title language.",
      scoreImpact: impact,
      confidence: "Medium"
    });
    if (seniorityEvidence) {
      scoreEvidence.push(seniorityEvidence);
    }
  }

  if (relevantMatches > 0) {
    const impact = Math.min(14, relevantMatches * 4);
    score += impact;
    matchedSignals.push("business relevance");
    const relevanceEvidence = evidenceForMatches({
      sources,
      matches: RELEVANT_BUSINESS_TERMS.filter((term) => containsTerm(text, term)),
      category: "experience",
      summary: "Visible profile text includes revenue, sales, operations, or CRM relevance.",
      scoreImpact: impact
    });
    if (relevanceEvidence) {
      scoreEvidence.push(relevanceEvidence);
    }
  }

  if (strongCommercialMatches.length > 0) {
    const impact = Math.min(30, 12 + (strongCommercialMatches.length - 1) * 6);
    score += impact;
    matchedSignals.push(...strongCommercialMatches.map((match) => `Strong match: ${match}`));
    const evidence = evidenceForMatches({
      sources,
      matches: strongCommercialMatches,
      category: "experience",
      summary: `Strong commercial context is visible: ${strongCommercialMatches.join(", ")}`,
      scoreImpact: impact,
      confidence: "High"
    });
    if (evidence) {
      scoreEvidence.push(evidence);
    }
  }

  if (targetMatches.score > 0) {
    score += targetMatches.score;
    matchedSignals.push(`target match: ${targetMatches.matches.join(", ")}`);
    const evidence = evidenceForMatches({
      sources,
      matches: targetMatches.matches,
      category: "other",
      summary: `Matches saved target customer terms: ${targetMatches.matches.join(", ")}`,
      scoreImpact: targetMatches.score
    });
    if (evidence) {
      scoreEvidence.push(evidence);
    }
  }

  if (productMatches.score > 0) {
    score += productMatches.score;
    matchedSignals.push(`product match: ${productMatches.matches.join(", ")}`);
    const evidence = evidenceForMatches({
      sources,
      matches: productMatches.matches,
      category: "other",
      summary: `Matches seller offer context: ${productMatches.matches.join(", ")}`,
      scoreImpact: productMatches.score
    });
    if (evidence) {
      scoreEvidence.push(evidence);
    }
  }

  if (industryMatches.length > 0) {
    const impact = Math.min(18, industryMatches.length * 9);
    score += impact;
    matchedSignals.push(`industry match: ${industryMatches.join(", ")}`);
    const evidence = evidenceForMatches({
      sources,
      matches: industryMatches,
      category: "industry",
      summary: `Matches target industry terms: ${industryMatches.join(", ")}`,
      scoreImpact: impact
    });
    if (evidence) {
      scoreEvidence.push(evidence);
    }
  }

  if (roleMatches.length > 0) {
    const impact = Math.min(18, roleMatches.length * 10);
    score += impact;
    matchedSignals.push(`role match: ${roleMatches.join(", ")}`);
    const evidence = evidenceForMatches({
      sources,
      matches: roleMatches,
      category: "role",
      summary: `Matches target role terms: ${roleMatches.join(", ")}`,
      scoreImpact: impact
    });
    if (evidence) {
      scoreEvidence.push(evidence);
    }
  }

  if (painPointMatches.length > 0) {
    const impact = Math.min(18, painPointMatches.length * 9);
    score += impact;
    matchedSignals.push(`operational pain match: ${painPointMatches.join(", ")}`);
    const evidence = evidenceForMatches({
      sources,
      matches: painPointMatches,
      category: "pain_point",
      summary: `Visible operational context matches saved pain areas: ${painPointMatches.join(", ")}`,
      scoreImpact: impact
    });
    if (evidence) {
      scoreEvidence.push(evidence);
    }
  }

  if (companySizeEvidence) {
    score += 12;
    matchedSignals.push("company size evidence");
    const evidence = evidenceForMatches({
      sources,
      matches: ["employees", "company size", "team size", "headcount"],
      category: "company_size",
      summary: "Visible company-size evidence is available.",
      scoreImpact: 12
    });
    if (evidence) {
      scoreEvidence.push(evidence);
    }
  }

  if (!settingsAreComplete && relevantMatches > 0) {
    score += 6;
    matchedSignals.push("generic B2B SaaS fallback");
  }

  if (poorFitMatches > 0 && relevantMatches === 0 && targetMatches.score === 0) {
    score -= 25;
    matchedSignals.push("weak-fit role signal");
    const evidence = evidenceForMatches({
      sources,
      matches: POOR_FIT_TERMS.filter((term) => containsTerm(text, term)),
      signalType: "disqualifier",
      category: "exclusion",
      summary: "Visible profile text contains a weak-fit role signal.",
      scoreImpact: -25,
      confidence: "High"
    });
    if (evidence) {
      scoreEvidence.push(evidence);
    }
  }

  if (excludedMatches.score > 0 && targetMatches.score === 0 && roleMatches.length === 0) {
    score -= Math.min(30, excludedMatches.score);
    matchedSignals.push(`excluded role signal: ${excludedMatches.matches.join(", ")}`);
    const evidence = evidenceForMatches({
      sources,
      matches: excludedMatches.matches,
      signalType: "disqualifier",
      category: "exclusion",
      summary: `Matches excluded role terms: ${excludedMatches.matches.join(", ")}`,
      scoreImpact: -Math.min(30, excludedMatches.score),
      confidence: "High"
    });
    if (evidence) {
      scoreEvidence.push(evidence);
    }
  }

  if (nonIcpContext) {
    score -= 18;
    matchedSignals.push("non-ICP public, nonprofit, education, investor, or government context");
    const evidence = evidenceForMatches({
      sources,
      matches: NON_ICP_CONTEXT_TERMS.filter((term) => containsTerm(text, term)),
      signalType: "disqualifier",
      category: "industry",
      summary: "Visible context appears outside the saved commercial ICP without clear sales-operations relevance.",
      scoreImpact: -18,
      confidence: "High"
    });
    if (evidence) {
      scoreEvidence.push(evidence);
    }
  }

  if (roleMatches.length === 0 && seniorityMatches === 0) {
    scoreEvidence.push(missingEvidence("role", "Target role or seniority is not clearly visible."));
  }

  if (!reliableCompany) {
    scoreEvidence.push(missingEvidence("company", "Current company is missing or was extracted with low confidence."));
  }

  if (!companySizeEvidence) {
    scoreEvidence.push(missingEvidence("company_size", "No visible company-size evidence was found."));
  }

  if (industryMatches.length === 0) {
    scoreEvidence.push(missingEvidence("industry", "Target-industry evidence is not clearly visible."));
  }

  if (painPointMatches.length === 0) {
    scoreEvidence.push(missingEvidence("pain_point", "No explicit CRM, RevOps, outbound, or sales-workflow pain evidence was found."));
  }

  const decisionSignals: LeadDecisionSignals = {
    roleMatch: roleMatches.length > 0 || strongCommercialMatches.some((match) => match.includes("Consultant")),
    industryMatch: industryMatches.length > 0,
    companySizeEvidence,
    operationalPainEvidence: painPointMatches.length > 0,
    buyerRelevance: relevantMatches > 0 || strongCommercialMatches.length > 0,
    sellerContextConnection: productMatches.score > 0 || strongCommercialMatches.length > 0,
    strongCommercialContext: strongCommercialMatches.length >= 2,
    reliableCompany,
    nonIcpContext
  };
  const independentSignalCount = countDecisionSignals(decisionSignals);
  const roleWithoutSupportingEvidence = decisionSignals.roleMatch &&
    !decisionSignals.industryMatch &&
    !decisionSignals.companySizeEvidence &&
    !decisionSignals.operationalPainEvidence &&
    !decisionSignals.sellerContextConnection &&
    !decisionSignals.strongCommercialContext;

  let finalHeuristicScore = Math.max(0, Math.min(100, Math.round(score)));
  if (roleWithoutSupportingEvidence) {
    finalHeuristicScore = Math.min(finalHeuristicScore, 54);
  }
  if (nonIcpContext) {
    finalHeuristicScore = Math.min(finalHeuristicScore, 39);
  }
  if (decisionSignals.strongCommercialContext && !nonIcpContext) {
    finalHeuristicScore = Math.max(finalHeuristicScore, 72);
  }

  const heuristicConfidence: ProfileAnalysis["confidence"] = companySizeEvidence && independentSignalCount >= 4
    ? "high"
    : independentSignalCount >= 2
      ? "medium"
      : "low";
  const heuristicFitLabel = fitLabelForScore(finalHeuristicScore, heuristicConfidence);
  const dedupedEvidence = dedupeEvidence(scoreEvidence).slice(0, 20);

  return {
    heuristicScore: finalHeuristicScore,
    matchedSignals,
    scoreEvidence: dedupedEvidence,
    scoringMetadata: buildScoringMetadata(dedupedEvidence, finalHeuristicScore, heuristicFitLabel, heuristicConfidence),
    decisionSignals,
    missingSettingsWarning: settingsAreComplete
      ? undefined
      : "Product or target customer settings are missing, so scoring uses a generic B2B SaaS relevance fallback."
  };
}

export function fitLabelForScore(score: number, confidence: ProfileAnalysis["confidence"]): ProfileAnalysis["fitLabel"] {
  if (confidence === "low" && score <= 20) {
    return "Not enough data";
  }

  if (score >= 80 && confidence !== "low") {
    return "Strong fit";
  }

  if (score >= 40) {
    return "Possible fit";
  }

  return "Weak fit";
}

export function normalizeProfileAnalysisScore(
  analysis: ProfileAnalysis,
  profile: LinkedInProfile,
  userSettings: UserSettings
): ProfileAnalysis {
  const context = buildLeadScoringContext(profile, userSettings);
  const independentSignalCount = countDecisionSignals(context.decisionSignals);

  if (analysis.confidence === "low" && independentSignalCount === 0) {
    const lowConfidenceEvidence = dedupeEvidence([
      ...context.scoreEvidence,
      ...(analysis.scoreEvidence ?? []).filter((item) => item.basis === "inference")
    ]).slice(0, 20);
    return {
      ...analysis,
      leadScore: 0,
      fitLabel: "Not enough data",
      confidence: "low",
      scoreEvidence: lowConfidenceEvidence,
      scoringMetadata: buildScoringMetadata(lowConfidenceEvidence, 0, "Not enough data", "low"),
      positiveSignals: (analysis.positiveSignals ?? []).length ? analysis.positiveSignals : context.matchedSignals,
      missingInformation: (analysis.missingInformation ?? []).length
        ? analysis.missingInformation
        : ["More visible profile context is needed for confident scoring."],
      recommendedAction: "Research more",
      actionReason: buildActionReason("Research more", context.decisionSignals),
      recommendedNextAction: recommendedNextStep("Research more"),
      recommendedOutreachAngle: analysis.recommendedOutreachAngle || "Research first"
    };
  }

  const aiWeight = analysis.confidence === "high" ? 0.55 : analysis.confidence === "medium" ? 0.45 : 0.3;
  const heuristicWeight = 1 - aiWeight;
  const blendedScore = Math.round(analysis.leadScore * aiWeight + context.heuristicScore * heuristicWeight);
  const lacksCoreSupport = !context.decisionSignals.industryMatch &&
    !context.decisionSignals.companySizeEvidence &&
    !context.decisionSignals.operationalPainEvidence;
  const strongFitEligible = independentSignalCount >= 3 &&
    context.decisionSignals.buyerRelevance &&
    (context.decisionSignals.industryMatch || context.decisionSignals.operationalPainEvidence) &&
    !context.decisionSignals.nonIcpContext;
  let finalScore = Math.max(0, Math.min(100, blendedScore));

  if (lacksCoreSupport && !context.decisionSignals.strongCommercialContext) {
    finalScore = Math.min(finalScore, 54);
  }
  if (!strongFitEligible) {
    finalScore = Math.min(finalScore, 79);
  }
  if (context.decisionSignals.nonIcpContext) {
    finalScore = Math.min(finalScore, 39);
  }
  if (context.decisionSignals.strongCommercialContext && !context.decisionSignals.nonIcpContext) {
    finalScore = Math.max(finalScore, 60);
  }

  const finalConfidence = adjustedConfidence(analysis.confidence, context.decisionSignals, independentSignalCount);
  const finalFitLabel = fitLabelForScore(finalScore, finalConfidence);
  const scoreEvidence = dedupeEvidence([
    ...context.scoreEvidence,
    ...(analysis.scoreEvidence ?? []).filter((item) => item.basis === "inference")
  ]).slice(0, 20);
  const recommendedAction = recommendedActionForDecision(finalScore, finalConfidence, context.decisionSignals, independentSignalCount);

  return {
    ...analysis,
    leadScore: finalScore,
    fitLabel: finalFitLabel,
    confidence: finalConfidence,
    scoreEvidence,
    scoringMetadata: buildScoringMetadata(scoreEvidence, finalScore, finalFitLabel, finalConfidence),
    positiveSignals: dedupeStrings([...context.matchedSignals, ...(analysis.positiveSignals ?? [])]).slice(0, 8),
    recommendedAction,
    actionReason: buildActionReason(recommendedAction, context.decisionSignals),
    recommendedNextAction: recommendedNextStep(recommendedAction)
  };
}

function countDecisionSignals(signals: LeadDecisionSignals): number {
  return [
    signals.roleMatch,
    signals.industryMatch,
    signals.companySizeEvidence,
    signals.operationalPainEvidence,
    signals.buyerRelevance,
    signals.sellerContextConnection,
    signals.strongCommercialContext
  ].filter(Boolean).length;
}

function adjustedConfidence(
  modelConfidence: ProfileAnalysis["confidence"],
  signals: LeadDecisionSignals,
  independentSignalCount: number
): ProfileAnalysis["confidence"] {
  if (independentSignalCount <= 1 || (!signals.reliableCompany && !signals.industryMatch && !signals.strongCommercialContext)) {
    return "low";
  }

  if (!signals.companySizeEvidence || modelConfidence !== "high") {
    return "medium";
  }

  return "high";
}

function recommendedActionForDecision(
  score: number,
  confidence: ProfileAnalysis["confidence"],
  signals: LeadDecisionSignals,
  independentSignalCount: number
): ProfileAnalysis["recommendedAction"] {
  if (
    score >= 80 &&
    confidence !== "low" &&
    independentSignalCount >= 3 &&
    signals.buyerRelevance &&
    (signals.industryMatch || signals.operationalPainEvidence) &&
    !signals.nonIcpContext
  ) {
    return "Pursue now";
  }

  if (score >= 55 && !signals.nonIcpContext) {
    return "Research more";
  }

  if (score >= 35) {
    return "Low priority";
  }

  return "Do not contact yet";
}

function buildActionReason(action: ProfileAnalysis["recommendedAction"], signals: LeadDecisionSignals): string {
  const missing = [
    !signals.companySizeEvidence ? "company size" : undefined,
    !signals.industryMatch ? "target-industry fit" : undefined,
    !signals.operationalPainEvidence ? "CRM or sales-workflow pain" : undefined,
    !signals.buyerRelevance ? "buyer relevance" : undefined,
    !signals.sellerContextConnection ? "a clear connection to the offer" : undefined
  ].filter((item): item is string => Boolean(item));

  if (action === "Pursue now") {
    if (signals.strongCommercialContext) {
      return "Strong HubSpot, RevOps, or CRM consulting context and multiple commercial-fit signals are visible.";
    }
    return "Multiple independent ICP signals are visible, including role, commercial relevance, and a clear connection to the saved Seller Context.";
  }

  if (action === "Research more") {
    if (signals.strongCommercialContext) {
      return "Strong HubSpot / RevOps / CRM consultant context is visible, but company size or exact buying intent is not fully confirmed, so research more before outreach.";
    }
    const lead = signals.roleMatch ? "Potential target-role relevance is visible" : "Some commercial relevance may be visible";
    return `${lead}, but ${joinReadableList(missing)} ${missing.length === 1 ? "is" : "are"} not visible or confirmed.`;
  }

  if (action === "Low priority") {
    const risk = signals.nonIcpContext
      ? "The profile appears outside the saved commercial ICP"
      : "The profile has limited support across the saved ICP criteria";
    return `${risk}; ${joinReadableList(missing)} ${missing.length === 1 ? "is" : "are"} missing or weak.`;
  }

  return "The visible profile does not provide enough role, industry, buyer, or operational-pain evidence to justify outreach now.";
}

function recommendedNextStep(action: ProfileAnalysis["recommendedAction"]): string {
  if (action === "Pursue now") {
    return "Review the personalized draft and decide whether to send a concise manual outreach message.";
  }

  if (action === "Research more") {
    return "Confirm company size, industry, CRM ownership, and current sales-workflow pain before outreach.";
  }

  if (action === "Low priority") {
    return "Deprioritize this lead unless new ICP or operational-pain evidence becomes visible.";
  }

  return "Do not contact this lead based on the current visible evidence.";
}

function joinReadableList(items: string[]): string {
  if (!items.length) {
    return "important buying context";
  }

  if (items.length === 1) {
    return items[0] ?? "important buying context";
  }

  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1] ?? "important buying context"}`;
}

function dedupeStrings(items: string[]): string[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = normalize(item);
    if (!key || seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function findSourceForTerm(sources: EvidenceSource[], term: string): EvidenceSource | undefined {
  return sources.find((source) => normalize(source.text).includes(term));
}

function excerptAroundTerm(text: string, term: string | undefined): string {
  const cleaned = sanitizeEvidenceText(text);
  if (!term) {
    return truncateNatural(cleaned, 220);
  }

  const lower = cleaned.toLowerCase();
  const index = lower.indexOf(term.toLowerCase());
  if (index < 0) {
    return truncateNatural(cleaned, 220);
  }

  const desiredStart = Math.max(0, index - 70);
  const priorSentence = cleaned.lastIndexOf(". ", index);
  const priorSpace = cleaned.lastIndexOf(" ", desiredStart);
  const start = priorSentence >= desiredStart ? priorSentence + 2 : Math.max(0, priorSpace);
  const end = Math.min(cleaned.length, index + term.length + 180);
  return truncateNatural(cleaned.slice(start, end).trim(), 220);
}

function sanitizeEvidenceText(value: string): string {
  return value
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/\bLinkedIn(?: URL| profile)?\s*:?/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function truncateNatural(value: string, maxLength: number): string {
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (cleaned.length <= maxLength) {
    return cleaned;
  }

  const availableLength = Math.max(1, maxLength - 4);
  const shortened = cleaned.slice(0, availableLength + 1);
  const sentenceEnd = Math.max(shortened.lastIndexOf(". "), shortened.lastIndexOf("! "), shortened.lastIndexOf("? "));
  if (sentenceEnd >= Math.floor(availableLength * 0.55)) {
    return `${shortened.slice(0, sentenceEnd + 1).trim()} ...`;
  }

  const wordEnd = shortened.lastIndexOf(" ", availableLength);
  const end = wordEnd >= Math.floor(availableLength * 0.55) ? wordEnd : availableLength;
  return `${shortened.slice(0, end).trimEnd()} ...`;
}

function hashText(value: string): number {
  return Array.from(value).reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) | 0, 7);
}

function dedupeEvidence(items: ScoreEvidence[]): ScoreEvidence[] {
  const seenSummaries = new Set<string>();
  const seenEvidenceText = new Set<string>();
  const result: ScoreEvidence[] = [];

  for (const item of items) {
    const summaryKey = normalizeEvidenceKey(item.summary);
    if (seenSummaries.has(summaryKey)) {
      continue;
    }
    seenSummaries.add(summaryKey);

    const evidenceKey = normalizeEvidenceKey(item.evidenceText ?? "");
    const evidenceText = evidenceKey && seenEvidenceText.has(evidenceKey) ? null : item.evidenceText;
    if (evidenceKey) {
      seenEvidenceText.add(evidenceKey);
    }

    result.push({ ...item, evidenceText });
  }

  return result;
}

function normalizeEvidenceKey(value: string): string {
  return sanitizeEvidenceText(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
