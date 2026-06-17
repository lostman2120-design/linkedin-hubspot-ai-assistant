import type { LicenseVerifyResponse } from "@linkedin-hubspot-ai/shared";
import { apiRequest } from "./apiClient";
import {
  DEFAULT_LICENSE_STATE,
  removeStoredLicenseState,
  saveStoredLicenseState,
  type StoredLicenseState
} from "./storage";

export type LicenseStatusMessage =
  | "License active"
  | "Invalid license"
  | "License expired"
  | "This test license has expired."
  | "This license is no longer active."
  | "Unable to verify license"
  | `Unable to verify license: ${string}`;

type LicenseUpdateResult = {
  licenseState: StoredLicenseState;
  statusMessage: LicenseStatusMessage | null;
};

export function statusMessageForLicenseState(licenseState: StoredLicenseState): LicenseStatusMessage | null {
  if (licenseState.valid && (licenseState.plan === "beta_pro" || licenseState.plan === "pro") && licenseState.status === "active") {
    return "License active";
  }

  if (licenseState.status === "invalid") {
    return "Invalid license";
  }

  if (licenseState.status === "expired") {
    return "This test license has expired.";
  }

  if (licenseState.status === "revoked") {
    return "This license is no longer active.";
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
    return { licenseState, statusMessage: normalizeLicenseStatusMessage(result.message) ?? statusMessageForLicenseState(licenseState) };
  } catch (error) {
    const detail = error instanceof Error && error.message.trim().length > 0 ? error.message.trim() : "Unknown extension error";
    console.error("[licenseActivation] License verification failed in the extension.", {
      message: detail
    });
    const licenseState = {
      valid: false,
      plan: "free",
      status: "unable_to_verify",
      verifiedAt: new Date().toISOString()
    } satisfies StoredLicenseState;
    await saveStoredLicenseState(licenseState);
    return { licenseState, statusMessage: `Unable to verify license: ${detail}` };
  }
}

export async function removeLicenseKey(): Promise<LicenseUpdateResult> {
  await removeStoredLicenseState();
  return { licenseState: { ...DEFAULT_LICENSE_STATE }, statusMessage: null };
}

function toStoredLicenseState(result: LicenseVerifyResponse, licenseKey: string): StoredLicenseState {
  if (result.valid && (result.plan === "beta_pro" || result.plan === "pro") && result.status === "active") {
    return {
      licenseKey,
      valid: true,
      plan: result.plan,
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

function normalizeLicenseStatusMessage(message: string | undefined): LicenseStatusMessage | null {
  if (message === "This test license has expired." || message === "This license is no longer active.") {
    return message;
  }

  return null;
}
