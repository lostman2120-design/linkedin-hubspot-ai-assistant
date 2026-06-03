import type { LinkedInProfile, ProfileAnalysis, UserSettings } from "@linkedin-hubspot-ai/shared";

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
  missingSettingsWarning?: string;
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
      profile.visibleTextSample,
      analysis?.persona,
      ...(analysis?.painPoints ?? [])
    ]
      .filter(Boolean)
      .join(" ")
  );
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

export function buildLeadScoringContext(
  profile: LinkedInProfile,
  userSettings: UserSettings,
  analysis?: ProfileAnalysis
): LeadScoringContext {
  const text = profileText(profile, analysis);
  const matchedSignals: string[] = [];
  const settingsAreComplete = Boolean(
    userSettings.productOrServiceDescription.trim() && userSettings.targetCustomerProfile.trim()
  );

  let score = 8;
  const seniorityMatches = countMatches(text, SENIORITY_TERMS);
  const relevantMatches = countMatches(text, RELEVANT_BUSINESS_TERMS);
  const poorFitMatches = countMatches(text, POOR_FIT_TERMS);
  const targetMatches = scoreKeywordMatches(text, userSettings.targetCustomerProfile, 30);
  const productMatches = scoreKeywordMatches(text, userSettings.productOrServiceDescription, 18);

  if (profile.jobTitle || profile.headline) {
    score += 8;
  }

  if (profile.companyName) {
    score += 8;
  }

  if (seniorityMatches > 0) {
    score += Math.min(24, seniorityMatches * 8);
    matchedSignals.push("seniority");
  }

  if (relevantMatches > 0) {
    score += Math.min(26, relevantMatches * 6);
    matchedSignals.push("business relevance");
  }

  if (targetMatches.score > 0) {
    score += targetMatches.score;
    matchedSignals.push(`target match: ${targetMatches.matches.join(", ")}`);
  }

  if (productMatches.score > 0) {
    score += productMatches.score;
    matchedSignals.push(`product match: ${productMatches.matches.join(", ")}`);
  }

  if (!settingsAreComplete && relevantMatches > 0) {
    score += 10;
    matchedSignals.push("generic B2B SaaS fallback");
  }

  if (poorFitMatches > 0 && relevantMatches === 0 && targetMatches.score === 0) {
    score -= 25;
    matchedSignals.push("weak-fit role signal");
  }

  return {
    heuristicScore: Math.max(0, Math.min(100, Math.round(score))),
    matchedSignals,
    missingSettingsWarning: settingsAreComplete
      ? undefined
      : "Product or target customer settings are missing, so scoring uses a generic B2B SaaS relevance fallback."
  };
}

export function normalizeProfileAnalysisScore(
  analysis: ProfileAnalysis,
  profile: LinkedInProfile,
  userSettings: UserSettings
): ProfileAnalysis {
  const context = buildLeadScoringContext(profile, userSettings, analysis);

  if (analysis.confidence === "low" && context.matchedSignals.length <= 1) {
    return {
      ...analysis,
      leadScore: 0
    };
  }

  const aiWeight = analysis.confidence === "high" ? 0.65 : analysis.confidence === "medium" ? 0.5 : 0.3;
  const heuristicWeight = 1 - aiWeight;
  const blendedScore = Math.round(analysis.leadScore * aiWeight + context.heuristicScore * heuristicWeight);

  return {
    ...analysis,
    leadScore: Math.max(0, Math.min(100, blendedScore))
  };
}

