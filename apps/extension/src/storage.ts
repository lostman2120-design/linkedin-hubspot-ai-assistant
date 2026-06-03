import type { UserSettings } from "@linkedin-hubspot-ai/shared";
import { DEFAULT_USER_SETTINGS, UserSettingsSchema } from "@linkedin-hubspot-ai/shared";
import { EXTENSION_DEFAULT_API_BASE_URL } from "./extensionConfig";

export const SETTINGS_KEY = "linkedinHubspotAiAssistant.settings";
export const USAGE_KEY = "linkedinHubspotAiAssistant.usage";
export const LICENSE_STATE_KEY = "linkedinHubspotAiAssistant.licenseState";
export const DAILY_USAGE_KEY = "linkedinHubspotAiAssistant.dailyUsage";

export const FREE_PLAN_LIMITS = {
  profileAnalyses: 3,
  outreachDrafts: 1
} as const;

export type PlanName = "free" | "beta_pro";
export type LicenseStatus = "none" | "active" | "invalid" | "expired" | "past_due" | "canceled" | "inactive" | "unable_to_verify";

export type StoredLicenseState = {
  licenseKey?: string;
  valid: boolean;
  plan: PlanName;
  status: LicenseStatus;
  expiresAt?: string;
  verifiedAt?: string;
};

export type DailyUsage = {
  date: string;
  profileAnalyses: number;
  outreachDrafts: number;
};

export type StorageAreaLike = {
  get(keys?: string | string[] | Record<string, unknown> | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
};

export const DEFAULT_LICENSE_STATE: StoredLicenseState = {
  valid: false,
  plan: "free",
  status: "none"
};

function localDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function emptyDailyUsage(date = localDateKey()): DailyUsage {
  return {
    date,
    profileAnalyses: 0,
    outreachDrafts: 0
  };
}

function parseDailyUsage(rawUsage: unknown, date = localDateKey()): DailyUsage {
  if (typeof rawUsage !== "object" || rawUsage === null) {
    return emptyDailyUsage(date);
  }

  const usage = rawUsage as Record<string, unknown>;
  if (usage.date !== date) {
    return emptyDailyUsage(date);
  }

  return {
    date,
    profileAnalyses: typeof usage.profileAnalyses === "number" ? usage.profileAnalyses : 0,
    outreachDrafts: typeof usage.outreachDrafts === "number" ? usage.outreachDrafts : 0
  };
}

function parseStoredLicenseState(rawLicenseState: unknown): StoredLicenseState {
  if (typeof rawLicenseState !== "object" || rawLicenseState === null) {
    return { ...DEFAULT_LICENSE_STATE };
  }

  const licenseState = rawLicenseState as Record<string, unknown>;
  const plan = licenseState.plan === "beta_pro" ? "beta_pro" : "free";
  const valid = licenseState.valid === true && plan === "beta_pro" && licenseState.status === "active";

  return {
    licenseKey: typeof licenseState.licenseKey === "string" ? licenseState.licenseKey : undefined,
    valid,
    plan: valid ? "beta_pro" : "free",
    status: isLicenseStatus(licenseState.status) ? licenseState.status : "none",
    expiresAt: typeof licenseState.expiresAt === "string" ? licenseState.expiresAt : undefined,
    verifiedAt: typeof licenseState.verifiedAt === "string" ? licenseState.verifiedAt : undefined
  };
}

function isLicenseStatus(value: unknown): value is LicenseStatus {
  return (
    value === "none" ||
    value === "active" ||
    value === "invalid" ||
    value === "expired" ||
    value === "past_due" ||
    value === "canceled" ||
    value === "inactive" ||
    value === "unable_to_verify"
  );
}

export async function getStoredSettings(storageArea: StorageAreaLike = chrome.storage.sync): Promise<UserSettings> {
  const stored = await storageArea.get(SETTINGS_KEY);
  const rawSettings = typeof stored[SETTINGS_KEY] === "object" && stored[SETTINGS_KEY] !== null ? stored[SETTINGS_KEY] : {};

  return UserSettingsSchema.parse({
    ...DEFAULT_USER_SETTINGS,
    backendApiUrl: EXTENSION_DEFAULT_API_BASE_URL,
    ...rawSettings
  });
}

export async function saveStoredSettings(
  settings: UserSettings,
  storageArea: StorageAreaLike = chrome.storage.sync
): Promise<void> {
  const parsed = UserSettingsSchema.parse(settings);
  await storageArea.set({ [SETTINGS_KEY]: parsed });
}

export async function getTodayUsageCount(storageArea: StorageAreaLike = chrome.storage.local): Promise<number> {
  const stored = await storageArea.get(USAGE_KEY);
  const usage = typeof stored[USAGE_KEY] === "object" && stored[USAGE_KEY] !== null ? (stored[USAGE_KEY] as Record<string, unknown>) : {};
  const value = usage[localDateKey()];
  return typeof value === "number" ? value : 0;
}

export async function incrementTodayUsageCount(storageArea: StorageAreaLike = chrome.storage.local): Promise<number> {
  const stored = await storageArea.get(USAGE_KEY);
  const usage = typeof stored[USAGE_KEY] === "object" && stored[USAGE_KEY] !== null ? (stored[USAGE_KEY] as Record<string, unknown>) : {};
  const key = localDateKey();
  const nextValue = (typeof usage[key] === "number" ? usage[key] : 0) + 1;

  await storageArea.set({
    [USAGE_KEY]: {
      ...usage,
      [key]: nextValue
    }
  });

  return nextValue;
}

export async function getStoredLicenseState(storageArea: StorageAreaLike = chrome.storage.local): Promise<StoredLicenseState> {
  const stored = await storageArea.get(LICENSE_STATE_KEY);
  return parseStoredLicenseState(stored[LICENSE_STATE_KEY]);
}

export async function saveStoredLicenseState(
  licenseState: StoredLicenseState,
  storageArea: StorageAreaLike = chrome.storage.local
): Promise<void> {
  await storageArea.set({ [LICENSE_STATE_KEY]: licenseState });
}

export async function removeStoredLicenseState(storageArea: StorageAreaLike = chrome.storage.local): Promise<void> {
  await storageArea.set({ [LICENSE_STATE_KEY]: { ...DEFAULT_LICENSE_STATE } });
}

export async function getDailyUsage(storageArea: StorageAreaLike = chrome.storage.local): Promise<DailyUsage> {
  const stored = await storageArea.get(DAILY_USAGE_KEY);
  const rawUsage = stored[DAILY_USAGE_KEY];
  const usage = parseDailyUsage(rawUsage);
  const shouldPersistReset =
    typeof rawUsage !== "object" || rawUsage === null || (rawUsage as Record<string, unknown>).date !== usage.date;

  if (shouldPersistReset) {
    await storageArea.set({ [DAILY_USAGE_KEY]: usage });
  }

  return usage;
}

export async function incrementDailyUsage(
  field: "profileAnalyses" | "outreachDrafts",
  storageArea: StorageAreaLike = chrome.storage.local
): Promise<DailyUsage> {
  const currentUsage = await getDailyUsage(storageArea);
  const nextUsage = {
    ...currentUsage,
    [field]: currentUsage[field] + 1
  };
  await storageArea.set({ [DAILY_USAGE_KEY]: nextUsage });
  return nextUsage;
}
