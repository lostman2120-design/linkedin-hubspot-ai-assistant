import type { GeneratedDm, LinkedInProfile, ProfileAnalysis, ScoreEvidence, UserSettings } from "@linkedin-hubspot-ai/shared";
import {
  UNABLE_TO_EXTRACT_FIELD,
  getProfileUrl,
  normalizeRecommendedAction,
  validateLinkedInProfileIdentity
} from "@linkedin-hubspot-ai/shared";
import { splitFullName } from "./name.js";

export type HubSpotContactProperties = Record<string, string>;
export type HubSpotAiPropertyField =
  | "leadScore"
  | "leadFit"
  | "persona"
  | "painPoints"
  | "icebreaker"
  | "suggestedDm"
  | "nextAction"
  | "personalizationScore"
  | "spamRisk";

export type HubSpotAiPropertyMapping = Partial<Record<HubSpotAiPropertyField, string>>;

export type SkippedHubSpotProperty = {
  field: string;
  property?: string;
  reason: string;
};

export type HubSpotContactSyncPayload = {
  properties: HubSpotContactProperties;
  standardProperties: HubSpotContactProperties;
  customProperties: HubSpotContactProperties;
  standardPropertyKeys: string[];
  customPropertyKeys: string[];
  lhaPropertyKeys: string[];
  skippedProperties: SkippedHubSpotProperty[];
};

export type HubSpotContactPropertyDefinition = {
  name: string;
  label: string;
  type: "string" | "number" | "datetime";
  fieldType: "text" | "textarea" | "number" | "date";
  groupName: "contactinformation";
  description: string;
};

export const LHA_CONTACT_PROPERTY_DEFINITIONS: HubSpotContactPropertyDefinition[] = [
  propertyDefinition("lha_icp_fit_score", "LHA ICP Fit Score", "number", "number"),
  propertyDefinition("lha_icp_fit_label", "LHA ICP Fit Label", "string", "text"),
  propertyDefinition("lha_recommended_action", "LHA Recommended Action", "string", "text"),
  propertyDefinition("lha_confidence", "LHA Confidence", "number", "number"),
  propertyDefinition("lha_outreach_angle", "LHA Outreach Angle", "string", "textarea"),
  propertyDefinition("lha_main_reason", "LHA Main Reason", "string", "textarea"),
  propertyDefinition("lha_main_risk", "LHA Main Risk", "string", "textarea"),
  propertyDefinition("lha_missing_info", "LHA Missing Info", "string", "textarea"),
  propertyDefinition("lha_last_analyzed_at", "LHA Last Analyzed At", "datetime", "date"),
  propertyDefinition("lha_source", "LHA Source", "string", "text")
];

const aiPropertyDefaults: Record<HubSpotAiPropertyField, string> = {
  leadScore: "ai_lead_score",
  leadFit: "ai_lead_fit",
  persona: "ai_persona",
  painPoints: "ai_pain_points",
  icebreaker: "ai_icebreaker",
  suggestedDm: "ai_suggested_dm",
  nextAction: "ai_next_action",
  personalizationScore: "ai_personalization_score",
  spamRisk: "ai_spam_risk"
};

const aiPropertyEnvNames: Record<HubSpotAiPropertyField, string> = {
  leadScore: "HUBSPOT_AI_LEAD_SCORE_PROPERTY",
  leadFit: "HUBSPOT_AI_LEAD_FIT_PROPERTY",
  persona: "HUBSPOT_AI_PERSONA_PROPERTY",
  painPoints: "HUBSPOT_AI_PAIN_POINTS_PROPERTY",
  icebreaker: "HUBSPOT_AI_ICEBREAKER_PROPERTY",
  suggestedDm: "HUBSPOT_AI_SUGGESTED_DM_PROPERTY",
  nextAction: "HUBSPOT_AI_NEXT_ACTION_PROPERTY",
  personalizationScore: "HUBSPOT_AI_PERSONALIZATION_SCORE_PROPERTY",
  spamRisk: "HUBSPOT_AI_SPAM_RISK_PROPERTY"
};

