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
  missingSettingsWarning?: string;
};

type EvidenceSource = {
  section: ScoreEvidence["sourceSection"];
  text: string;
};

function normalize(value: string | undefined): string {
  return (value ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

function profileText(profile: LinkedInProfile, analysis?: ProfileAnalysis): string {
  return normalize(
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
      profile.visibleTextSample,
      analysis?.persona,
      ...(analysis?.painPoints ?? [])
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

  return sources.filter((source) => source.text.trim().length > 0);
}

function keywords(value: string): string[] {
  return [
    ...new Set(
      normalize(value)
        .split(/[^a-z0-9]+/)
        .filter((token) => token.length >= 4 && !STOP_WORDS.has(token))
    )
  ].slice(0, 16);
}

function countMatches(text: string, terms: string[]): number {
  return terms.filter((term) => text.includes(term)).length;
}

function scoreKeywordMatches(text: string, keywordText: string, maxScore: number): { score: number; matches: string[] } {
  const matches = keywords(keywordText).filter((keyword) => text.includes(keyword));
  return {
    score: Math.min(maxScore, matches.length * 6),
    matches
  };
}

function createEvidence(input: Omit<ScoreEvidence, "id">): ScoreEvidence {
  return {
    id: `ev-${input.signalType}-${input.category}-${Math.abs(hashText(`${input.summary}-${input.evidenceText ?? ""}`))}`,
    ...input,
    summary: truncate(input.summary, 240),
    evidenceText: input.evidenceText ? truncate(input.evidenceText, 220) : null
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
    scoringVersion: "0.3.0",
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
  userSettings: UserSettings,
  analysis?: ProfileAnalysis
): LeadScoringContext {
  const text = profileText(profile, analysis);
  const sources = profileEvidenceSources(profile);
  const scoreEvidence: ScoreEvidence[] = [];
  const matchedSignals: string[] = [];
  const settingsAreComplete = Boolean(
    userSettings.productOrServiceDescription.trim() &&
      userSettings.targetCustomerProfile.trim() &&
      userSettings.targetRoles.trim()
  );

  let score = 8;
  const seniorityMatches = countMatches(text, SENIORITY_TERMS);
  const relevantMatches = countMatches(text, RELEVANT_BUSINESS_TERMS);
  const poorFitMatches = countMatches(text, POOR_FIT_TERMS);
  const targetMatches = scoreKeywordMatches(text, userSettings.targetCustomerProfile, 30);
  const productMatches = scoreKeywordMatches(text, `${userSettings.productOrServiceDescription} ${sellerContextText(userSettings)}`, 18);
  const industryMatches = scoreKeywordMatches(text, userSettings.targetIndustries, 18);
  const roleMatches = scoreKeywordMatches(text, userSettings.targetRoles, 24);
  const painPointMatches = scoreKeywordMatches(text, userSettings.mainPainPointsSolved, 18);
  const excludedMatches = scoreKeywordMatches(text, userSettings.excludedRoles, 24);

  if (profile.jobTitle || profile.headline) {
    score += 8;
  }

  if (profile.companyName) {
    score += 8;
  }

  if (seniorityMatches > 0) {
    score += Math.min(24, seniorityMatches * 8);
    matchedSignals.push("seniority");
    const seniorityEvidence = evidenceForMatches({
      sources,
      matches: SENIORITY_TERMS.filter((term) => text.includes(term)),
      basis: "inference",
      category: "role",
      summary: "May have seniority or influence based on visible title language.",
      scoreImpact: Math.min(24, seniorityMatches * 8),
      confidence: "Medium"
    });
    if (seniorityEvidence) {
      scoreEvidence.push(seniorityEvidence);
    }
  }

  if (relevantMatches > 0) {
    score += Math.min(26, relevantMatches * 6);
    matchedSignals.push("business relevance");
    const relevanceEvidence = evidenceForMatches({
      sources,
      matches: RELEVANT_BUSINESS_TERMS.filter((term) => text.includes(term)),
      category: "experience",
      summary: "Visible profile text includes revenue, sales, operations, or CRM relevance.",
      scoreImpact: Math.min(26, relevantMatches * 6)
    });
    if (relevanceEvidence) {
      scoreEvidence.push(relevanceEvidence);
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
      category: "pain_point",
      summary: `Matches seller offer context: ${productMatches.matches.join(", ")}`,
      scoreImpact: productMatches.score
    });
    if (evidence) {
      scoreEvidence.push(evidence);
    }
  }

  if (industryMatches.score > 0) {
    score += industryMatches.score;
    matchedSignals.push(`industry match: ${industryMatches.matches.join(", ")}`);
    const evidence = evidenceForMatches({
      sources,
      matches: industryMatches.matches,
      category: "industry",
      summary: `Matches target industry terms: ${industryMatches.matches.join(", ")}`,
      scoreImpact: industryMatches.score
    });
    if (evidence) {
      scoreEvidence.push(evidence);
    }
  }

  if (roleMatches.score > 0) {
    score += roleMatches.score;
    matchedSignals.push(`role match: ${roleMatches.matches.join(", ")}`);
    const evidence = evidenceForMatches({
      sources,
      matches: roleMatches.matches,
      category: "role",
      summary: `Matches target role terms: ${roleMatches.matches.join(", ")}`,
      scoreImpact: roleMatches.score
    });
    if (evidence) {
      scoreEvidence.push(evidence);
    }
  }

  if (painPointMatches.score > 0) {
    score += painPointMatches.score;
    matchedSignals.push(`pain point match: ${painPointMatches.matches.join(", ")}`);
    const evidence = evidenceForMatches({
      sources,
      matches: painPointMatches.matches,
      category: "pain_point",
      summary: `Matches saved pain point terms: ${painPointMatches.matches.join(", ")}`,
      scoreImpact: painPointMatches.score
    });
    if (evidence) {
      scoreEvidence.push(evidence);
    }
  }

  if (!settingsAreComplete && relevantMatches > 0) {
    score += 10;
    matchedSignals.push("generic B2B SaaS fallback");
  }

  if (poorFitMatches > 0 && relevantMatches === 0 && targetMatches.score === 0) {
    score -= 25;
    matchedSignals.push("weak-fit role signal");
    const evidence = evidenceForMatches({
      sources,
      matches: POOR_FIT_TERMS.filter((term) => text.includes(term)),
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

  if (excludedMatches.score > 0 && targetMatches.score === 0 && roleMatches.score === 0) {
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

  if (roleMatches.score === 0 && seniorityMatches === 0) {
    scoreEvidence.push(missingEvidence("role", "Target role or seniority is not clearly visible."));
  }

  if (!profile.companyName) {
    scoreEvidence.push(missingEvidence("company", "Current company is not clearly visible."));
  }

  if (!text.includes("employees") && !text.includes("company size")) {
    scoreEvidence.push(missingEvidence("company_size", "No visible company-size evidence was found."));
  }

  const finalHeuristicScore = Math.max(0, Math.min(100, Math.round(score)));
  const heuristicFitLabel = fitLabelForScore(finalHeuristicScore, scoreEvidence.length <= 1 ? "low" : "medium");
  return {
    heuristicScore: finalHeuristicScore,
    matchedSignals,
    scoreEvidence: dedupeEvidence(scoreEvidence).slice(0, 20),
    scoringMetadata: buildScoringMetadata(dedupeEvidence(scoreEvidence), finalHeuristicScore, heuristicFitLabel, scoreEvidence.length <= 1 ? "low" : "medium"),
    missingSettingsWarning: settingsAreComplete
      ? undefined
      : "Product or target customer settings are missing, so scoring uses a generic B2B SaaS relevance fallback."
  };
}

export function fitLabelForScore(score: number, confidence: ProfileAnalysis["confidence"]): ProfileAnalysis["fitLabel"] {
  if (confidence === "low" && score <= 20) {
    return "Not enough data";
  }

  if (score >= 70) {
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
  const context = buildLeadScoringContext(profile, userSettings, analysis);

  if (analysis.confidence === "low" && context.matchedSignals.length <= 1) {
    const lowConfidenceEvidence = dedupeEvidence([
      ...context.scoreEvidence,
      ...(analysis.scoreEvidence ?? []).filter((item) => item.basis === "inference")
    ]).slice(0, 20);
    return {
      ...analysis,
      leadScore: 0,
      fitLabel: "Not enough data",
      scoreEvidence: lowConfidenceEvidence,
      scoringMetadata: buildScoringMetadata(lowConfidenceEvidence, 0, "Not enough data", "low"),
      positiveSignals: (analysis.positiveSignals ?? []).length ? analysis.positiveSignals : context.matchedSignals,
      missingInformation: (analysis.missingInformation ?? []).length
        ? analysis.missingInformation
        : ["More visible profile context is needed for confident scoring."],
      recommendedNextAction: analysis.recommendedNextAction || analysis.recommendedAction,
      recommendedOutreachAngle: analysis.recommendedOutreachAngle || "Research first"
    };
  }

  const aiWeight = analysis.confidence === "high" ? 0.65 : analysis.confidence === "medium" ? 0.5 : 0.3;
  const heuristicWeight = 1 - aiWeight;
  const blendedScore = Math.round(analysis.leadScore * aiWeight + context.heuristicScore * heuristicWeight);
  const finalScore = Math.max(0, Math.min(100, blendedScore));
  const finalFitLabel = fitLabelForScore(finalScore, analysis.confidence);
  const scoreEvidence = dedupeEvidence([
    ...context.scoreEvidence,
    ...(analysis.scoreEvidence ?? []).filter((item) => item.basis === "inference")
  ]).slice(0, 20);

  return {
    ...analysis,
    leadScore: finalScore,
    fitLabel: finalFitLabel,
    scoreEvidence,
    scoringMetadata: buildScoringMetadata(scoreEvidence, finalScore, finalFitLabel, analysis.confidence),
    positiveSignals: (analysis.positiveSignals ?? []).length ? analysis.positiveSignals : context.matchedSignals,
    recommendedNextAction: analysis.recommendedNextAction || analysis.recommendedAction
  };
}

function findSourceForTerm(sources: EvidenceSource[], term: string): EvidenceSource | undefined {
  return sources.find((source) => normalize(source.text).includes(term));
}

function excerptAroundTerm(text: string, term: string | undefined): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!term) {
    return truncate(cleaned, 220);
  }

  const lower = cleaned.toLowerCase();
  const index = lower.indexOf(term.toLowerCase());
  if (index < 0) {
    return truncate(cleaned, 220);
  }

  const start = Math.max(0, index - 70);
  const end = Math.min(cleaned.length, index + term.length + 130);
  return truncate(cleaned.slice(start, end), 220);
}

function truncate(value: string, maxLength: number): string {
  const characters = Array.from(value.replace(/\s+/g, " ").trim());
  return characters.length > maxLength ? `${characters.slice(0, Math.max(0, maxLength - 3)).join("").trimEnd()}...` : characters.join("");
}

function hashText(value: string): number {
  return Array.from(value).reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) | 0, 7);
}

function dedupeEvidence(items: ScoreEvidence[]): ScoreEvidence[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.signalType}:${item.basis}:${item.category}:${item.summary}:${item.evidenceText ?? ""}`;
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}
