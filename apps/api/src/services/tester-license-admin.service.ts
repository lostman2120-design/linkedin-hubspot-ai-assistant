import type { LicensePlan, LicenseRecord, LicenseRepositoryLike } from "./license.repository.js";
import { generateUniqueLicenseKey, maskEmail, maskLicenseKey } from "./license.service.js";

const dayInMilliseconds = 24 * 60 * 60 * 1000;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const defaultTesterEmail = "tester-license@internal.invalid";

export type TesterLicenseSafeView = {
  id: string;
  email: string;
  licenseKey: string;
  plan: LicensePlan;
  status: string;
  source: string;
  label: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateTesterLicenseInput = {
  email?: string;
  label: string;
  plan?: LicensePlan;
  days: number;
  notes?: string | null;
  now?: Date;
};

export function parsePositiveTesterDays(value: string | number | undefined): number {
  const parsed = typeof value === "number" ? value : Number.parseInt(value ?? "", 10);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error("Provide a positive number of days with --days, for example --days 7.");
  }

  return parsed;
}

export function normalizeTesterPlan(value: string | undefined): LicensePlan {
  if (!value || value === "beta_pro") {
    return "beta_pro";
  }

  if (value === "pro") {
    return "pro";
  }

  throw new Error("Plan must be beta_pro or pro.");
}

export async function createTesterLicense(
  repository: LicenseRepositoryLike,
  input: CreateTesterLicenseInput
): Promise<LicenseRecord> {
  const days = parsePositiveTesterDays(input.days);
  const label = input.label.trim();

  if (!label) {
    throw new Error("Provide a short label with --label.");
  }

  const email = normalizeOptionalEmail(input.email);
  const now = input.now ?? new Date();
  const expiresAt = new Date(now.getTime() + days * dayInMilliseconds).toISOString();

  return repository.createTesterLicense({
    email,
    licenseKey: await generateUniqueLicenseKey(repository),
    plan: input.plan ?? "beta_pro",
    status: "active",
    expiresAt,
    label,
    notes: input.notes ?? null
  });
}

export async function revokeLicense(repository: LicenseRepositoryLike, licenseKey: string): Promise<LicenseRecord> {
  const normalizedLicenseKey = licenseKey.trim();

  if (!normalizedLicenseKey) {
    throw new Error("Provide a license key with --key.");
  }

  const license = await repository.revokeLicenseByKey(normalizedLicenseKey);

  if (!license) {
    throw new Error("License was not found.");
  }

  return license;
}

export async function inspectLicense(repository: LicenseRepositoryLike, licenseKey: string): Promise<TesterLicenseSafeView> {
  const normalizedLicenseKey = licenseKey.trim();

  if (!normalizedLicenseKey) {
    throw new Error("Provide a license key with --key.");
  }

  const license = await repository.findByLicenseKey(normalizedLicenseKey);

  if (!license) {
    throw new Error("License was not found.");
  }

  return toSafeLicenseView(license);
}

export async function listTesterLicenses(repository: LicenseRepositoryLike): Promise<TesterLicenseSafeView[]> {
  const licenses = await repository.listTesterLicenses();
  return licenses.map(toSafeLicenseView);
}

export function toSafeLicenseView(license: LicenseRecord): TesterLicenseSafeView {
  return {
    id: license.id,
    email: maskEmail(license.email),
    licenseKey: maskLicenseKey(license.licenseKey),
    plan: license.plan,
    status: license.revokedAt ? "revoked" : license.status,
    source: license.source,
    label: license.label,
    expiresAt: license.expiresAt,
    revokedAt: license.revokedAt,
    createdAt: license.createdAt,
    updatedAt: license.updatedAt
  };
}

function normalizeOptionalEmail(email: string | undefined): string {
  const normalizedEmail = email?.trim().toLowerCase();

  if (!normalizedEmail) {
    return defaultTesterEmail;
  }

  if (!emailPattern.test(normalizedEmail)) {
    throw new Error("Provide a valid tester email or omit --email.");
  }

  return normalizedEmail;
}
