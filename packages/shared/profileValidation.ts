import { UNABLE_TO_EXTRACT_FIELD } from "./constants.js";
import type { LinkedInProfile } from "./types.js";

export type ProfileIdentityValidation =
  | { ok: true }
  | {
      ok: false;
      reason: "missing_name" | "missing_profile_url" | "company_only_name";
      message: string;
    };

const invalidContactNames = new Set(["unknown", "linkedin contact", "untitled", "n/a", "na", "none", UNABLE_TO_EXTRACT_FIELD.toLowerCase()]);

export function cleanProfileField(value: string | undefined | null): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

export function getProfileUrl(profile: Pick<LinkedInProfile, "profileUrl" | "linkedinUrl">): string {
  return cleanProfileField(profile.linkedinUrl ?? profile.profileUrl);
}

export function isValidLinkedInProfileUrl(value: string | undefined | null): boolean {
  const cleanedValue = cleanProfileField(value);

  if (!cleanedValue) {
    return false;
  }

  try {
    const url = new URL(cleanedValue);
    return url.hostname.endsWith("linkedin.com") && /^\/in\/[^/]+\/?/.test(url.pathname);
  } catch {
    return false;
  }
}

export function isInvalidContactName(fullName: string | undefined | null, companyName?: string | null): boolean {
  const cleanedName = cleanProfileField(fullName);
  const normalizedName = cleanedName.toLowerCase();
  const cleanedCompany = cleanProfileField(companyName).toLowerCase();

  if (!cleanedName || invalidContactNames.has(normalizedName)) {
    return true;
  }

  if (cleanedCompany && normalizedName === cleanedCompany) {
    return true;
  }

  if (!/[\p{L}]/u.test(cleanedName)) {
    return true;
  }

  if (/^(about|activity|company|contact info|experience|followers|home|jobs|people|posts|profile)$/i.test(cleanedName)) {
    return true;
  }

  const words = cleanedName.split(" ").filter(Boolean);
  return cleanedName.length > 100 || words.length > 10;
}

export function splitProfileName(fullName: string): { firstName: string; lastName?: string } {
  const cleanedName = cleanProfileField(fullName).replace(/\([^)]*\)/g, "").trim();

  if (!cleanedName || isInvalidContactName(cleanedName)) {
    return { firstName: "" };
  }

  const parts = cleanedName.split(" ").filter(Boolean);
  return {
    firstName: parts[0] ?? "",
    lastName: parts.length > 1 ? parts.slice(1).join(" ") : undefined
  };
}

export function validateLinkedInProfileIdentity(profile: LinkedInProfile): ProfileIdentityValidation {
  if (!isValidLinkedInProfileUrl(getProfileUrl(profile))) {
    return {
      ok: false,
      reason: "missing_profile_url",
      message: "Could not detect the LinkedIn profile URL. Please reload the LinkedIn profile page and try again."
    };
  }

  if (isInvalidContactName(profile.fullName, profile.companyName)) {
    const cleanedName = cleanProfileField(profile.fullName).toLowerCase();
    const cleanedCompany = cleanProfileField(profile.companyName).toLowerCase();
    return {
      ok: false,
      reason: cleanedName && cleanedCompany && cleanedName === cleanedCompany ? "company_only_name" : "missing_name",
      message: "Could not detect the LinkedIn profile name. Please make sure you are on a LinkedIn profile page and wait for the page to finish loading."
    };
  }

  return { ok: true };
}