const blockedPropertyValues = new Set(["unknown", "n/a", "na", "--", "unable to extract this field"]);

function cleanProperty(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const cleaned = value.replace(/\s+/g, " ").trim();
  if (!cleaned || blockedPropertyValues.has(cleaned.toLowerCase()) || cleaned === UNABLE_TO_EXTRACT_FIELD) {
    return undefined;
  }

  return cleaned;
}

export function mapProfileToHubSpotProperties(
  profile: LinkedInProfile,
  lifecycleStage?: string
): HubSpotContactProperties {
  return mapStandardProfileProperties(profile, lifecycleStage);
}

export function buildHubSpotContactSyncPayload(input: {
  profile: LinkedInProfile;
  analysis?: ProfileAnalysis;
  generatedDm?: GeneratedDm;
  lifecycleStage?: string;
  aiPropertyMapping?: HubSpotAiPropertyMapping;
  analyzedAt?: string;
}): HubSpotContactSyncPayload {
  const standardProperties = mapStandardProfileProperties(input.profile, input.lifecycleStage);
  const customProperties: HubSpotContactProperties = {};
  const lhaProperties: HubSpotContactProperties = {};
  const skippedProperties: SkippedHubSpotProperty[] = [];
  const aiPropertyMapping = input.aiPropertyMapping ?? {};

  if (input.analysis) {
    const aiValues = buildAiPropertyValues(input.analysis, input.generatedDm);
    for (const field of Object.keys(aiValues) as HubSpotAiPropertyField[]) {
      const property = cleanPropertyName(aiPropertyMapping[field]);
      const value = cleanProperty(aiValues[field]);

      if (!value) {
        skippedProperties.push({
          field,
          property,
          reason: "value unavailable"
        });
        continue;
      }

      if (!property) {
        skippedProperties.push({
          field,
          reason: "custom property not configured"
        });
        continue;
      }

      customProperties[property] = value;
    }

    Object.assign(lhaProperties, buildLhaPropertyValues(input.analysis, input.analyzedAt ?? new Date().toISOString()));
    Object.assign(customProperties, lhaProperties);
  }

  return {
    properties: {
      ...standardProperties,
      ...customProperties
    },
    standardProperties,
    customProperties,
    standardPropertyKeys: Object.keys(standardProperties),
    customPropertyKeys: Object.keys(customProperties),
    lhaPropertyKeys: Object.keys(lhaProperties),
    skippedProperties
  };
}

export function getConfiguredHubSpotAiPropertyMapping(env: NodeJS.ProcessEnv = process.env): HubSpotAiPropertyMapping {
  const syncEnabled = isTruthy(env.HUBSPOT_SYNC_AI_CONTACT_PROPERTIES);
  const mapping: HubSpotAiPropertyMapping = {};

  for (const field of Object.keys(aiPropertyEnvNames) as HubSpotAiPropertyField[]) {
    const rawPropertyName = env[aiPropertyEnvNames[field]];
    if (isDisabledPropertyName(rawPropertyName)) {
      continue;
    }

    const configuredPropertyName = cleanPropertyName(rawPropertyName);
    if (configuredPropertyName) {
      mapping[field] = configuredPropertyName;
      continue;
    }

    if (syncEnabled) {
      mapping[field] = aiPropertyDefaults[field];
    }
  }

  return mapping;
}

export function leadFitLabel(leadScore: number): string {
  if (leadScore >= 80) {
    return "Strong fit";
  }

  if (leadScore >= 40) {
    return "Possible fit";
  }

  if (leadScore >= 15) {
    return "Weak fit";
  }

  return "Not enough data";
}

