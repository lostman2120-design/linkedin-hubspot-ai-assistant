import type { UserSettings } from "@linkedin-hubspot-ai/shared";
import { DEFAULT_USER_SETTINGS, UserSettingsSchema } from "@linkedin-hubspot-ai/shared";
import { EXTENSION_DEFAULT_API_BASE_URL } from "../extensionConfig";
import { SETTINGS_KEY, getStoredSettings, type StorageAreaLike } from "../storage";

export type IcpSummaryField = {
  label: string;
  value: string;
};

export type IcpSettingsLoadResult = {
  settings: UserSettings;
  usingDefaults: boolean;
  loadFailed: boolean;
};

const ICP_FIELD_KEYS = [
  "targetRoles",
  "targetIndustries",
  "targetCompanySize",
  "productOrServiceDescription",
  "mainPainPointsSolved",
  "preferredOutreachTone"
] as const satisfies readonly (keyof UserSettings)[];

const FALLBACK_SETTINGS = UserSettingsSchema.parse({
  ...DEFAULT_USER_SETTINGS,
  backendApiUrl: EXTENSION_DEFAULT_API_BASE_URL
});

function normalizeDisplayText(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map(normalizeDisplayText).filter(Boolean).join(", ");
  }

  if (typeof value !== "string" && typeof value !== "number") {
    return "";
  }

  return String(value).replace(/\s+/g, " ").trim();
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasCustomIcpSettings(rawSettings: unknown): boolean {
  if (!isPlainRecord(rawSettings)) {
    return false;
  }

  return ICP_FIELD_KEYS.some((field) => {
    if (!(field in rawSettings)) {
      return false;
    }

    const storedValue = normalizeComparableStoredValue(rawSettings[field]);
    const defaultValue = normalizeDisplayText(DEFAULT_USER_SETTINGS[field]);
    return storedValue.length > 0 && storedValue !== defaultValue;
  });
}

function normalizeComparableStoredValue(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? normalizeDisplayText(value) : "";
}

export function truncateIcpValue(value: string, maxLength = 96): string {
  const normalized = normalizeDisplayText(value);
  if (!normalized) {
    return "Not set";
  }

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

export function buildIcpSummaryFields(settings: UserSettings, maxLength = 96): IcpSummaryField[] {
  return [
    { label: "Roles", value: truncateIcpValue(settings.targetRoles, maxLength) },
    { label: "Industries", value: truncateIcpValue(settings.targetIndustries, maxLength) },
    { label: "Company size", value: truncateIcpValue(settings.targetCompanySize, maxLength) },
    { label: "Offer", value: truncateIcpValue(settings.productOrServiceDescription, maxLength) },
    { label: "Pain points", value: truncateIcpValue(settings.mainPainPointsSolved, maxLength) },
    { label: "Tone", value: truncateIcpValue(settings.preferredOutreachTone || settings.dmTone, maxLength) }
  ];
}

export async function getIcpSettingsSafe(storageArea: StorageAreaLike = chrome.storage.local): Promise<IcpSettingsLoadResult> {
  try {
    const [settings, stored] = await Promise.all([
      getStoredSettings(storageArea),
      storageArea.get(SETTINGS_KEY).catch(() => ({}))
    ]);
    return {
      settings,
      usingDefaults: !hasCustomIcpSettings(stored[SETTINGS_KEY]),
      loadFailed: false
    };
  } catch {
    return {
      settings: FALLBACK_SETTINGS,
      usingDefaults: true,
      loadFailed: true
    };
  }
}
