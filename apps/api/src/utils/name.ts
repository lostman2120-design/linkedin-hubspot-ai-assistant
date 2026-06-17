import { splitProfileName } from "@linkedin-hubspot-ai/shared";

export type SplitName = {
  firstName: string;
  lastName?: string;
};

export function splitFullName(fullName: string): SplitName {
  return splitProfileName(fullName);
}