export function buildHubSpotAnalysisNoteBody(input: {
  profile: LinkedInProfile;
  analysis: ProfileAnalysis;
  generatedDm?: Partial<GeneratedDm> & Pick<GeneratedDm, "message">;
  userSettings?: UserSettings;
}): string {
  const profileUrl = getProfileUrl(input.profile);
  const evidence = dedupeNoteEvidence(input.analysis.scoreEvidence ?? []);
  const scoringMetadata = input.analysis.scoringMetadata;
  const outreachStrategy = safeOutreachStrategy(input.analysis);
  const analyzedAt = new Date().toISOString();
  const fitLabel = input.analysis.fitLabel ?? leadFitLabel(input.analysis.leadScore);
  const recommendedAction = normalizeRecommendedAction(input.analysis.recommendedAction, input.analysis.leadScore);
  const actionReason = cleanProperty(input.analysis.actionReason) ?? decisionReasonFallback(recommendedAction);

  return [
    `<strong>LinkedIn to HubSpot AI Assistant Summary</strong>`,
    noteSection("Profile", [
      noteRow("Name", input.profile.fullName),
      noteRow("LinkedIn", profileUrl),
      noteRow("Headline", input.profile.headline ?? input.profile.jobTitle),
      noteRow("Company", input.profile.companyName),
      noteRow("Current role", input.profile.currentRoleTitle ?? input.profile.jobTitle),
      noteRow("Location", input.profile.location)
    ]),
    noteSection("Seller Context", [
      noteRow("Active ICP summary", icpSummary(input.userSettings)),
      noteRow("Offer/product", input.userSettings?.sellerContext.productOrServiceName),
      noteRow("Offer target outcome", input.userSettings?.sellerContext.targetOutcome),
      noteRow("Preferred CTA", input.userSettings?.sellerContext.preferredCta)
    ]),
    noteSection("Lead Decision", [
      noteRow("ICP Fit Score", String(input.analysis.leadScore)),
      noteRow("ICP Fit Label", fitLabel),
      noteRow("Recommended Action", recommendedAction),
      noteRow("Action reason", actionReason),
      noteRow("Confidence", input.analysis.confidence),
      noteRow("Analysis depth", scoringMetadata?.analysisDepth),
      noteRow("Persona", input.analysis.persona)
    ]),
    noteSection("Score Evidence", [
      noteListRow("Positive signals", input.analysis.positiveSignals ?? []),
      noteListRow("Pain points", input.analysis.painPoints ?? []),
      noteListRow("Missing information", input.analysis.missingInformation ?? []),
      scoreEvidenceRow(
        "Confirmed positive evidence",
        evidence.filter((item) => item.signalType === "positive" && item.basis === "fact")
      ),
      scoreEvidenceRow("AI inferences", evidence.filter((item) => item.basis === "inference")),
      noteListRow("Risks / disqualifiers", [
        ...(input.analysis.riskWarnings ?? []),
        ...(input.analysis.negativeSignals ?? []),
        ...evidence.filter((item) => item.signalType === "disqualifier").map((item) => item.summary)
      ])
    ]),
    noteSection("Outreach Strategy", [
      noteRow("Why relevant", outreachStrategy.whyRelevant),
      noteRow("Best angle", outreachStrategy.bestAngle),
      noteRow("Pain hypothesis", outreachStrategy.painHypothesis),
      noteRow("What to avoid", outreachStrategy.whatToAvoid),
      noteRow("Suggested CTA", outreachStrategy.suggestedCTA)
    ]),
    noteSection("DM Drafts", [
      noteRow("Suggested DM", input.generatedDm?.message),
      dmVariantsRow(input.analysis.dmVariants ?? []),
      noteRow(
        "Personalization score",
        typeof input.generatedDm?.personalizationScore === "number" ? String(input.generatedDm.personalizationScore) : undefined
      ),
      noteRow("Spam risk", input.generatedDm?.spamRisk),
      noteListRow("DM warnings", input.generatedDm?.warnings ?? [])
    ]),
    noteSection("Next Step", [
      noteRow("Recommended next action", input.analysis.recommendedNextAction ?? recommendedAction)
    ]),
    noteSection("Metadata", [
      noteRow("Tool", "LinkedIn to HubSpot AI Assistant v0.4.0"),
      noteRow("Saved at", analyzedAt)
    ])
  ]
    .filter((section): section is string => Boolean(section))
    .join("<br><br>");
}

