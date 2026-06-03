import { UNABLE_TO_EXTRACT_FIELD } from "@linkedin-hubspot-ai/shared";

export type SplitName = {
  firstName: string;
  lastName?: string;
};

export function splitFullName(fullName: string): SplitName {
  const cleaned = fullName
    .replace(/\s+/g, " ")
    .replace(/\([^)]*\)/g, "")
    .trim();

  if (!cleaned || cleaned === UNABLE_TO_EXTRACT_FIELD) {
    return { firstName: "Unknown" };
  }

  const parts = cleaned.split(" ").filter(Boolean);
  const firstName = parts[0] ?? "Unknown";
  const lastName = parts.length > 1 ? parts.slice(1).join(" ") : undefined;

  return { firstName, lastName };
}

