import { DEFAULT_SELLER_CONTEXT, ProfileAnalysisSchema } from "@linkedin-hubspot-ai/shared";
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
  hasProfileDepth: boolean;
  limitedProfileContext: boolean;
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
    scoringVersion: "0.5.0",
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
  const detailedProfileText = stripUniversalLinkedInContext(
    [
      profile.about,
      profile.currentRoleDescription,
      profile.visibleProfileContext?.about?.text,
      ...(profile.visibleProfileContext?.experience?.visibleItems ?? [])
    ]
      .filter(Boolean)
      .join(" ")
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
  const productMatches = scoreKeywordMatches(text, `${userSettings.productOrServiceDescription} ${sellerContextText(userSettings)}`, 4);
  const industryMatches = phraseMatches(text, userSettings.targetIndustries);
  const roleMatches = rolePhraseMatches(roleText, userSettings.targetRoles);
  const painPointMatches = operationalPainMatches(detailedProfileText, userSettings.mainPainPointsSolved);
  const strongCommercialMatches = findStrongCommercialMatches(text);
  const excludedMatches = scoreKeywordMatches(text, userSettings.excludedRoles, 24);
  const companySizeEvidence = hasCompanySizeEvidence(text);
  const reliableCompany = hasReliableCompany(profile);
  const hasAbout = Boolean(profile.about?.trim() || profile.visibleProfileContext?.about?.text?.trim());
  const hasExperienceContext = Boolean(
    profile.currentRoleDescription?.trim() || (profile.visibleProfileContext?.experience?.visibleItems ?? []).length > 0
  );
  const hasProfileDepth = Boolean(detailedProfileText);
  const staleLimitedWarning = (profile.extractionWarnings ?? []).some((warning) => /limited profile context/i.test(warning));
  const limitedProfileContext = !hasProfileDepth ||
    profile.contextConfidence === "low" ||
    (!hasAbout && !hasExperienceContext && (profile.contextConfidence === "medium" || staleLimitedWarning));
  const operationalContextCount = countMatches(text, OPERATIONAL_PAIN_TERMS);
  const nonIcpContext = countMatches(text, NON_ICP_CONTEXT_TERMS) > 0 && operationalContextCount < 2;

  if (profile.jobTitle || profile.headline) {
    score += 4;
  }

  if (reliableCompany) {
    score += 4;
    scoreEvidence.push(
      createEvidence({
        signalType: "positive",
        basis: "fact",
        category: "company",
        summary: "Current company is visible on the profile.",
        evidenceText: profile.companyName ?? null,
        sourceSection: "profile",
        confidence: "High",
        scoreImpact: 4
      })
    );
  }

  if (seniorityMatches > 0) {
    const impact = Math.min(6, seniorityMatches * 3);
    score += impact;
    matchedSignals.push("General seniority signal");
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
    const impact = strongCommercialMatches.length >= 3 ? 22 : 18;
    score += impact;
    matchedSignals.push("Strong HubSpot / CRM / RevOps consultant context");
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
    if (strongCommercialMatches.length === 0) {
      matchedSignals.push(`product match: ${productMatches.matches.join(", ")}`);
    }
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
    if (strongCommercialMatches.length === 0) {
      matchedSignals.push(`industry match: ${industryMatches.join(", ")}`);
    }
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
    if (strongCommercialMatches.length === 0) {
      matchedSignals.push(`role match: ${roleMatches.join(", ")}`);
    }
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
    hasProfileDepth,
    limitedProfileContext,
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
  if (limitedProfileContext) {
    finalHeuristicScore = Math.min(finalHeuristicScore, 82);
  }
  if (!companySizeEvidence && decisionSignals.strongCommercialContext) {
    finalHeuristicScore = Math.min(finalHeuristicScore, 82);
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
    const fullLowConfidenceEvidence = dedupeEvidence([
      ...context.scoreEvidence,
      ...(analysis.scoreEvidence ?? []).filter((item) => item.basis === "inference")
    ]).slice(0, 20);
    const lowConfidenceEvidence = limitScoreEvidence(fullLowConfidenceEvidence);
    return {
      ...analysis,
      leadScore: 0,
      fitLabel: "Not enough data",
      confidence: "low",
      ...buildDecisionIntelligence({
        context,
        profile,
        scoreEvidence: fullLowConfidenceEvidence,
        finalScore: 0,
        finalConfidence: "low",
        recommendedAction: "Research more"
      }),
      scoreEvidence: lowConfidenceEvidence,
      scoringMetadata: buildScoringMetadata(lowConfidenceEvidence, 0, "Not enough data", "low"),
      positiveSignals: buildPositiveSignals(context, analysis.positiveSignals ?? []),
      negativeSignals: buildNegativeSignals(context, analysis.negativeSignals ?? []),
      riskWarnings: buildNegativeSignals(context, analysis.riskWarnings ?? []),
      missingInformation: (analysis.missingInformation ?? []).length
        ? analysis.missingInformation.slice(0, 4)
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
  const finalConfidence = adjustedConfidence(analysis.confidence, context.decisionSignals, independentSignalCount);
  const ninetyPlusEligible = context.decisionSignals.roleMatch &&
    context.decisionSignals.industryMatch &&
    context.decisionSignals.buyerRelevance &&
    context.decisionSignals.operationalPainEvidence &&
    context.decisionSignals.reliableCompany &&
    context.decisionSignals.companySizeEvidence &&
    context.decisionSignals.hasProfileDepth &&
    (finalConfidence === "high" || (finalConfidence === "medium" && independentSignalCount >= 7));
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
  if (!ninetyPlusEligible) {
    finalScore = Math.min(finalScore, 89);
  }
  finalScore = Math.min(finalScore, 95);
  if (context.decisionSignals.limitedProfileContext) {
    finalScore = Math.min(finalScore, 82);
  }
  if (!context.decisionSignals.companySizeEvidence && context.decisionSignals.strongCommercialContext) {
    finalScore = Math.min(finalScore, 82);
  }
  if (finalConfidence === "low") {
    finalScore = Math.min(finalScore, 54);
  }
  if (
    context.decisionSignals.strongCommercialContext &&
    !context.decisionSignals.nonIcpContext &&
    finalConfidence !== "low"
  ) {
    finalScore = Math.max(finalScore, 65);
  }

  const finalFitLabel = fitLabelForScore(finalScore, finalConfidence);
  const fullScoreEvidence = dedupeEvidence([
    ...context.scoreEvidence,
    ...(analysis.scoreEvidence ?? []).filter((item) => item.basis === "inference")
  ]).slice(0, 20);
  const scoreEvidence = limitScoreEvidence(fullScoreEvidence);
  const recommendedAction = recommendedActionForDecision(finalScore, finalConfidence, context.decisionSignals, independentSignalCount);
  let decisionIntelligence = buildDecisionIntelligence({
    context,
    profile,
    scoreEvidence: fullScoreEvidence,
    finalScore,
    finalConfidence,
    recommendedAction
  });
  const alignedRecommendedAction = alignRecommendedActionWithReadiness(recommendedAction, decisionIntelligence.outreachReadiness, context.decisionSignals);
  if (alignedRecommendedAction !== recommendedAction) {
    decisionIntelligence = buildDecisionIntelligence({
      context,
      profile,
      scoreEvidence: fullScoreEvidence,
      finalScore,
      finalConfidence,
      recommendedAction: alignedRecommendedAction
    });
  }

  return {
    ...analysis,
    leadScore: finalScore,
    fitLabel: finalFitLabel,
    confidence: finalConfidence,
    ...decisionIntelligence,
    scoreEvidence,
    scoringMetadata: buildScoringMetadata(scoreEvidence, finalScore, finalFitLabel, finalConfidence),
    positiveSignals: buildPositiveSignals(context, analysis.positiveSignals ?? []),
    negativeSignals: buildNegativeSignals(context, analysis.negativeSignals ?? []),
    riskWarnings: buildNegativeSignals(context, analysis.riskWarnings ?? []),
    missingInformation: (analysis.missingInformation ?? []).slice(0, 4),
    recommendedAction: alignedRecommendedAction,
    actionReason: buildActionReason(alignedRecommendedAction, context.decisionSignals),
    recommendedNextAction: recommendedNextStep(alignedRecommendedAction)
  };
}

export function buildQuickProfileAnalysis(profile: LinkedInProfile, userSettings: UserSettings): ProfileAnalysis {
  const context = buildLeadScoringContext(profile, userSettings);
  const confidence = context.scoringMetadata.confidence;
  const fitLabel = fitLabelForScore(context.heuristicScore, confidence);
  const seed = ProfileAnalysisSchema.parse({
    leadScore: context.heuristicScore,
    fitLabel,
    persona: buildQuickPersona(context, profile),
    painPoints: buildQuickPainPoints(context),
    icebreaker: buildQuickIcebreaker(profile),
    recommendedAction: recommendedActionForDecision(
      context.heuristicScore,
      confidence,
      context.decisionSignals,
      countDecisionSignals(context.decisionSignals)
    ),
    confidence,
    positiveSignals: buildPositiveSignals(context, []),
    negativeSignals: buildNegativeSignals(context, []),
    missingInformation: context.scoreEvidence
      .filter((item) => item.signalType === "missing")
      .map((item) => item.summary)
      .slice(0, 4),
    riskWarnings: buildNegativeSignals(context, []),
    recommendedOutreachAngle: context.decisionSignals.strongCommercialContext ? "Feedback request" : "Research first",
    whyThisAngle: context.decisionSignals.strongCommercialContext
      ? "The visible profile has HubSpot, CRM, or RevOps relevance, but outreach should stay low-pressure until missing context is checked."
      : "The visible profile needs more sales-decision context before a stronger outreach angle.",
    whatToAvoid: ["Avoid unsupported claims about HubSpot usage, CRM pain, buying intent, or company size."],
    scoreEvidence: context.scoreEvidence,
    dmVariants: []
  });

  return normalizeProfileAnalysisScore(seed, profile, userSettings);
}

function countDecisionSignals(signals: LeadDecisionSignals): number {
  return [
    signals.roleMatch,
    signals.industryMatch,
    signals.companySizeEvidence,
    signals.operationalPainEvidence,
    signals.buyerRelevance,
    signals.sellerContextConnection,
    signals.strongCommercialContext,
    signals.reliableCompany
  ].filter(Boolean).length;
}

function adjustedConfidence(
  modelConfidence: ProfileAnalysis["confidence"],
  signals: LeadDecisionSignals,
  independentSignalCount: number
): ProfileAnalysis["confidence"] {
  if (modelConfidence === "low") {
    return "low";
  }

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

function alignRecommendedActionWithReadiness(
  action: ProfileAnalysis["recommendedAction"],
  readiness: ProfileAnalysis["outreachReadiness"],
  signals: LeadDecisionSignals
): ProfileAnalysis["recommendedAction"] {
  if (
    action === "Pursue now" &&
    (readiness.timingRecommendation === "Research first" ||
      readiness.readiness === "not_ready" ||
      (readiness.readiness === "almost_ready" &&
        (!signals.buyerRelevance || !signals.operationalPainEvidence || !signals.reliableCompany)))
  ) {
    return "Research more";
  }

  if (action === "Do not contact yet" && readiness.timingRecommendation === "Contact now") {
    return "Research more";
  }

  return action;
}

function buildActionReason(action: ProfileAnalysis["recommendedAction"], signals: LeadDecisionSignals): string {
  const missing = [
    !signals.companySizeEvidence ? "company size" : undefined,
    !signals.industryMatch ? "target-industry fit" : undefined,
    !signals.operationalPainEvidence ? "CRM or sales-workflow pain" : undefined,
    !signals.buyerRelevance ? "buyer relevance" : undefined,
    !signals.sellerContextConnection ? "a clear connection to the offer" : undefined
  ].filter((item): item is string => Boolean(item));

  if (signals.strongCommercialContext && signals.limitedProfileContext) {
    return "HubSpot / CRM / RevOps consultant context is strong, but profile context is limited, so review before outreach.";
  }

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

type DecisionIntelligenceInput = {
  context: LeadScoringContext;
  profile: LinkedInProfile;
  scoreEvidence: ScoreEvidence[];
  finalScore: number;
  finalConfidence: ProfileAnalysis["confidence"];
  recommendedAction: ProfileAnalysis["recommendedAction"];
};

type BreakdownItem = ProfileAnalysis["decisionBreakdown"]["roleFit"];

function buildDecisionIntelligence(input: DecisionIntelligenceInput): Pick<
  ProfileAnalysis,
  | "decisionConfidence"
  | "dataSufficiency"
  | "evidenceCoverage"
  | "confidenceReason"
  | "limitedContextReasons"
  | "decisionBreakdown"
  | "decisionChangeConditions"
  | "nextBestResearchActions"
  | "outreachReadiness"
  | "outreachCoach"
  | "actionRisks"
  | "actionPrerequisites"
  | "actionExpiration"
> {
  const evidenceCoverage = calculateEvidenceCoverage(input.context.decisionSignals);
  const limitedContextReasons = buildLimitedContextReasons(input.context.decisionSignals, input.profile);
  const dataSufficiency = buildDataSufficiency(input.context.decisionSignals, evidenceCoverage);
  const confidenceReason = buildConfidenceReason(
    input.finalConfidence,
    input.context.decisionSignals,
    evidenceCoverage,
    limitedContextReasons,
    input.profile
  );
  const actionRisks = buildActionRisks(input.context.decisionSignals, limitedContextReasons);
  const actionPrerequisites = buildActionPrerequisites(input.context.decisionSignals, input.recommendedAction);
  const outreachReadiness = buildOutreachReadiness(input.context.decisionSignals, input.finalConfidence, dataSufficiency, input.recommendedAction);

  return {
    decisionConfidence: input.finalConfidence,
    dataSufficiency,
    evidenceCoverage,
    confidenceReason,
    limitedContextReasons,
    decisionBreakdown: buildDecisionBreakdown(input.context, input.scoreEvidence, dataSufficiency, evidenceCoverage),
    decisionChangeConditions: buildDecisionChangeConditions(input.context.decisionSignals),
    nextBestResearchActions: buildNextBestResearchActions(input.context.decisionSignals, input.recommendedAction),
    outreachReadiness,
    outreachCoach: buildOutreachCoach(outreachReadiness, input.context.decisionSignals),
    actionRisks,
    actionPrerequisites,
    actionExpiration: buildActionExpiration(input.context.decisionSignals, input.recommendedAction)
  };
}

function buildDecisionBreakdown(
  context: LeadScoringContext,
  evidence: ScoreEvidence[],
  dataSufficiency: ProfileAnalysis["dataSufficiency"],
  evidenceCoverage: number
): ProfileAnalysis["decisionBreakdown"] {
  const signals = context.decisionSignals;
  const roleEvidence = evidenceForCategory(evidence, "role");
  const industryEvidence = evidenceForCategory(evidence, "industry");
  const companyEvidence = evidenceForCategory(evidence, "company", "company_size");
  const painEvidence = evidenceForCategory(evidence, "pain_point", "technology", "experience");
  const riskEvidence = evidence.filter((item) => item.signalType === "negative" || item.signalType === "disqualifier");
  const roleSupportCategories: ScoreEvidence["category"][] = signals.strongCommercialContext
    ? ["role", "technology", "industry", "experience"]
    : ["role"];
  const roleSupportEvidence = roleEvidence.length
    ? roleEvidence
    : evidenceForCategory(evidence, ...roleSupportCategories);

  return {
    roleFit: breakdownItem({
      status: signals.roleMatch ? (signals.strongCommercialContext ? "strong" : "moderate") : "missing",
      score: signals.roleMatch ? (signals.strongCommercialContext ? 90 : 65) : 0,
      explanation: signals.roleMatch
        ? signals.strongCommercialContext
          ? "Visible role context strongly matches HubSpot, CRM, or RevOps consulting relevance."
          : "A relevant role or seniority signal is visible, but it needs supporting evidence."
        : "Target role or seniority is not clearly visible.",
      evidence: roleSupportEvidence,
      source: sourceForEvidence(evidence, ...roleSupportCategories),
      basis: basisForEvidence(evidence, ...roleSupportCategories)
    }),
    industryFit: breakdownItem({
      status: signals.industryMatch || signals.strongCommercialContext ? "strong" : "missing",
      score: signals.industryMatch || signals.strongCommercialContext ? 85 : 0,
      explanation: signals.industryMatch || signals.strongCommercialContext
        ? "Visible profile text connects to the saved industry or HubSpot/RevOps/CRM context."
        : "Target industry context is not clearly visible.",
      evidence: industryEvidence,
      source: sourceForEvidence(evidence, "industry"),
      basis: basisForEvidence(evidence, "industry")
    }),
    companyFit: breakdownItem({
      status: signals.companySizeEvidence && signals.reliableCompany ? "strong" : signals.reliableCompany ? "moderate" : "missing",
      score: signals.companySizeEvidence && signals.reliableCompany ? 85 : signals.reliableCompany ? 55 : 0,
      explanation: signals.companySizeEvidence && signals.reliableCompany
        ? "Current company and company-size evidence are visible."
        : signals.reliableCompany
          ? "Current company is visible, but company size is not confirmed."
          : "Company context could not be verified from visible profile information.",
      evidence: companyEvidence,
      source: sourceForEvidence(evidence, "company", "company_size"),
      basis: basisForEvidence(evidence, "company", "company_size")
    }),
    buyerRelevance: breakdownItem({
      status: signals.buyerRelevance && signals.sellerContextConnection ? "moderate" : signals.buyerRelevance ? "weak" : "missing",
      score: signals.buyerRelevance && signals.sellerContextConnection ? 70 : signals.buyerRelevance ? 45 : 0,
      explanation: signals.buyerRelevance
        ? "The profile suggests possible influence over sales, CRM, RevOps, or growth workflows."
        : "Buying influence for the saved offer is not visible.",
      evidence: evidenceSummaries(evidence.filter((item) => ["role", "experience", "technology", "other"].includes(item.category))),
      source: "profile",
      basis: signals.buyerRelevance ? "mixed" : "missing"
    }),
    painEvidence: breakdownItem({
      status: signals.operationalPainEvidence ? "strong" : signals.strongCommercialContext ? "weak" : "missing",
      score: signals.operationalPainEvidence ? 80 : signals.strongCommercialContext ? 35 : 0,
      explanation: signals.operationalPainEvidence
        ? "Visible profile text shows CRM, RevOps, outbound, or sales-workflow pain context."
        : signals.strongCommercialContext
          ? "Commercial relevance is visible, but direct workflow pain is not confirmed."
          : "No direct CRM, RevOps, outbound, or sales-workflow pain evidence is visible.",
      evidence: painEvidence,
      source: sourceForEvidence(evidence, "pain_point", "technology", "experience"),
      basis: signals.operationalPainEvidence ? "fact" : "missing"
    }),
    timingSignal: breakdownItem({
      status: "missing",
      score: 0,
      explanation: "No clear public trigger or timing signal is visible, so timing should not be assumed.",
      evidence: [],
      source: "not_available",
      basis: "missing"
    }),
    relationshipSignal: breakdownItem({
      status: "missing",
      score: 0,
      explanation: "No existing relationship context is visible in the provided profile data.",
      evidence: [],
      source: "not_available",
      basis: "missing"
    }),
    dataSufficiency: breakdownItem({
      status: dataSufficiency === "sufficient" ? "strong" : dataSufficiency === "partial" ? "moderate" : "missing",
      score: evidenceCoverage,
      explanation: `Visible evidence coverage is ${evidenceCoverage}%, so data sufficiency is ${dataSufficiency}.`,
      evidence: [],
      source: "computed",
      basis: "fact"
    }),
    riskLevel: breakdownItem({
      status: signals.nonIcpContext || riskEvidence.length ? "negative" : "weak",
      score: signals.nonIcpContext ? 85 : riskEvidence.length ? 60 : 20,
      explanation: signals.nonIcpContext
        ? "Visible context suggests a non-ICP, public, nonprofit, government, education, investor, or philanthropy risk."
        : riskEvidence.length
          ? "Some risk or disqualifier evidence is visible and should be reviewed."
          : "No major disqualifier is visible, but human review is still required.",
      evidence: evidenceSummaries(riskEvidence),
      source: sourceForEvidence(riskEvidence),
      basis: riskEvidence.length ? "fact" : "missing"
    })
  };
}

function breakdownItem(item: BreakdownItem): BreakdownItem {
  const evidence = dedupeStrings(item.evidence).slice(0, 2);
  const source = item.source || "not_available";
  const basis = item.basis || "missing";
  const hasUsableSupport = basis !== "missing" && source !== "not_available" && (evidence.length > 0 || source === "computed");
  if (item.status === "strong" && !hasUsableSupport) {
    return {
      ...item,
      status: "missing",
      score: Math.min(item.score, 20),
      source,
      basis: "missing",
      explanation: "This factor cannot be rated strong because supporting visible evidence is missing.",
      evidence: []
    };
  }

  return {
    ...item,
    source,
    basis,
    explanation: truncateNatural(item.explanation, 500),
    evidence
  };
}

function calculateEvidenceCoverage(signals: LeadDecisionSignals): number {
  const positiveOrNegativeCoverage = [
    signals.roleMatch,
    signals.industryMatch,
    signals.companySizeEvidence,
    signals.operationalPainEvidence,
    signals.buyerRelevance,
    signals.sellerContextConnection,
    signals.reliableCompany,
    signals.hasProfileDepth
  ].filter(Boolean).length;
  const riskCoverage = signals.nonIcpContext ? 1 : 0;
  return Math.max(0, Math.min(100, Math.round(((positiveOrNegativeCoverage + riskCoverage) / 9) * 100)));
}

function buildDataSufficiency(
  signals: LeadDecisionSignals,
  evidenceCoverage: number
): ProfileAnalysis["dataSufficiency"] {
  if (evidenceCoverage >= 70 && signals.hasProfileDepth && signals.reliableCompany && signals.companySizeEvidence) {
    return "sufficient";
  }

  if (evidenceCoverage >= 35 || signals.strongCommercialContext || signals.nonIcpContext) {
    return "partial";
  }

  return "insufficient";
}

function buildLimitedContextReasons(signals: LeadDecisionSignals, profile: LinkedInProfile): string[] {
  const hasAbout = Boolean(profile.about?.trim() || profile.visibleProfileContext?.about?.text?.trim());
  const hasExperienceContext = Boolean(
    profile.currentRoleDescription?.trim() || (profile.visibleProfileContext?.experience?.visibleItems ?? []).length > 0
  );
  const isHeadlineOnly = !hasAbout && !hasExperienceContext && signals.limitedProfileContext;
  return dedupeStrings([
    !profile.about ? "About section not detected" : "",
    !profile.currentRoleDescription ? "Current role details missing" : "",
    !signals.companySizeEvidence ? "Company size missing" : "",
    !signals.buyerRelevance ? "Buying intent not visible" : "",
    !signals.operationalPainEvidence ? "No direct pain evidence" : "",
    isHeadlineOnly ? "Profile text is limited to headline or short visible context" : "",
    !signals.reliableCompany ? "Company context could not be verified" : ""
  ].filter(Boolean));
}

function buildConfidenceReason(
  confidence: ProfileAnalysis["confidence"],
  signals: LeadDecisionSignals,
  evidenceCoverage: number,
  limitedContextReasons: string[],
  profile: LinkedInProfile
): string {
  if (confidence === "high" && signals.nonIcpContext) {
    return "Confidence is high because clear negative or non-ICP evidence is visible.";
  }

  if (confidence === "high") {
    return "Confidence is high because multiple independent visible profile facts support the decision.";
  }

  if (confidence === "medium") {
    const hasAbout = Boolean(profile.about?.trim() || profile.visibleProfileContext?.about?.text?.trim());
    if (hasAbout && (profile.headline || signals.roleMatch || signals.industryMatch || signals.strongCommercialContext)) {
      const missing = dedupeStrings([
        !signals.companySizeEvidence ? "company size" : "",
        !signals.buyerRelevance ? "buying intent" : "",
        !signals.operationalPainEvidence ? "direct workflow pain" : ""
      ].filter(Boolean));
      const missingText = missing.length ? `${joinReadableList(missing)} ${missing.length === 1 ? "is" : "are"} not confirmed` : "the remaining gaps are limited";
      return `Confidence is medium because the visible About section supports the role and industry fit, but ${missingText}.`;
    }

    const reason = limitedContextReasons.length
      ? limitedContextReasons.slice(0, 3).join(", ")
      : `evidence coverage is ${evidenceCoverage}%`;
    return `Confidence is medium because ${reason}.`;
  }

  return "Confidence is low because the visible profile context is not sufficient for a reliable sales decision.";
}

function buildActionRisks(signals: LeadDecisionSignals, limitedContextReasons: string[]): string[] {
  const risks = [
    signals.nonIcpContext ? "Visible non-ICP or public-profile context may make outreach inappropriate." : "",
    !signals.operationalPainEvidence ? "Direct CRM, RevOps, outbound, or sales-workflow pain is not confirmed." : "",
    !signals.buyerRelevance ? "Buyer relevance is not confirmed." : "",
    !signals.reliableCompany ? "Company context may be incomplete or unverified." : "",
    ...limitedContextReasons.filter((reason) => /buying intent|company size/i.test(reason))
  ];

  return dedupeStrings(risks.filter(Boolean)).slice(0, 2);
}

function buildActionPrerequisites(signals: LeadDecisionSignals, action: ProfileAnalysis["recommendedAction"]): string[] {
  if (action === "Do not contact yet") {
    return ["Wait for clearer ICP and buyer-relevance evidence before outreach."];
  }

  return dedupeStrings([
    !signals.buyerRelevance ? "Confirm the person influences CRM, RevOps, sales, or prospecting workflow decisions." : "",
    !signals.operationalPainEvidence ? "Confirm a current CRM, HubSpot, RevOps, outbound, or lead workflow pain." : "",
    !signals.companySizeEvidence ? "Review company size or operating context." : ""
  ].filter(Boolean)).slice(0, 2);
}

function buildActionExpiration(signals: LeadDecisionSignals, action: ProfileAnalysis["recommendedAction"]): string {
  if (!signals.operationalPainEvidence || !signals.buyerRelevance) {
    return "Re-evaluate after confirming HubSpot usage or CRM workflow pain";
  }

  if (!signals.reliableCompany || !signals.companySizeEvidence) {
    return "Re-evaluate after reviewing company context";
  }

  if (action === "Pursue now") {
    return "No immediate re-evaluation needed";
  }

  return "Re-evaluate when a relevant trigger appears";
}

function buildDecisionChangeConditions(signals: LeadDecisionSignals): ProfileAnalysis["decisionChangeConditions"] {
  const rawConditions: Array<ProfileAnalysis["decisionChangeConditions"][number] | null> = [
    !signals.sellerContextConnection
      ? {
          condition: "Uses HubSpot or owns a CRM workflow",
          currentState: "Not confirmed",
          impactIfConfirmed: "Would materially increase buyer relevance for this product.",
          recommendedActionIfConfirmed: "Pursue now" as const
        }
      : null,
    !signals.operationalPainEvidence
      ? {
          condition: "Direct CRM, RevOps, outbound, or LinkedIn-to-HubSpot workflow pain is visible",
          currentState: "Not confirmed",
          impactIfConfirmed: "Would increase confidence that the outreach angle is grounded in a real need.",
          recommendedActionIfConfirmed: "Pursue now" as const
        }
      : null,
    !signals.companySizeEvidence
      ? {
          condition: "Company size fits the saved ICP",
          currentState: "Not confirmed",
          impactIfConfirmed: "Would improve company fit and decision confidence.",
          recommendedActionIfConfirmed: "Research more" as const
        }
      : null,
    signals.nonIcpContext
      ? {
          condition: "Commercial CRM, RevOps, or B2B sales context becomes visible",
          currentState: "Not confirmed",
          impactIfConfirmed: "Could reduce the current non-ICP risk.",
          recommendedActionIfConfirmed: "Research more" as const
        }
      : null,
    !signals.reliableCompany
      ? {
          condition: "Current company context is verified",
          currentState: "Not confirmed",
          impactIfConfirmed: "Would make the CRM sync and sales decision more reliable.",
          recommendedActionIfConfirmed: "Research more" as const
        }
      : null
  ];
  const conditions = rawConditions.filter((item): item is ProfileAnalysis["decisionChangeConditions"][number] => Boolean(item));

  return conditions.slice(0, 3);
}

function buildNextBestResearchActions(
  signals: LeadDecisionSignals,
  action: ProfileAnalysis["recommendedAction"]
): ProfileAnalysis["nextBestResearchActions"] {
  if (action === "Pursue now" && signals.operationalPainEvidence && signals.companySizeEvidence) {
    return [];
  }

  const rawActions: Array<ProfileAnalysis["nextBestResearchActions"][number] | null> = [
    !signals.sellerContextConnection || !signals.buyerRelevance
      ? {
          priority: "high" as const,
          action: "Confirm whether this person influences CRM, HubSpot, RevOps, or sales workflow decisions.",
          reason: "Buyer relevance is the most important missing sales-decision input.",
          expectedDecisionImpact: "Could move the decision toward Pursue now or keep it at Research more.",
          safeSourceSuggestion: "Review the visible About or current Experience section"
        }
      : null,
    !signals.operationalPainEvidence
      ? {
          priority: "high" as const,
          action: "Check for visible evidence of CRM hygiene, outbound, LinkedIn prospecting, or lead workflow pain.",
          reason: "The outreach angle should not assume pain that is not visible.",
          expectedDecisionImpact: "Could improve outreach readiness or reveal that the lead should stay lower priority.",
          safeSourceSuggestion: "Ask a low-pressure qualification question"
        }
      : null,
    !signals.companySizeEvidence
      ? {
          priority: "medium" as const,
          action: "Review public company size or operating context.",
          reason: "Company fit affects confidence but should not be guessed.",
          expectedDecisionImpact: "Could increase confidence or keep the decision at Research more.",
          safeSourceSuggestion: "Review public company size information"
        }
      : null,
    signals.nonIcpContext
      ? {
          priority: "high" as const,
          action: "Verify whether any commercial CRM, RevOps, or B2B sales context is actually visible.",
          reason: "Current visible context suggests possible non-ICP risk.",
          expectedDecisionImpact: "Could confirm Do not contact yet or justify a cautious re-review.",
          safeSourceSuggestion: "Review the visible About section"
        }
      : null
  ];
  const actions = rawActions.filter((item): item is ProfileAnalysis["nextBestResearchActions"][number] => Boolean(item));

  return dedupeByAction(actions).slice(0, 2);
}

function buildOutreachReadiness(
  signals: LeadDecisionSignals,
  confidence: ProfileAnalysis["confidence"],
  dataSufficiency: ProfileAnalysis["dataSufficiency"],
  action: ProfileAnalysis["recommendedAction"]
): ProfileAnalysis["outreachReadiness"] {
  const blockers = dedupeStrings([
    !signals.buyerRelevance ? "No confirmed buyer relevance" : "",
    !signals.operationalPainEvidence ? "No direct pain evidence" : "",
    !signals.reliableCompany ? "Company context missing" : "",
    signals.nonIcpContext ? "Potential non-ICP profile" : "",
    dataSufficiency === "insufficient" ? "Visible profile data is insufficient" : "",
    "Existing relationship context is missing"
  ].filter(Boolean)).slice(0, 2);
  const prerequisites = buildActionPrerequisites(signals, action);

  if (signals.nonIcpContext || action === "Do not contact yet") {
    return {
      readiness: "avoid",
      readinessScore: 15,
      timingRecommendation: "Do not contact yet",
      reason: "Visible risk or non-ICP context makes outreach unsafe without stronger evidence.",
      blockers,
      prerequisites
    };
  }

  if (confidence === "low" || dataSufficiency === "insufficient") {
    return {
      readiness: "not_ready",
      readinessScore: 35,
      timingRecommendation: "Research first",
      reason: "The decision does not have enough visible evidence for outreach readiness.",
      blockers,
      prerequisites
    };
  }

  if (
    action === "Pursue now" &&
    signals.operationalPainEvidence &&
    signals.buyerRelevance &&
    signals.reliableCompany &&
    signals.companySizeEvidence &&
    blockers.length <= 1
  ) {
    return {
      readiness: "ready",
      readinessScore: 85,
      timingRecommendation: "Contact now",
      reason: "Multiple relevant signals are visible and the draft can be reviewed manually.",
      blockers,
      prerequisites
    };
  }

  return {
    readiness: "almost_ready",
    readinessScore: signals.strongCommercialContext ? 72 : 60,
    timingRecommendation: "Research first",
    reason: signals.strongCommercialContext
      ? "Strong HubSpot, CRM, or RevOps relevance is visible, but buying intent or direct workflow pain is not fully confirmed."
      : "Some relevance is visible, but important outreach assumptions still need review.",
    blockers,
    prerequisites
  };
}

function buildQuickPersona(context: LeadScoringContext, profile: LinkedInProfile): string {
  if (context.decisionSignals.strongCommercialContext) {
    return "HubSpot, CRM, or RevOps consultant with potential relevance to a LinkedIn-to-HubSpot workflow.";
  }

  if (context.decisionSignals.roleMatch || profile.headline) {
    return "Potential B2B sales or operations prospect based on visible profile context.";
  }

  return "Profile has limited visible buyer context.";
}

function buildQuickPainPoints(context: LeadScoringContext): string[] {
  if (context.decisionSignals.operationalPainEvidence) {
    return ["Visible CRM, RevOps, outbound, or sales-workflow context may connect to the product."];
  }

  if (context.decisionSignals.strongCommercialContext) {
    return ["Possible CRM or RevOps workflow pain is plausible but not directly confirmed."];
  }

  return ["Current workflow pain is not confirmed from the visible profile."];
}

function buildQuickIcebreaker(profile: LinkedInProfile): string {
  if (profile.headline) {
    return `I noticed your profile mentions ${truncateNatural(profile.headline, 120)}.`;
  }

  if (profile.companyName) {
    return `I noticed your current company context at ${truncateNatural(profile.companyName, 80)}.`;
  }

  return "I noticed your LinkedIn profile and wanted to keep this relevant.";
}

function buildOutreachCoach(
  readiness: ProfileAnalysis["outreachReadiness"],
  signals: LeadDecisionSignals
): ProfileAnalysis["outreachCoach"] {
  if (readiness.readiness === "avoid") {
    return {
      verdict: "Do not send yet",
      message: "The current visible evidence is not safe enough for outreach.",
      mainWarning: signals.nonIcpContext
        ? "Do not treat public, nonprofit, government, investor, or philanthropy context as commercial buying intent."
        : "Do not send before resolving the visible risks.",
      recommendedPreparation: "Wait for clearer ICP, buyer relevance, or workflow-pain evidence.",
      humanReviewRequired: true
    };
  }

  if (readiness.readiness === "not_ready" || readiness.timingRecommendation === "Research first") {
    return {
      verdict: "Research before sending",
      message: "The profile may be relevant, but the draft should not assume unconfirmed workflow pain.",
      mainWarning: "Do not imply the prospect uses HubSpot or has a messy CRM unless that is visible.",
      recommendedPreparation: "Confirm buyer relevance and direct CRM, RevOps, outbound, or lead workflow context.",
      humanReviewRequired: true
    };
  }

  return {
    verdict: "Send after review",
    message: "The profile has enough visible relevance to draft outreach, but a human should review every claim.",
    mainWarning: "Keep the message concise and avoid unsupported claims.",
    recommendedPreparation: "Remove assumptions that are not supported by the visible profile.",
    humanReviewRequired: true
  };
}

function evidenceForCategory(evidence: ScoreEvidence[], ...categories: ScoreEvidence["category"][]): string[] {
  return evidenceSummaries(evidence.filter((item) => categories.includes(item.category)));
}

function evidenceSummaries(evidence: ScoreEvidence[]): string[] {
  return dedupeStrings(evidence.map((item) => item.evidenceText || item.summary).filter(Boolean)).slice(0, 2);
}

function sourceForEvidence(evidence: ScoreEvidence[], ...categories: ScoreEvidence["category"][]): string {
  const item = categories.length ? evidence.find((entry) => categories.includes(entry.category)) : evidence[0];
  return item?.sourceSection ?? "not_available";
}

function basisForEvidence(evidence: ScoreEvidence[], ...categories: ScoreEvidence["category"][]): BreakdownItem["basis"] {
  const items = categories.length ? evidence.filter((entry) => categories.includes(entry.category)) : evidence;
  if (!items.length) {
    return "missing";
  }

  const hasFact = items.some((item) => item.basis === "fact");
  const hasInference = items.some((item) => item.basis === "inference");
  if (hasFact && hasInference) {
    return "mixed";
  }

  return hasFact ? "fact" : "inference";
}

function dedupeByAction(items: ProfileAnalysis["nextBestResearchActions"]): ProfileAnalysis["nextBestResearchActions"] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = normalize(item.action);
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
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

function buildPositiveSignals(context: LeadScoringContext, modelSignals: string[]): string[] {
  const merged = [...context.matchedSignals, ...modelSignals].filter(
    (signal) => !/\b(non-?icp|public figure|nonprofit|non-profit|government|investor|disqualifier|excluded role|weak-fit)\b/i.test(signal)
  );
  const filtered = context.decisionSignals.strongCommercialContext
    ? merged.filter(
        (signal) =>
          signal === "Strong HubSpot / CRM / RevOps consultant context" ||
          !/\b(hubspot|crm|revops)\b.*\b(consultant|partner|match)|\b(consultant|partner|match)\b.*\b(hubspot|crm|revops)\b/i.test(
            signal
          )
      )
    : merged;

  return dedupeStrings(filtered).slice(0, 5);
}

function buildNegativeSignals(context: LeadScoringContext, modelSignals: string[]): string[] {
  const deterministicRisks = context.scoreEvidence
    .filter((item) => item.signalType === "disqualifier" || item.signalType === "negative")
    .map((item) => item.summary);
  return dedupeStrings([...modelSignals, ...deterministicRisks]).slice(0, 3);
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

function limitScoreEvidence(items: ScoreEvidence[]): ScoreEvidence[] {
  const selected: ScoreEvidence[] = [];
  const add = (bucket: ScoreEvidence[], maxItems: number) => {
    for (const item of bucket) {
      if (selected.length >= 5 || selected.filter((entry) => bucket.includes(entry)).length >= maxItems) {
        break;
      }
      selected.push(item);
    }
  };

  add(items.filter((item) => item.signalType === "positive" && item.basis === "fact" && item.category === "role"), 1);
  add(items.filter((item) => item.signalType === "positive" && item.basis === "fact" && item.category !== "role"), 2);
  add(items.filter((item) => item.basis === "inference"), 1);
  add(items.filter((item) => item.signalType === "negative" || item.signalType === "disqualifier"), 1);
  add(items.filter((item) => item.signalType === "missing"), 1);

  return dedupeEvidence([...selected, ...items]).slice(0, 5);
}

function normalizeEvidenceKey(value: string): string {
  return sanitizeEvidenceText(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