export function removeHubSpotProperties(
  properties: HubSpotContactProperties,
  propertyKeysToRemove: string[]
): HubSpotContactProperties {
  const blockedKeys = new Set(propertyKeysToRemove);
  return Object.fromEntries(Object.entries(properties).filter(([property]) => !blockedKeys.has(property)));
}

function mapStandardProfileProperties(profile: LinkedInProfile, lifecycleStage?: string): HubSpotContactProperties {
  const validation = validateLinkedInProfileIdentity(profile);
  if (!validation.ok) {
    throw new Error(validation.message);
  }

  const { firstName, lastName } = splitFullName(profile.fullName);
  if (!firstName) {
    throw new Error("Could not detect the LinkedIn profile name. Please make sure you are on a LinkedIn profile page and wait for the page to finish loading.");
  }

  const properties: HubSpotContactProperties = {
    firstname: firstName,
    hs_linkedin_url: getProfileUrl(profile)
  };

  const cleanedLastName = cleanProperty(lastName);
  const jobTitle = cleanProperty(profile.jobTitle) ?? cleanProperty(profile.headline);
  const company = cleanProperty(profile.companyName);
  const stage = cleanProperty(lifecycleStage);

  if (cleanedLastName) {
    properties.lastname = cleanedLastName;
  }

  if (jobTitle) {
    properties.jobtitle = jobTitle;
  }

  if (company) {
    properties.company = company;
  }

  if (stage) {
    properties.lifecyclestage = stage;
  }

  return properties;
}

function buildAiPropertyValues(analysis: ProfileAnalysis, generatedDm?: GeneratedDm): Partial<Record<HubSpotAiPropertyField, string>> {
  return {
    leadScore: String(analysis.leadScore),
    leadFit: analysis.fitLabel ?? leadFitLabel(analysis.leadScore),
    persona: analysis.persona,
    painPoints: analysis.painPoints.join("; "),
    icebreaker: analysis.icebreaker,
    suggestedDm: generatedDm?.message,
    nextAction: analysis.recommendedAction,
    personalizationScore: typeof generatedDm?.personalizationScore === "number" ? String(generatedDm.personalizationScore) : undefined,
    spamRisk: generatedDm?.spamRisk
  };
}

export function buildLhaPropertyValues(analysis: ProfileAnalysis, analyzedAt: string): HubSpotContactProperties {
  const outreachStrategy = safeOutreachStrategy(analysis);
  const mainRisk = analysis.riskWarnings?.[0] || outreachStrategy.whatToAvoid;

  return cleanPropertyRecord({
    lha_icp_fit_score: String(analysis.leadScore),
    lha_icp_fit_label: analysis.fitLabel ?? leadFitLabel(analysis.leadScore),
    lha_recommended_action: normalizeRecommendedAction(analysis.recommendedAction, analysis.leadScore),
    lha_confidence: String(confidenceAsNumber(analysis.confidence)),
    lha_outreach_angle: outreachStrategy.bestAngle,
    lha_main_reason: cleanProperty(analysis.actionReason) ?? outreachStrategy.whyRelevant,
    lha_main_risk: mainRisk,
    lha_missing_info: analysis.missingInformation?.join("; "),
    lha_last_analyzed_at: analyzedAt,
    lha_source: "LinkedIn"
  });
}

