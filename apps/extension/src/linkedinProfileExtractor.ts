import type { LinkedInProfile, LinkedInVisibleProfileContext } from "@linkedin-hubspot-ai/shared";
import {
  compactLinkedInProfile,
  isInvalidContactName,
  splitProfileName,
  validateLinkedInProfileIdentity
} from "@linkedin-hubspot-ai/shared";

declare const __PROFILE_EXTRACTION_DEBUG__: boolean | undefined;

const TEXT_SAMPLE_LIMIT = 1800;
const ABOUT_LIMIT = 900;
const RAW_CONTEXT_LIMIT = 3600;
const MAX_CANDIDATES_PER_SOURCE = 8;

type ExtractionConfidence = "high" | "medium" | "low";

type TextCandidate = {
  source: string;
  value: string;
};

export type ExtractionCandidateEvaluation = TextCandidate & {
  accepted: boolean;
  reason: string;
};

type SelectedCandidate = {
  value?: string;
  source?: string;
  confidence?: ExtractionConfidence;
  candidates: ExtractionCandidateEvaluation[];
};

type ExtractionResult = {
  profile: LinkedInProfile;
  sources: Record<string, string | undefined>;
  candidates: {
    fullName: ExtractionCandidateEvaluation[];
    headline: ExtractionCandidateEvaluation[];
  };
};

type DebugWindow = Window & {
  __LH_AI_DEBUG_EXTRACTION__?: boolean;
  LIH_DEBUG_PROFILE_EXTRACTION?: () => {
    url: string;
    title: string;
    candidates: ExtractionResult["candidates"];
    finalProfile: LinkedInProfile;
    extractionWarnings: string[];
  };
  __linkedinHubSpotAiDebugProfileExtraction?: () => {
    url: string;
    title: string;
    candidates: ExtractionResult["candidates"];
    finalProfile: LinkedInProfile;
    extractionWarnings: string[];
  };
};

type SectionLabel = "About" | "Experience" | "Education" | "Skills" | "Activity";

const boilerplateLinePattern =
  /^(show more|show less|see more|see less|connect|message|follow|following|more|save|send profile in a message|contact info|open to|view .* profile|activate to view larger image|image|premium|try premium|join now|sign in)$/i;

const invalidNameLabels = new Set([
  "about",
  "activity",
  "company",
  "contact info",
  "experience",
  "feed",
  "home",
  "jobs",
  "linkedin",
  "messaging",
  "my network",
  "n/a",
  "notifications",
  "people",
  "posts",
  "profile",
  "search",
  "unknown",
  "unable to extract this field"
]);

const companyNamePattern =
  /\b(agency|association|bank|capital|college|company|consulting|corp|corporation|foundation|gmbh|group|inc|institute|labs|llc|ltd|partners|school|software|solutions|studio|studios|systems|technologies|technology|university|ventures)\b/i;

export function isLinkedInProfilePage(url = window.location.href): boolean {
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.hostname.endsWith("linkedin.com") && /^\/in\/[^/]+\/?/.test(parsedUrl.pathname);
  } catch {
    return false;
  }
}

