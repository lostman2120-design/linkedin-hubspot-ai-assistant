import type { LinkedInProfile } from "@linkedin-hubspot-ai/shared";
import { UNABLE_TO_EXTRACT_FIELD } from "@linkedin-hubspot-ai/shared";
import { splitFullName } from "./name.js";

export type HubSpotContactProperties = Record<string, string>;

function cleanProperty(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const cleaned = value.replace(/\s+/g, " ").trim();
  if (!cleaned || cleaned === UNABLE_TO_EXTRACT_FIELD) {
    return undefined;
  }

  return cleaned;
}

export function mapProfileToHubSpotProperties(
  profile: LinkedInProfile,
  lifecycleStage?: string
): HubSpotContactProperties {
  const { firstName, lastName } = splitFullName(profile.fullName);
  const properties: HubSpotContactProperties = {
    firstname: firstName,
    hs_linkedin_url: profile.profileUrl
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