function safeOutreachStrategy(analysis: ProfileAnalysis): ProfileAnalysis["outreachStrategy"] {
  const strategy = analysis.outreachStrategy as Partial<ProfileAnalysis["outreachStrategy"]> | undefined;
  const fallback = "Not enough evidence";

  return {
    whyRelevant: cleanProperty(strategy?.whyRelevant) ?? cleanProperty(analysis.whyThisAngle) ?? fallback,
    bestAngle: cleanProperty(strategy?.bestAngle) ?? cleanProperty(analysis.recommendedOutreachAngle) ?? fallback,
    painHypothesis: cleanProperty(strategy?.painHypothesis) ?? cleanProperty(analysis.painPoints?.[0]) ?? fallback,
    whatToAvoid: cleanProperty(strategy?.whatToAvoid) ?? cleanProperty(analysis.whatToAvoid?.join("; ")) ?? fallback,
    suggestedCTA: cleanProperty(strategy?.suggestedCTA) ?? fallback
  };
}

function cleanPropertyRecord(values: Record<string, string | undefined>): HubSpotContactProperties {
  return Object.fromEntries(
    Object.entries(values)
      .map(([property, value]) => [property, cleanProperty(value)] as const)
      .filter((entry): entry is readonly [string, string] => Boolean(entry[1]))
  );
}

function confidenceAsNumber(confidence: ProfileAnalysis["confidence"]): number {
  if (confidence === "high") {
    return 100;
  }

  if (confidence === "medium") {
    return 60;
  }

  return 30;
}

function decisionReasonFallback(action: ProfileAnalysis["recommendedAction"]): string {
  if (action === "Pursue now") {
    return "Multiple visible ICP signals support timely outreach.";
  }

  if (action === "Research more") {
    return "Potential fit is visible, but important buying and company context is still missing.";
  }

  if (action === "Low priority") {
    return "The visible profile has limited evidence of fit with the saved ICP and Seller Context.";
  }

  return "The visible profile does not currently provide enough relevant evidence to justify outreach.";
}

function propertyDefinition(
  name: string,
  label: string,
  type: HubSpotContactPropertyDefinition["type"],
  fieldType: HubSpotContactPropertyDefinition["fieldType"]
): HubSpotContactPropertyDefinition {
  return {
    name,
    label,
    type,
    fieldType,
    groupName: "contactinformation",
    description: `${label} saved by LinkedIn to HubSpot AI Assistant.`
  };
}

function cleanPropertyName(value: string | undefined): string | undefined {
  const cleaned = cleanProperty(value);
  if (!cleaned || ["none", "disabled", "false", "off"].includes(cleaned.toLowerCase())) {
    return undefined;
  }

  return cleaned;
}

function isDisabledPropertyName(value: string | undefined): boolean {
  return ["none", "disabled", "false", "off"].includes(value?.trim().toLowerCase() ?? "");
}

function isTruthy(value: string | undefined): boolean {
  return ["1", "true", "yes", "on", "enabled"].includes(value?.trim().toLowerCase() ?? "");
}

function noteRow(label: string, value: string | undefined): string | null {
  const cleaned = cleanProperty(value);
  return cleaned ? `<strong>${escapeHtml(label)}:</strong> ${escapeHtml(cleaned)}` : null;
}

function noteSection(title: string, rows: Array<string | null>): string | null {
  const populatedRows = rows.filter((row): row is string => Boolean(row));
  if (!populatedRows.length) {
    return null;
  }

  return [`<strong>${escapeHtml(title)}</strong>`, ...populatedRows].join("<br>");
}

function noteListRow(label: string, values: string[] | undefined): string | null {
  const cleanedValues = values?.map(cleanProperty).filter((value): value is string => Boolean(value)) ?? [];
  if (!cleanedValues.length) {
    return null;
  }

  return `<strong>${escapeHtml(label)}:</strong><br>${cleanedValues
    .slice(0, 6)
    .map((value) => `- ${escapeHtml(truncateNoteText(value, 220))}`)
    .join("<br>")}`;
}