export function normalizeText(value: string | undefined | null): string {
  return (value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const uniqueValues: string[] = [];

  for (const value of values) {
    const normalizedValue = normalizeText(value);
    if (!normalizedValue || seen.has(normalizedValue)) {
      continue;
    }

    seen.add(normalizedValue);
    uniqueValues.push(normalizedValue);
  }

  return uniqueValues;
}

export function dedupeProfileText(text: string): string {
  const uniqueLines = uniqueStrings(
    text
      .replace(/\u00a0/g, " ")
      .split(/\r?\n/)
      .map(removeDuplicateConsecutiveSegments)
  );

  return uniqueLines.join("\n");
}

export function parseFullNameFromDocumentTitle(title: string): string | undefined {
  const cleanedTitle = cleanLinkedInTitle(title);
  if (!cleanedTitle) {
    return undefined;
  }

  const separatorMatch = cleanedTitle.match(/\s[-–—]\s/);
  const nameCandidate = separatorMatch ? cleanedTitle.slice(0, separatorMatch.index).trim() : cleanedTitle;
  const sanitizedCandidate = sanitizeFullNameCandidate(nameCandidate);

  if (
    !sanitizedCandidate ||
    invalidNameLabels.has(sanitizedCandidate.toLowerCase()) ||
    isInvalidContactName(sanitizedCandidate) ||
    looksLikeMultiFieldText(sanitizedCandidate) ||
    looksLikeCompanyName(sanitizedCandidate) ||
    !hasReasonableNameShape(sanitizedCandidate)
  ) {
    return undefined;
  }

  return sanitizedCandidate;
}

export function parseHeadlineFromDocumentTitle(title: string): string | undefined {
  const cleanedTitle = cleanLinkedInTitle(title);
  const separatorMatch = cleanedTitle.match(/\s[-–—]\s/);

  if (!cleanedTitle || !separatorMatch || separatorMatch.index === undefined) {
    return undefined;
  }

  return cleanSingleLineField(cleanedTitle.slice(separatorMatch.index + separatorMatch[0].length));
}

export function debugLinkedInProfileExtraction() {
  const result = buildLinkedInProfile();
  const debugResult = {
    url: window.location.href,
    title: document.title,
    candidates: result.candidates,
    finalProfile: result.profile,
    extractionWarnings: result.profile.extractionWarnings ?? []
  };
  console.log("[linkedinProfileExtractor] Debug extraction candidates.", debugResult);
  return debugResult;
}

export function getCurrentLinkedInProfileUrl(): string {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  return url.toString();
}

export function extractLinkedInProfile(): LinkedInProfile {
  const result = buildLinkedInProfile();
  logExtractedProfile(result);
  installDebugHelper();
  return result.profile;
}

function buildLinkedInProfile(): ExtractionResult {
  // LinkedIn safety: extraction is limited to text that is already visible in the current DOM.
  // This code never clicks "see more", never navigates, never reads storage/cookies, and never scrapes hidden data.
  const profileUrl = getCurrentLinkedInProfileUrl();
  const linkedinUrl = profileUrl;

  if (!isLinkedInProfilePage()) {
    const profile = compactLinkedInProfile({
      fullName: "",
      profileUrl,
      linkedinUrl,
      extractionConfidence: "low",
      extractionSources: {},
      visibleTextSample: visibleSample()
    } satisfies LinkedInProfile);

    return {
      profile,
      sources: {},
      candidates: {
        fullName: [],
        headline: []
      }
    };
  }

  const rawCompanyName = pickFirstVisibleValue([
    ...candidatesFromSelectors(
      [
        "main [data-view-name='profile-top-card'] button[aria-label*='Current company'] span",
        "main [data-view-name='profile-top-card'] button[aria-label*='Current company']",
        "main section:first-of-type button[aria-label*='Current company'] span",
        "main section:first-of-type button[aria-label*='Current company']",
        "main [data-view-name='profile-top-card'] a[href*='/company/'] span",
        "main [data-view-name='profile-top-card'] a[href*='/company/']",
        "main section:first-of-type a[href*='/company/'] span",
        "main section:first-of-type a[href*='/company/']",
        "section:has(#experience) a[href*='/company/'] span",
        "section:has(#experience) a[href*='/company/']",
        "[data-field='experience_company_logo'] span",
        ".pv-text-details__right-panel a[href*='/company/']",
        "a[href*='/company/'] span[aria-hidden='true']",
        "a[href*='/company/']"
      ],
      "company selector"
    )
  ]);
  const companyName = cleanCompanyField(rawCompanyName?.value);

  const fullNameSelection = selectFirstAcceptedCandidate(
    [
      ...candidatesFromSelectors(
        [
          "main [data-view-name='profile-top-card'] h1",
          "main section:first-of-type h1",
          "main h1.text-heading-xlarge",
          "main h1.inline.t-24",
          "main .pv-top-card h1",
          "[class*='pv-top-card'] h1",
          ".pv-text-details__left-panel h1",
          ".mt2.relative h1",
          ".ph5 h1",
          "main h1",
          "section h1",
          "main [data-anonymize='person-name']"
        ],
        "name selector"
      ),
      ...attributeCandidatesFromSelectors(
        [
          "main [data-view-name='profile-top-card'] h1[aria-label]",
          "main section:first-of-type h1[aria-label]",
          "main h1[aria-label]",
          "main [data-anonymize='person-name'][aria-label]"
        ],
        "aria-label",
        "aria-label"
      ),
      ...lineCandidatesFromTopCard(),
      ...documentTitleNameCandidates()
    ],
    (candidate) => evaluateFullNameCandidate(candidate, companyName)
  );

  const fullName = fullNameSelection.value ?? "";
  const splitName = splitProfileName(fullName);

  const headlineSelection = selectFirstAcceptedCandidate(
    [
      ...candidatesFromSelectors(
        [
          "main [data-view-name='profile-top-card'] .text-body-medium.break-words",
          "main [data-view-name='profile-top-card'] div.text-body-medium",
          "main section:first-of-type .text-body-medium.break-words",
          "main section:first-of-type div[class*='text-body-medium']",
          ".pv-text-details__left-panel .text-body-medium",
          "[class*='pv-top-card'] .text-body-medium",
          "section div.text-body-medium"
        ],
        "headline selector"
      ),
      ...headlineLineCandidatesNearName(),
      ...documentTitleHeadlineCandidates()
    ],
    (candidate) => evaluateHeadlineCandidate(candidate, fullName, companyName)
  );

  const headline = headlineSelection.value;
  const inferredCompanyName = companyName ?? inferCompanyFromHeadline(headline);
  const locationField = pickFirstVisibleValue(
    candidatesFromSelectors(
      [
        "main [data-view-name='profile-top-card'] .text-body-small.inline.t-black--light.break-words",
        "main [data-view-name='profile-top-card'] span.text-body-small",
        "main section:first-of-type .text-body-small.inline.t-black--light.break-words",
        "main section:first-of-type span[class*='text-body-small']",
        ".pv-text-details__left-panel span.text-body-small",
        "[class*='pv-top-card'] span.text-body-small",
        ".pv-top-card--list-bullet span"
      ],
      "location selector"
    )
  );
  const jobTitleField = pickFirstVisibleValue(
    candidatesFromSelectors(
      [
        "section:has(#experience) [data-view-name='profile-component-entity'] span[aria-hidden='true']",
        "[data-view-name='profile-component-entity'] div[aria-hidden='true']",
        "#experience ~ * span[aria-hidden='true']",
        "section:has(#experience) span[aria-hidden='true']"
      ],
      "job title selector"
    )
  );

  const extractionSources = compactSources({
    fullName: fullNameSelection.source,
    headline: headlineSelection.source,
    companyName: rawCompanyName?.source ?? (inferredCompanyName ? "headline inference" : undefined),
    jobTitle: jobTitleField?.source ?? (headline ? "headline inference" : undefined),
    location: locationField?.source
  });
  const about = cleanMultilineField(extractAbout());
  const currentRoleTitle = cleanSingleLineField(jobTitleField?.value) ?? inferJobTitleFromHeadline(headline);
  const location = cleanSingleLineField(locationField?.value);
  const context = buildVisibleProfileContext({
    fullName,
    firstName: splitName.firstName || undefined,
    lastName: splitName.lastName,
    headline,
    companyName: inferredCompanyName,
    currentRoleTitle,
    location,
    profileUrl,
    about,
    extractionSources,
    identityConfidence: fullNameSelection.confidence ?? "low",
    headlineConfidence: headlineSelection.confidence ?? "low"
  });

  const profile = compactLinkedInProfile({
    fullName,
    firstName: splitName.firstName || undefined,
    lastName: splitName.lastName,
    headline,
    companyName: inferredCompanyName,
    jobTitle: currentRoleTitle,
    location,
    profileUrl,
    linkedinUrl,
    extractionConfidence: fullNameSelection.confidence ?? "low",
    extractionSources,
    extractionWarnings: context.extractionWarnings,
    contextConfidence: context.contextConfidence,
    about,
    currentRoleTitle: context.currentRole?.title,
    currentRoleCompany: context.currentRole?.company,
    currentRoleDescription: context.currentRole?.description,
    profileLanguage: context.profileLanguage,
    visibleProfileContext: context,
    visibleTextSample: context.rawVisibleContext || visibleSample()
  } satisfies LinkedInProfile);

  return {
    profile,
    sources: extractionSources,
    candidates: {
      fullName: fullNameSelection.candidates,
      headline: headlineSelection.candidates
    }
  };
}

function buildVisibleProfileContext(input: {
  fullName: string;
  firstName?: string;
  lastName?: string;
  headline?: string;
  companyName?: string;
  currentRoleTitle?: string;
  location?: string;
  profileUrl: string;
  about?: string;
  extractionSources: Record<string, string>;
  identityConfidence: ExtractionConfidence;
  headlineConfidence: ExtractionConfidence;
}): LinkedInVisibleProfileContext {
  const about = input.about ?? extractSectionText("About", ABOUT_LIMIT);
  const experienceItems = extractSectionItems("Experience", 8);
  const educationItems = extractSectionItems("Education", 6);
  const skillsItems = extractSectionItems("Skills", 12);
  const activityItems = extractSectionItems("Activity", 5);
  const currentRoleDescription = experienceItems[0];
  const extractionWarnings = buildExtractionWarnings({
    headline: input.headline,
    about,
    experienceItems,
    identityConfidence: input.identityConfidence
  });
  const contextConfidence = contextConfidenceFor({
    about,
    experienceItems,
    headline: input.headline,
    fullName: input.fullName
  });
  const rawVisibleContext = buildRawVisibleContext({
    fullName: input.fullName,
    headline: input.headline,
    companyName: input.companyName,
    location: input.location,
    profileUrl: input.profileUrl,
    about,
    experienceItems,
    educationItems,
    skillsItems,
    activityItems
  });

  return {
    identity: {
      fullName: input.fullName || undefined,
      firstName: input.firstName,
      lastName: input.lastName,
      headline: input.headline,
      location: input.location,
      profileUrl: input.profileUrl
    },
    currentRole: {
      title: input.currentRoleTitle,
      company: input.companyName,
      description: currentRoleDescription
    },
    about: about ? { text: about, source: "visible About section" } : undefined,
    experience: { visibleItems: experienceItems },
    education: { visibleItems: educationItems },
    skills: { visibleItems: skillsItems },
    activity: { visibleSnippets: activityItems },
    rawVisibleContext,
    extractionSources: input.extractionSources,
    extractionWarnings,
    identityConfidence: input.identityConfidence,
    headlineConfidence: input.headlineConfidence,
    contextConfidence,
    profileLanguage: detectProfileLanguage()
  };
}

function normalizeMultilineText(value: string | undefined | null): string {
  return dedupeProfileText(
    (value ?? "")
      .replace(/\u00a0/g, " ")
      .split(/\r?\n/)
      .map((line) => line.replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .join("\n")
  );
}

function isVisibleElement(element: Element): boolean {
  if (!(element instanceof HTMLElement)) {
    return false;
  }

  if (element.hidden) {
    return false;
  }

  const style = window.getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) {
    return false;
  }

  if (element.getClientRects().length > 0) {
    return true;
  }

  return Array.from(element.children).some((child) => child instanceof HTMLElement && child.getClientRects().length > 0);
}

function safeQuerySelectorAll(selector: string): Element[] {
  try {
    return Array.from(document.querySelectorAll(selector));
  } catch {
    return [];
  }
}

function visibleTextForElement(element: Element): string {
  if (!isVisibleElement(element)) {
    return "";
  }

  const visibleText = (element as HTMLElement).innerText || element.textContent || "";
  return normalizeText(dedupeProfileText(visibleText));
}

function candidatesFromSelectors(selectors: string[], sourcePrefix: string): TextCandidate[] {
  const candidates: TextCandidate[] = [];

  for (const selector of selectors) {
    const elements = safeQuerySelectorAll(selector).slice(0, MAX_CANDIDATES_PER_SOURCE);
    for (const element of elements) {
      const text = visibleTextForElement(element);
      if (text) {
        candidates.push({ source: `${sourcePrefix}: ${selector}`, value: text });
      }
    }
  }

  return uniqueCandidates(candidates);
}

function attributeCandidatesFromSelectors(selectors: string[], attribute: string, sourcePrefix: string): TextCandidate[] {
  const candidates: TextCandidate[] = [];

  for (const selector of selectors) {
    const elements = safeQuerySelectorAll(selector).slice(0, MAX_CANDIDATES_PER_SOURCE);
    for (const element of elements) {
      if (!isVisibleElement(element)) {
        continue;
      }

      const value = normalizeText(element.getAttribute(attribute));
      if (value) {
        candidates.push({ source: `${sourcePrefix}: ${selector}`, value });
      }
    }
  }

  return uniqueCandidates(candidates);
}

function uniqueCandidates(candidates: TextCandidate[]): TextCandidate[] {
  const seen = new Set<string>();
  const uniqueCandidatesList: TextCandidate[] = [];

  for (const candidate of candidates) {
    const value = normalizeText(candidate.value);
    const key = `${candidate.source}|${value}`;
    if (!value || seen.has(key)) {
      continue;
    }

    seen.add(key);
    uniqueCandidatesList.push({ ...candidate, value });
  }

  return uniqueCandidatesList;
}

function profileHeaderContainers(): Array<{ selector: string; element: HTMLElement }> {
  const selectors = [
    "main [data-view-name='profile-top-card']",
    "main section:first-of-type",
    "main .pv-top-card",
    ".pv-text-details__left-panel"
  ];

  const containers: Array<{ selector: string; element: HTMLElement }> = [];
  const seen = new Set<Element>();

  for (const selector of selectors) {
    for (const element of safeQuerySelectorAll(selector)) {
      if (element instanceof HTMLElement && !seen.has(element) && isVisibleElement(element)) {
        seen.add(element);
        containers.push({ selector, element });
      }
    }
  }

  return containers;
}

function lineCandidatesFromTopCard(): TextCandidate[] {
  const candidates: TextCandidate[] = [];

  for (const container of profileHeaderContainers()) {
    const lines = visibleLines(container.element).slice(0, 12);
    lines.forEach((line, index) => {
      candidates.push({ source: `top-card line ${index + 1}: ${container.selector}`, value: line });
    });
  }

  return uniqueCandidates(candidates);
}

function headlineLineCandidatesNearName(): TextCandidate[] {
  const candidates: TextCandidate[] = [];

  for (const container of profileHeaderContainers()) {
    const lines = visibleLines(container.element).slice(0, 12);
    lines.forEach((line, index) => {
      candidates.push({ source: `top-card headline line ${index + 1}: ${container.selector}`, value: line });
    });
  }

  return uniqueCandidates(candidates);
}

function visibleLines(element: HTMLElement): string[] {
  const text = normalizeMultilineText(element.innerText || element.textContent || "");
  return uniqueStrings(text.split(/\r?\n/).map(cleanSingleLineField).filter((line): line is string => Boolean(line)));
}

function documentTitleNameCandidates(): TextCandidate[] {
  const name = parseFullNameFromDocumentTitle(document.title);
  return name ? [{ source: "document.title", value: name }] : [];
}

function documentTitleHeadlineCandidates(): TextCandidate[] {
  const headline = parseHeadlineFromDocumentTitle(document.title);
  return headline ? [{ source: "document.title headline", value: headline }] : [];
}

function selectFirstAcceptedCandidate(
  candidates: TextCandidate[],
  evaluate: (candidate: TextCandidate) => ExtractionCandidateEvaluation
): SelectedCandidate {
  const evaluations = uniqueCandidates(candidates).map(evaluate);
  const acceptedCandidate = evaluations.find((candidate) => candidate.accepted);

  return {
    value: acceptedCandidate?.value,
    source: acceptedCandidate?.source,
    confidence: acceptedCandidate ? confidenceForSource(acceptedCandidate.source) : "low",
    candidates: evaluations
  };
}

function confidenceForSource(source: string): ExtractionConfidence {
  if (source.startsWith("document.title")) {
    return "medium";
  }

  if (source.startsWith("top-card line")) {
    return "medium";
  }

  return "high";
}

function evaluateFullNameCandidate(candidate: TextCandidate, companyName: string | undefined): ExtractionCandidateEvaluation {
  const value = sanitizeFullNameCandidate(candidate.value);

  if (!value) {
    return rejected(candidate, "empty after cleanup");
  }

  const normalizedValue = value.toLowerCase();
  if (invalidNameLabels.has(normalizedValue)) {
    return rejected({ ...candidate, value }, "navigation or placeholder label");
  }

  if (isInvalidContactName(value, companyName)) {
    return rejected({ ...candidate, value }, "not a valid contact name");
  }

  if (looksLikeMultiFieldText(value)) {
    return rejected({ ...candidate, value }, "looks like headline or multi-field text");
  }

  if (looksLikeCompanyName(value)) {
    return rejected({ ...candidate, value }, "looks like a company name");
  }

  if (!hasReasonableNameShape(value)) {
    return rejected({ ...candidate, value }, "does not look like a person name");
  }

  return { source: candidate.source, value, accepted: true, reason: "accepted" };
}

function evaluateHeadlineCandidate(
  candidate: TextCandidate,
  fullName: string | undefined,
  companyName: string | undefined
): ExtractionCandidateEvaluation {
  const value = cleanSingleLineField(candidate.value);

  if (!value) {
    return rejected(candidate, "empty after cleanup");
  }

  const normalizedValue = value.toLowerCase();
  if (invalidNameLabels.has(normalizedValue)) {
    return rejected({ ...candidate, value }, "navigation or placeholder label");
  }

  if (fullName && normalizedValue === fullName.toLowerCase()) {
    return rejected({ ...candidate, value }, "same as full name");
  }

  if (companyName && normalizedValue === companyName.toLowerCase()) {
    return rejected({ ...candidate, value }, "same as company name");
  }

  if (value.length > 220 || /\b(followers|connections|contact info|message|connect)\b/i.test(value)) {
    return rejected({ ...candidate, value }, "not a headline");
  }

  return { source: candidate.source, value, accepted: true, reason: "accepted" };
}

function rejected(candidate: TextCandidate, reason: string): ExtractionCandidateEvaluation {
  return {
    source: candidate.source,
    value: normalizeText(candidate.value),
    accepted: false,
    reason
  };
}

function sanitizeFullNameCandidate(value: string | undefined): string {
  let cleanedValue = cleanSingleLineField(value) ?? "";

  const profileLabelMatch = cleanedValue.match(/^view\s+(.+?)(?:'s|’s)\s+profile$/i);
  if (profileLabelMatch?.[1]) {
    cleanedValue = profileLabelMatch[1];
  }

  return normalizeText(
    cleanedValue
      .replace(/\b(?:1st|2nd|3rd|\d+(?:st|nd|rd|th))\+?$/i, "")
      .replace(/\b(?:connect|follow|message|more)\b$/i, "")
      .replace(/\s+/g, " ")
  );
}

function cleanLinkedInTitle(title: string): string {
  return normalizeText(
    title
      .replace(/^\(\d+\)\s*/, "")
      .replace(/\|\s*LinkedIn.*$/i, "")
      .replace(/\bLinkedIn\s*$/i, "")
  );
}

function looksLikeMultiFieldText(value: string): boolean {
  return /[\r\n]|(\s[|•]\s)|(\s-\s.+\s-\s)|\b(at|with)\b.+\b(company|foundation|inc|llc|ltd|corp)\b/i.test(value);
}

function looksLikeCompanyName(value: string): boolean {
  return companyNamePattern.test(value) && !/\b(jr|sr|ii|iii|iv|phd|md)\b/i.test(value);
}

function hasReasonableNameShape(value: string): boolean {
  if (!/[\p{L}]/u.test(value) || /https?:|www\.|@/.test(value)) {
    return false;
  }

  const tokens = value.split(/\s+/).filter(Boolean);
  if (tokens.length === 0 || tokens.length > 8 || value.length > 80) {
    return false;
  }

  return tokens.some((token) => /[\p{L}]{2,}/u.test(token) || /^[A-Z]\.$/.test(token));
}

function pickFirstVisibleValue(candidates: TextCandidate[]): TextCandidate | undefined {
  return uniqueCandidates(candidates).find((candidate) => Boolean(cleanSingleLineField(candidate.value)));
}

function visibleSections(): HTMLElement[] {
  return safeQuerySelectorAll("main section").filter((element): element is HTMLElement => element instanceof HTMLElement && isVisibleElement(element));
}

function extractAbout(): string | undefined {
  const aboutAnchor = document.querySelector("#about");
  const possibleSections = [
    aboutAnchor?.closest("section"),
    ...safeQuerySelectorAll("section:has(#about)"),
    ...visibleSections().filter((section) => /^About\b/i.test(normalizeText(section.innerText).slice(0, 120)))
  ].filter(Boolean) as HTMLElement[];

  for (const section of possibleSections) {
    const text = normalizeText(dedupeProfileText(visibleTextForElement(section)))
      .replace(/^About\s*/i, "")
      .replace(/\bsee more\b/gi, "")
      .replace(/\bshow more\b/gi, "")
      .replace(/\bshow less\b/gi, "")
      .replace(/\s+/g, " ")
      .trim();

    if (text && text.length > 10) {
      return text.slice(0, ABOUT_LIMIT);
    }
  }

  return undefined;
}

function extractSectionText(label: SectionLabel, limit: number): string | undefined {
  const section = findVisibleSectionByLabel(label);
  if (!section) {
    return undefined;
  }

  const cleanedLines = cleanContextLines(visibleLines(section)).filter((line) => line.toLowerCase() !== label.toLowerCase());
  const text = dedupeProfileText(cleanedLines.join("\n")).slice(0, limit).trim();
  return text || undefined;
}

function extractSectionItems(label: SectionLabel, maxItems: number): string[] {
  const sectionText = extractSectionText(label, label === "Skills" ? 700 : 1200);
  if (!sectionText) {
    return [];
  }

  return uniqueStrings(sectionText.split(/\r?\n/).map(cleanContextLine).filter((line): line is string => Boolean(line))).slice(0, maxItems);
}

function findVisibleSectionByLabel(label: SectionLabel): HTMLElement | undefined {
  const anchor = document.querySelector(`#${label.toLowerCase()}`);
  const anchorSection = anchor?.closest("section");
  if (anchorSection instanceof HTMLElement && isVisibleElement(anchorSection)) {
    return anchorSection;
  }

  return visibleSections().find((section) => {
    const lines = visibleLines(section).slice(0, 8).map((line) => line.toLowerCase());
    return lines.some((line) => line === label.toLowerCase() || line.startsWith(`${label.toLowerCase()} `));
  });
}

function cleanContextLines(lines: string[]): string[] {
  return uniqueStrings(lines.map(cleanContextLine).filter((line): line is string => Boolean(line)));
}

function cleanContextLine(value: string | undefined): string | undefined {
  const cleaned = cleanSingleLineField(value)
    ?.replace(/\b(show more|show less|see more|see less)\b/gi, "")
    .replace(/\b\d+(?:st|nd|rd|th)\b/g, "")
    .trim();

  if (!cleaned || boilerplateLinePattern.test(cleaned) || /^(followers|connections)\b/i.test(cleaned)) {
    return undefined;
  }

  if (/^\d+ followers$/i.test(cleaned) || /^\d+ connections$/i.test(cleaned)) {
    return undefined;
  }

  return cleaned;
}

function buildExtractionWarnings(input: {
  headline?: string;
  about?: string;
  experienceItems: string[];
  identityConfidence: ExtractionConfidence;
}): string[] {
  const warnings: string[] = [];

  if (input.identityConfidence === "low") {
    warnings.push("Profile identity confidence is low.");
  }

  if (!input.headline) {
    warnings.push("Profile headline was not detected.");
  }

  if (!input.about && input.experienceItems.length === 0) {
    warnings.push("Limited profile context detected. AI score may be less accurate.");
  }

  return warnings;
}

function contextConfidenceFor(input: {
  about?: string;
  experienceItems: string[];
  headline?: string;
  fullName: string;
}): ExtractionConfidence {
  const signalCount = [input.fullName, input.headline, input.about, ...input.experienceItems.slice(0, 2)].filter(Boolean).length;

  if (signalCount >= 4) {
    return "high";
  }

  if (signalCount >= 2) {
    return "medium";
  }

  return "low";
}

function buildRawVisibleContext(input: {
  fullName: string;
  headline?: string;
  companyName?: string;
  location?: string;
  profileUrl: string;
  about?: string;
  experienceItems: string[];
  educationItems: string[];
  skillsItems: string[];
  activityItems: string[];
}): string | undefined {
  const sections = [
    ["Name", input.fullName],
    ["Headline", input.headline],
    ["Company", input.companyName],
    ["Location", input.location],
    ["LinkedIn URL", input.profileUrl],
    ["About", input.about],
    ["Experience", input.experienceItems.join("\n")],
    ["Education", input.educationItems.join("\n")],
    ["Skills", input.skillsItems.join("\n")],
    ["Activity", input.activityItems.join("\n")]
  ]
    .map(([label, value]) => {
      const cleaned = normalizeMultilineText(value);
      return cleaned ? `${label}:\n${cleaned}` : "";
    })
    .filter(Boolean);

  return dedupeProfileText(sections.join("\n\n")).slice(0, RAW_CONTEXT_LIMIT).trim() || undefined;
}

function detectProfileLanguage(): string | undefined {
  return document.documentElement.lang || undefined;
}

function inferCompanyFromHeadline(headline: string | undefined): string | undefined {
  if (!headline) {
    return undefined;
  }

  const match = headline.match(/\bat\s+([^|,\u2022]+)/i);
  return normalizeText(dedupeProfileText(match?.[1] ?? "")) || undefined;
}

function inferJobTitleFromHeadline(headline: string | undefined): string | undefined {
  if (!headline) {
    return undefined;
  }

  const [beforeAt] = headline.split(/\bat\s+/i);
  return normalizeText(dedupeProfileText(beforeAt)) || undefined;
}

function visibleSample(): string | undefined {
  const source = document.querySelector("main") ?? document.body;
  const sample = dedupeProfileText(normalizeMultilineText((source as HTMLElement | undefined)?.innerText)).slice(0, TEXT_SAMPLE_LIMIT);
  return sample || undefined;
}

function logExtractedProfile(result: ExtractionResult): void {
  const validation = validateLinkedInProfileIdentity(result.profile);
  console.log("[linkedinProfileExtractor] Extracted visible LinkedIn profile fields.", {
    fullName: result.profile.fullName || undefined,
    headline: result.profile.headline,
    companyName: result.profile.companyName,
    location: result.profile.location,
    profileUrl: result.profile.profileUrl,
    extractionConfidence: result.profile.extractionConfidence,
    sources: result.sources,
    hubSpotPreflightPassed: validation.ok,
    hubSpotPreflightFailure: validation.ok ? undefined : validation.reason
  });

  if (isExtractionDebugEnabled()) {
    console.log("[linkedinProfileExtractor] Candidate details.", result.candidates);
  }
}

function cleanSingleLineField(value: string | undefined): string | undefined {
  const cleanedValue = normalizeText(dedupeProfileText(value ?? ""));
  return cleanedValue || undefined;
}

function cleanCompanyField(value: string | undefined): string | undefined {
  const cleanedValue = cleanSingleLineField(value)
    ?.replace(/^Current company\s*:?\s*/i, "")
    .replace(/^Company\s*:?\s*/i, "")
    .trim();
  return cleanedValue || undefined;
}

function cleanMultilineField(value: string | undefined): string | undefined {
  const cleanedValue = dedupeProfileText(value ?? "");
  return cleanedValue || undefined;
}

function compactSources(sources: Record<string, string | undefined>): Record<string, string> {
  return Object.fromEntries(Object.entries(sources).filter(([, value]) => Boolean(value))) as Record<string, string>;
}

function removeDuplicateConsecutiveSegments(value: string): string {
  let currentValue = normalizeText(value);
  const separators = [" | ", " · ", " • "];

  for (const separator of separators) {
    if (currentValue.includes(separator)) {
      currentValue = uniqueStrings(currentValue.split(separator)).join(separator);
    }
  }

  let previousValue = "";
  while (previousValue !== currentValue) {
    previousValue = currentValue;
    currentValue = removeRepeatedTokenRun(currentValue);
  }

  return currentValue;
}

function removeRepeatedTokenRun(value: string): string {
  if (value.includes(",")) {
    return value;
  }

  const tokens = value.split(" ").filter(Boolean);

  for (let length = Math.floor(tokens.length / 2); length >= 1; length -= 1) {
    const firstRun = tokens.slice(0, length);
    const secondRun = tokens.slice(length, length * 2);

    if (firstRun.length === secondRun.length && firstRun.every((token, index) => token === secondRun[index])) {
      return [...firstRun, ...tokens.slice(length * 2)].join(" ");
    }
  }

  return value;
}

function isExtractionDebugEnabled(): boolean {
  const debugWindow = window as DebugWindow;
  return Boolean(
    debugWindow.__LH_AI_DEBUG_EXTRACTION__ ||
      (typeof __PROFILE_EXTRACTION_DEBUG__ !== "undefined" && __PROFILE_EXTRACTION_DEBUG__)
  );
}

function installDebugHelper(): void {
  const debugWindow = window as DebugWindow;
  if ((debugWindow.__linkedinHubSpotAiDebugProfileExtraction && debugWindow.LIH_DEBUG_PROFILE_EXTRACTION) || !isExtractionDebugEnabled()) {
    return;
  }

  debugWindow.__linkedinHubSpotAiDebugProfileExtraction = debugLinkedInProfileExtraction;
  debugWindow.LIH_DEBUG_PROFILE_EXTRACTION = debugLinkedInProfileExtraction;
}
