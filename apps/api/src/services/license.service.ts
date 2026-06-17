import { randomInt } from "node:crypto";
import type { LicenseVerifyResponse } from "@linkedin-hubspot-ai/shared";
import { createLicenseRepository, type LicenseRecord, type LicenseRepositoryLike } from "./license.repository.js";

const licenseKeyAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function parseAllowlist(rawKeys: string | undefined): Set<string> {
  return new Set(
    (rawKeys ?? "")
      .split(",")
      .map((key) => key.trim())
      .filter(Boolean)
  );
}

export async function verifyBetaProLicenseKey(
  licenseKey: string,
  repository: LicenseRepositoryLike = createLicenseRepository(),
  rawAllowlist: string | undefined = process.env.BETA_PRO_LICENSE_KEYS
): Promise<LicenseVerifyResponse> {
  const normalizedLicenseKey = licenseKey.trim();
  const storedLicense = await repository.findByLicenseKey(normalizedLicenseKey);

  if (storedLicense) {
    return responseForStoredLicense(storedLicense);
  }

  const allowedKeys = parseAllowlist(rawAllowlist);

  if (normalizedLicenseKey && allowedKeys.has(normalizedLicenseKey)) {
    return {
      valid: true,
      plan: "beta_pro",
      status: "active",
      source: "internal",
      type: "internal"
    };
  }

  return {
    valid: false,
    plan: "free",
    status: "invalid"
  };
}

export async function generateUniqueLicenseKey(repository: LicenseRepositoryLike = createLicenseRepository()): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const licenseKey = generateLicenseKey();
    if (!(await repository.isLicenseKeyTaken(licenseKey))) {
      return licenseKey;
    }
  }

  throw new Error("Could not generate a unique license key. Please try again.");
}

export function generateLicenseKey(): string {
  const groups = Array.from({ length: 4 }, () => randomLicenseKeyGroup());
  return `lh-beta-${groups.join("-")}`;
}

export function maskEmail(email: string): string {
  const [name, domain] = email.split("@");

  if (!name || !domain) {
    return "hidden";
  }

  const visibleName = name.length <= 2 ? `${name[0] ?? ""}***` : `${name.slice(0, 2)}***`;
  return `${visibleName}@${domain}`;
}

export function maskLicenseKey(licenseKey: string): string {
  const normalizedLicenseKey = licenseKey.trim();
  const lastGroup = normalizedLicenseKey.split("-").at(-1) ?? "****";
  return `lh-beta-****-****-${lastGroup}`;
}

function randomLicenseKeyGroup(): string {
  return Array.from({ length: 4 }, () => licenseKeyAlphabet[randomInt(0, licenseKeyAlphabet.length)]).join("");
}

function responseForStoredLicense(license: LicenseRecord): LicenseVerifyResponse {
  if (license.revokedAt) {
    return {
      valid: false,
      plan: "free",
      status: "revoked",
      source: license.source,
      type: license.source,
      expiresAt: license.expiresAt,
      currentPeriodEnd: license.currentPeriodEnd,
      message: "This license is no longer active."
    };
  }

  if (isExpired(license.expiresAt)) {
    return {
      valid: false,
      plan: "free",
      status: "expired",
      source: license.source,
      type: license.source,
      expiresAt: license.expiresAt,
      currentPeriodEnd: license.currentPeriodEnd,
      message: "This test license has expired."
    };
  }

  if (license.status === "active" && (license.plan === "beta_pro" || license.plan === "pro")) {
    return {
      valid: true,
      plan: license.plan,
      status: "active",
      source: license.source,
      type: license.source,
      email: maskEmail(license.email),
      expiresAt: license.expiresAt,
      currentPeriodEnd: license.currentPeriodEnd
    };
  }

  return {
    valid: false,
    plan: "free",
    status: license.status,
    source: license.source,
    type: license.source,
    expiresAt: license.expiresAt,
    currentPeriodEnd: license.currentPeriodEnd
  };
}

function isExpired(expiresAt: string | null): boolean {
  if (!expiresAt) {
    return false;
  }

  const expiresAtTime = Date.parse(expiresAt);
  return Number.isFinite(expiresAtTime) && expiresAtTime <= Date.now();
}