function scoreEvidenceRow(label: string, evidence: ScoreEvidence[]): string | null {
  if (!evidence.length) {
    return null;
  }

  return [
    `<strong>${escapeHtml(label)}:</strong>`,
    ...evidence.slice(0, 5).map((item) =>
      [
        `- ${escapeHtml(truncateNoteText(item.summary, 140))}`,
        item.evidenceText ? `Evidence: ${escapeHtml(truncateNoteText(item.evidenceText, 220))}` : "",
        `Source: ${escapeHtml(item.sourceSection.replace("_", " "))}`,
        `Basis: ${escapeHtml(item.basis === "inference" ? "AI inference - not confirmed" : "Fact")}`
      ]
        .filter(Boolean)
        .join("<br>")
    )
  ].join("<br>");
}

function truncateNoteText(value: string, maxLength: number): string {
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (cleaned.length <= maxLength) {
    return cleaned;
  }

  const availableLength = Math.max(1, maxLength - 3);
  const shortened = cleaned.slice(0, availableLength + 1);
  const sentenceEnd = Math.max(shortened.lastIndexOf(". "), shortened.lastIndexOf("! "), shortened.lastIndexOf("? "));
  if (sentenceEnd >= Math.floor(availableLength * 0.55)) {
    return `${shortened.slice(0, sentenceEnd + 1).trim()} ...`;
  }

  const wordEnd = shortened.lastIndexOf(" ", availableLength);
  const end = wordEnd >= Math.floor(availableLength * 0.55) ? wordEnd : availableLength;
  return `${shortened.slice(0, end).trimEnd()}...`;
}

function dedupeNoteEvidence(items: ScoreEvidence[]): ScoreEvidence[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.basis}:${item.summary.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()}`;
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function dmVariantsRow(
  variants: Array<{
    label: string;
    useCase: string;
    text: string;
    personalizationUsed?: string[];
    offerContextUsed?: string[];
    factsUsed?: string[];
    inferencesUsed?: string[];
    warnings?: string[];
    riskLevel: string;
  }>
): string | null {
  if (!variants.length) {
    return null;
  }

  return [
    `<strong>DM drafts:</strong>`,
    ...variants.map((variant, index) =>
      [
        `${index + 1}. <strong>${escapeHtml(variant.label)}</strong>`,
        `Use when: ${escapeHtml(variant.useCase)}`,
        `Risk: ${escapeHtml(variant.riskLevel)}`,
        `Text: ${escapeHtml(variant.text)}`,
        variant.personalizationUsed?.length ? `Personalization used: ${escapeHtml(variant.personalizationUsed.join("; "))}` : "",
        variant.offerContextUsed?.length ? `Offer context used: ${escapeHtml(variant.offerContextUsed.join("; "))}` : "",
        variant.factsUsed?.length ? `Facts used: ${escapeHtml(variant.factsUsed.join("; "))}` : "",
        variant.inferencesUsed?.length ? `AI inferences used: ${escapeHtml(variant.inferencesUsed.join("; "))}` : "",
        variant.warnings?.length ? `Warnings: ${escapeHtml(variant.warnings.join("; "))}` : ""
      ]
        .filter(Boolean)
        .join("<br>")
    )
  ].join("<br><br>");
}

function icpSummary(userSettings: UserSettings | undefined): string | undefined {
  if (!userSettings) {
    return undefined;
  }

  return [
    userSettings.targetRoles ? `Roles: ${userSettings.targetRoles}` : undefined,
    userSettings.targetIndustries ? `Industries: ${userSettings.targetIndustries}` : undefined,
    userSettings.targetCompanySize ? `Company size: ${userSettings.targetCompanySize}` : undefined,
    userSettings.mainPainPointsSolved ? `Pain points: ${userSettings.mainPainPointsSolved}` : undefined
  ]
    .filter((item): item is string => Boolean(item))
    .join(" | ");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
