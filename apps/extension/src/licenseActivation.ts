import type { LicenseVerifyResponse } from "@linkedin-hubspot-ai/shared";
import { apiRequest } from "./apiClient";
import {
  DEFAULT_LICENSE_STATE,
  removeStoredLicenseState,
  saveStoredLicenseState,
  type StoredLicenseState
} from "./storage";

export type LicenseStatusMessage = "License active" | "Invalid license" | "License expired" | "Unable to verify license";

type LicenseUpdateResult = {
  licenseState: StoredLicenseState;
  statusMessage: LicenseStatusMessage | null;
};

export function statusMessageForLicenseState(licenseState: StoredLicenseState): LicenseStatusMessage | null {
  if (licenseState.valid && licenseState.plan === "beta_pro" && licenseState.status === "active") {
    return "License active";
  }

  if (licenseState.status === "invalid") {
    return "Invalid license";
  }

  if (licenseState.status === "expired") {
    return "License expired";
  }

  if (licenseState.status === "canceled" || licenseState.status === "inactive") {
    return "License expired";
  }

  if (licenseState.status === "past_due") {
    return "Invalid license";
  }

  if (licenseState.status === "unable_to_verify") {
    return "Unable to verify license";
  }

  return null;
}

export async function activateLicenseKey(licenseKey: string): Promise<LicenseUpdateResult> {
  const trimmedLicenseKey = licenseKey.trim();

  if (!trimmedLicenseKey) {
    const licenseState = {
      valid: false,
      plan: "free",
      status: "invalid",
      verifiedAt: new Date().toISOString()
    } satisfies StoredLicenseState;
    await saveStoredLicenseState(licenseState);
    return { licenseState, statusMessage: "Invalid license" };
  }

  try {
    const result = await apiRequest<LicenseVerifyResponse>("/api/license/verify", {
      method: "POST",
      body: { licenseKey: trimmedLicenseKey },
      trackUsage: false
    });

    const licenseState = toStoredLicenseState(result, trimmedLicenseKey);
    await saveStoredLicenseState(licenseState);
    return { licenseState, statusMessage: statusMessageForLicenseState(licenseState) };
  } catch {
    const licenseState = {
      valid: false,
      plan: "free",
      status: "unable_to_verify",
      verifiedAt: new Date().toISOString()
    } satisfies StoredLicenseState;
    await saveStoredLicenseState(licenseState);
    return { licenseState, statusMessage: "Unable to verify license" };
  }
}

export async function removeLicenseKey(): Promise<LicenseUpdateResult> {
  await removeStoredLicenseState();
  return { licenseState: { ...DEFAULT_LICENSE_STATE }, statusMessage: null };
}

function toStoredLicenseState(result: LicenseVerifyResponse, licenseKey: string): StoredLicenseState {
  if (result.valid && result.plan === "beta_pro" && result.status === "active") {
    return {
      licenseKey,
      valid: true,
      plan: "beta_pro",
      status: "active",
      expiresAt: result.expiresAt,
      verifiedAt: new Date().toISOString()
    };
  }

  return {
    valid: false,
    plan: "free",
    status: result.status === "active" ? "invalid" : result.status,
    verifiedAt: new Date().toISOString()
  };
}
