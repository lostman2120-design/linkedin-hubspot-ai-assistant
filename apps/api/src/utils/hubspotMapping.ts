import type { GeneratedDm, LinkedInProfile, ProfileAnalysis, ScoreEvidence, UserSettings } from "@linkedin-hubspot-ai/shared";
import { UNABLE_TO_EXTRACT_FIELD, getProfileUrl, validateLinkedInProfileIdentity } from "@linkedin-hubspot-ai/shared";
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
  field: HubSpotAiPropertyField;
  property?: string;
  reason: string;
};

export type HubSpotContactSyncPayload = {
  properties: HubSpotContactProperties;
  standardPropertyKeys: string[];
  customPropertyKeys: string[];
  skippedProperties: SkippedHubSpotProperty[];
};

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
}): HubSpotContactSyncPayload {
  const standardProperties = mapStandardProfileProperties(input.profile, input.lifecycleStage);
  const customProperties: HubSpotContactProperties = {};
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
  }

  return {
    properties: {
      ...standardProperties,
      ...customProperties
    },
    standardPropertyKeys: Object.keys(standardProperties),
    customPropertyKeys: Object.keys(customProperties),
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
  const evidence = input.analysis.scoreEvidence ?? [];
  const scoringMetadata = input.analysis.scoringMetadata;
  const rows = [
    `<strong>LinkedIn to HubSpot AI Assistant Summary</strong>`,
    noteRow("Name", input.profile.fullName),
    noteRow("LinkedIn", profileUrl),
    noteRow("Headline", input.profile.headline ?? input.profile.jobTitle),
    noteRow("Company", input.profile.companyName),
    noteRow("Location", input.profile.location),
    noteRow("Current role", input.profile.currentRoleTitle),
    noteRow("Current role context", input.profile.currentRoleDescription),
    noteRow("About", input.profile.about),
    noteRow("Active ICP summary", icpSummary(input.userSettings)),
    noteRow("Offer/product", input.userSettings?.sellerContext.productOrServiceName),
    noteRow("Offer target outcome", input.userSettings?.sellerContext.targetOutcome),
    noteRow("Preferred CTA", input.userSettings?.sellerContext.preferredCta),
    noteRow("Lead score", `${input.analysis.leadScore} (${input.analysis.fitLabel ?? leadFitLabel(input.analysis.leadScore)})`),
    noteRow("ICP fit label", input.analysis.fitLabel ?? leadFitLabel(input.analysis.leadScore)),
    noteRow("Confidence", input.analysis.confidence),
    noteRow("Analysis depth", scoringMetadata?.analysisDepth),
    noteRow(
      "Evidence counts",
      scoringMetadata
        ? `Facts: ${scoringMetadata.factsUsedCount}; Inferences: ${scoringMetadata.inferencesUsedCount}; Missing: ${scoringMetadata.missingCriteriaCount}; Disqualifiers: ${scoringMetadata.disqualifierCount}`
        : undefined
    ),
    noteRow("Persona", input.analysis.persona),
    noteListRow("Positive signals", input.analysis.positiveSignals ?? []),
    noteListRow("Negative signals", input.analysis.negativeSignals ?? []),
    noteListRow("Missing information", input.analysis.missingInformation ?? []),
    noteListRow("Risk warnings", input.analysis.riskWarnings ?? []),
    scoreEvidenceRow("Confirmed positive evidence", evidence.filter((item) => item.signalType === "positive" && item.basis === "fact")),
    scoreEvidenceRow("Confirmed negative evidence", evidence.filter((item) => item.signalType === "negative" && item.basis === "fact")),
    scoreEvidenceRow("Missing evidence", evidence.filter((item) => item.signalType === "missing")),
    scoreEvidenceRow("Disqualifiers", evidence.filter((item) => item.signalType === "disqualifier")),
    scoreEvidenceRow("AI inferences", evidence.filter((item) => item.basis === "inference")),
    noteListRow("Pain points", input.analysis.painPoints),
    noteRow("Icebreaker", input.analysis.icebreaker),
    noteRow("Recommended outreach angle", input.analysis.recommendedOutreachAngle),
    noteRow("Why this angle", input.analysis.whyThisAngle),
    noteListRow("What to avoid", input.analysis.whatToAvoid ?? []),
    noteRow("Suggested DM", input.generatedDm?.message),
    dmVariantsRow(input.analysis.dmVariants ?? []),
    noteRow("Next action", input.analysis.recommendedAction),
    noteRow("Recommended next action", input.analysis.recommendedNextAction),
    noteRow(
      "Personalization score",
      typeof input.generatedDm?.personalizationScore === "number" ? String(input.generatedDm.personalizationScore) : undefined
    ),
    noteRow("Spam risk", input.generatedDm?.spamRisk),
    noteListRow("DM warnings", input.generatedDm?.warnings ?? []),
    noteRow("Context confidence", input.profile.contextConfidence),
    noteRow("Tool", "LinkedIn to HubSpot AI Assistant v0.3.0"),
    noteRow("Saved at", new Date().toISOString())
  ].filter((row): row is string => Boolean(row));

  return rows.join("<br>");
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

function noteListRow(label: string, values: string[] | undefined): string | null {
  const cleanedValues = values?.map(cleanProperty).filter((value): value is string => Boolean(value)) ?? [];
  if (!cleanedValues.length) {
    return null;
  }

  return `<strong>${escapeHtml(label)}:</strong><br>${cleanedValues.map((value) => `- ${escapeHtml(value)}`).join("<br>")}`;
}

function scoreEvidenceRow(label: string, evidence: ScoreEvidence[]): string | null {
  if (!evidence.length) {
    return null;
  }

  return [
    `<strong>${escapeHtml(label)}:</strong>`,
    ...evidence.slice(0, 8).map((item) =>
      [
        `- ${escapeHtml(item.summary)}`,
        item.evidenceText ? `Evidence: ${escapeHtml(item.evidenceText)}` : "",
        `Source: ${escapeHtml(item.sourceSection.replace("_", " "))}`,
        `Basis: ${escapeHtml(item.basis === "inference" ? "AI inference - not confirmed" : "Fact")}`
      ]
        .filter(Boolean)
        .join("<br>")
    )
  ].join("<br>");
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
