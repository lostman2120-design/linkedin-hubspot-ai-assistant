import type { SellerContext, UserSettings } from "./types.js";
import { DEFAULT_SELLER_CONTEXT, DEFAULT_USER_SETTINGS, SELLER_CONTEXT_FIELD_LIMITS } from "./constants.js";
import { UserSettingsSchema } from "./schemas.js";

const USER_SETTINGS_STRING_LIMITS = {
  backendApiUrl: 500,
  productOrServiceDescription: 2000,
  targetCustomerProfile: 2000,
  targetIndustries: 1000,
  targetRoles: 1000,
  targetCompanySize: 500,
  targetRegion: 500,
  mainPainPointsSolved: 1500,
  excludedRoles: 1000,
  preferredOutreachTone: 500,
  defaultHubSpotLifecycleStage: 80
} as const satisfies Partial<Record<keyof UserSettings, number>>;

const sellerContextKeys = Object.keys(SELLER_CONTEXT_FIELD_LIMITS) as Array<keyof SellerContext>;
const likelySecretPattern =
  /\b(sk-[A-Za-z0-9_-]{12,}|pat-[A-Za-z0-9_-]{12,}|xox[baprs]-[A-Za-z0-9_-]+|bearer\s+[A-Za-z0-9._-]{12,}|api[_\s-]?key\s*[:=]\s*\S+|token\s*[:=]\s*\S+|secret\s*[:=]\s*\S+)/i;

export function normalizeUserSettingsInput(input: unknown, backendApiUrlFallback = DEFAULT_USER_SETTINGS.backendApiUrl): UserSettings {
  const raw = isRecord(input) ? input : {};
  const rawLegacyProductDescription = typeof raw.productOrServiceDescription === "string" ? raw.productOrServiceDescription.replace(/\s+/g, " ").trim() : "";
  const legacyProductDescription =
    rawLegacyProductDescription && rawLegacyProductDescription !== DEFAULT_USER_SETTINGS.productOrServiceDescription
      ? rawLegacyProductDescription
      : undefined;
  const candidate = {
    backendApiUrl: readString(raw.backendApiUrl, backendApiUrlFallback, USER_SETTINGS_STRING_LIMITS.backendApiUrl),
    productOrServiceDescription: readString(
      raw.productOrServiceDescription,
      DEFAULT_USER_SETTINGS.productOrServiceDescription,
      USER_SETTINGS_STRING_LIMITS.productOrServiceDescription
    ),
    targetCustomerProfile: readString(
      raw.targetCustomerProfile,
      DEFAULT_USER_SETTINGS.targetCustomerProfile,
      USER_SETTINGS_STRING_LIMITS.targetCustomerProfile
    ),
    targetIndustries: readString(raw.targetIndustries, DEFAULT_USER_SETTINGS.targetIndustries, USER_SETTINGS_STRING_LIMITS.targetIndustries),
    targetRoles: readString(raw.targetRoles, DEFAULT_USER_SETTINGS.targetRoles, USER_SETTINGS_STRING_LIMITS.targetRoles),
    targetCompanySize: readString(raw.targetCompanySize, DEFAULT_USER_SETTINGS.targetCompanySize, USER_SETTINGS_STRING_LIMITS.targetCompanySize),
    targetRegion: readString(raw.targetRegion, DEFAULT_USER_SETTINGS.targetRegion, USER_SETTINGS_STRING_LIMITS.targetRegion),
    mainPainPointsSolved: readString(
      raw.mainPainPointsSolved,
      DEFAULT_USER_SETTINGS.mainPainPointsSolved,
      USER_SETTINGS_STRING_LIMITS.mainPainPointsSolved
    ),
    excludedRoles: readString(raw.excludedRoles, DEFAULT_USER_SETTINGS.excludedRoles, USER_SETTINGS_STRING_LIMITS.excludedRoles),
    preferredOutreachTone: readString(
      raw.preferredOutreachTone,
      DEFAULT_USER_SETTINGS.preferredOutreachTone,
      USER_SETTINGS_STRING_LIMITS.preferredOutreachTone
    ),
    sellerContext: normalizeSellerContextInput(raw.sellerContext, legacyProductDescription),
    dmTone: isDmTone(raw.dmTone) ? raw.dmTone : DEFAULT_USER_SETTINGS.dmTone,
    defaultHubSpotLifecycleStage: readString(
      raw.defaultHubSpotLifecycleStage,
      DEFAULT_USER_SETTINGS.defaultHubSpotLifecycleStage,
      USER_SETTINGS_STRING_LIMITS.defaultHubSpotLifecycleStage
    ),
    defaultFollowUpDays: readNumber(raw.defaultFollowUpDays, DEFAULT_USER_SETTINGS.defaultFollowUpDays, 1, 60)
  };

  return UserSettingsSchema.parse(candidate);
}

export function normalizeSellerContextInput(input: unknown, legacyProductDescription?: string): SellerContext {
  const raw = isRecord(input) ? input : {};
  const defaults = {
    ...DEFAULT_SELLER_CONTEXT,
    productOrServiceDescription: legacyProductDescription?.trim() || DEFAULT_SELLER_CONTEXT.productOrServiceDescription
  };
  const sellerContext = Object.fromEntries(
    sellerContextKeys.map((key) => [
      key,
      readSellerContextString(raw[key], defaults[key], SELLER_CONTEXT_FIELD_LIMITS[key])
    ])
  ) as SellerContext;

  return sellerContext;
}

function readSellerContextString(value: unknown, fallback: string, maxLength: number): string {
  const normalized = readString(value, fallback, maxLength);
  return likelySecretPattern.test(normalized) ? fallback : normalized;
}

function readString(value: unknown, fallback: string, maxLength?: number): string {
  const rawValue = typeof value === "string" || typeof value === "number" ? String(value) : fallback;
  const normalized = rawValue.replace(/\s+/g, " ").trim();
  const safeValue = normalized || fallback;

  return typeof maxLength === "number" ? truncateByCodePoints(safeValue, maxLength) : safeValue;
}

function truncateByCodePoints(value: string, maxLength: number): string {
  const characters = Array.from(value);
  return characters.length > maxLength ? characters.slice(0, maxLength).join("") : value;
}

function readNumber(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : fallback;
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, Math.round(parsed))) : fallback;
}

function isDmTone(value: unknown): value is UserSettings["dmTone"] {
  return value === "professional" || value === "friendly" || value === "concise" || value === "casual";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
