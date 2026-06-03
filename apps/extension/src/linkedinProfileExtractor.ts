import type { LinkedInProfile } from "@linkedin-hubspot-ai/shared";
import { UNABLE_TO_EXTRACT_FIELD } from "@linkedin-hubspot-ai/shared";

const TEXT_SAMPLE_LIMIT = 1800;
const ABOUT_LIMIT = 900;

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

  if (element.hidden || element.getAttribute("aria-hidden") === "true") {
    return false;
  }

  const style = window.getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) {
    return false;
  }

  return element.getClientRects().length > 0;
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

  return normalizeText(dedupeProfileText((element as HTMLElement).innerText));
}

function textFromSelectorCandidates(selectors: string[]): string | undefined {
  for (const selector of selectors) {
    const elements = safeQuerySelectorAll(selector);
    for (const element of elements) {
      const text = visibleTextForElement(element);
      if (text) {
        return text;
      }
    }
  }

  return undefined;
}

export function getCurrentLinkedInProfileUrl(): string {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  return url.toString();
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
      .replace(/\bshow less\b/gi, "")
      .trim();

    if (text && text.length > 10) {
      return text.slice(0, ABOUT_LIMIT);
    }
  }

  return undefined;
}

function inferCompanyFromHeadline(headline: string | undefined): string | undefined {
  if (!headline) {
    return undefined;
  }

  const match = headline.match(/\bat\s+([^|,\u2022]+)/i);
  return normalizeText(dedupeProfileText(match?.[1] ?? ""));
}

function inferJobTitleFromHeadline(headline: string | undefined): string | undefined {
  if (!headline) {
    return undefined;
  }

  const [beforeAt] = headline.split(/\bat\s+/i);
  return normalizeText(dedupeProfileText(beforeAt));
}

function visibleSample(): string | undefined {
  const source = document.querySelector("main") ?? document.body;
  const sample = dedupeProfileText(normalizeMultilineText((source as HTMLElement | undefined)?.innerText)).slice(0, TEXT_SAMPLE_LIMIT);
  return sample || undefined;
}

export function extractLinkedInProfile(): LinkedInProfile {
  // LinkedIn safety: extraction is limited to text that is already visible in the current DOM.
  // This code never clicks "see more", never navigates, never reads storage/cookies, and never scrapes hidden data.
  if (!isLinkedInProfilePage()) {
    return {
      fullName: UNABLE_TO_EXTRACT_FIELD,
      profileUrl: getCurrentLinkedInProfileUrl(),
      visibleTextSample: visibleSample()
    };
  }

  const fullName =
    textFromSelectorCandidates([
      "main section:first-of-type h1",
      "main h1.text-heading-xlarge",
      "main h1",
      "[class*='pv-top-card'] h1",
      "section h1",
      ".pv-text-details__left-panel h1",
      ".ph5 h1",
      "main [data-anonymize='person-name']",
      "[data-generated-suggestion-target] h1"
    ]) ?? UNABLE_TO_EXTRACT_FIELD;

  const headline = textFromSelectorCandidates([
    "main section:first-of-type .text-body-medium.break-words",
    ".text-body-medium.break-words",
    ".pv-text-details__left-panel .text-body-medium",
    "[class*='pv-top-card'] .text-body-medium",
    "main section:first-of-type div[dir='ltr']",
    "section div.text-body-medium",
    "main section:first-of-type div[class*='text-body-medium']"
  ]);

  const location = textFromSelectorCandidates([
    "main section:first-of-type .text-body-small.inline.t-black--light.break-words",
    ".text-body-small.inline.t-black--light.break-words",
    ".pv-text-details__left-panel span.text-body-small",
    "[class*='pv-top-card'] span.text-body-small",
    "main section:first-of-type span[aria-hidden='true'].text-body-small",
    "main section:first-of-type span[class*='text-body-small']"
  ]);

  const companyName =
    textFromSelectorCandidates([
      "button[aria-label*='Current company'] span[aria-hidden='true']",
      "button[aria-label*='Current company'] div",
      "button[aria-label*='Current company']",
      "section:has(#experience) a[href*='/company/'] span[aria-hidden='true']",
      "section:has(#experience) a[href*='/company/']",
      "[data-field='experience_company_logo'] span[aria-hidden='true']",
      "a[href*='/company/'] span[aria-hidden='true']",
      "a[href*='/company/']",
      ".pv-text-details__right-panel a[href*='/company/']"
    ]) ?? inferCompanyFromHeadline(headline);

  const jobTitle =
    textFromSelectorCandidates([
      "section:has(#experience) [data-view-name='profile-component-entity'] span[aria-hidden='true']",
      "[data-view-name='profile-component-entity'] div[aria-hidden='true']",
      "#experience ~ * span[aria-hidden='true']",
      "section:has(#experience) span[aria-hidden='true']"
    ]) ?? inferJobTitleFromHeadline(headline);

  return {
    fullName: cleanSingleLineField(fullName) ?? UNABLE_TO_EXTRACT_FIELD,
    headline: cleanSingleLineField(headline),
    companyName: cleanSingleLineField(companyName),
    jobTitle: cleanSingleLineField(jobTitle),
    location: cleanSingleLineField(location),
    profileUrl: getCurrentLinkedInProfileUrl(),
    about: cleanMultilineField(extractAbout()),
    visibleTextSample: visibleSample()
  };
}

function cleanSingleLineField(value: string | undefined): string | undefined {
  const cleanedValue = normalizeText(dedupeProfileText(value ?? ""));
  return cleanedValue || undefined;
}

function cleanMultilineField(value: string | undefined): string | undefined {
  const cleanedValue = dedupeProfileText(value ?? "");
  return cleanedValue || undefined;
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
