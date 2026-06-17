import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "../apiClient";
import { activateLicenseKey, statusMessageForLicenseState } from "../licenseActivation";
import type { StoredLicenseState } from "../storage";

vi.mock("../apiClient", () => ({
  apiRequest: vi.fn()
}));

const mockedApiRequest = vi.mocked(apiRequest);
const storageSet = vi.fn();

beforeEach(() => {
  mockedApiRequest.mockReset();
  storageSet.mockReset();
  vi.stubGlobal("chrome", {
    storage: {
      local: {
        set: storageSet
      }
    }
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("license activation UI status messages", () => {
  it("shows the active message for a valid Beta Pro license", () => {
    const licenseState = {
      valid: true,
      plan: "beta_pro",
      status: "active"
    } satisfies StoredLicenseState;

    expect(statusMessageForLicenseState(licenseState)).toBe("License active");
  });

  it("shows the active message for a valid Pro license", () => {
    const licenseState = {
      valid: true,
      plan: "pro",
      status: "active"
    } satisfies StoredLicenseState;

    expect(statusMessageForLicenseState(licenseState)).toBe("License active");
  });

  it("shows the invalid message for invalid licenses", () => {
    const licenseState = {
      valid: false,
      plan: "free",
      status: "invalid"
    } satisfies StoredLicenseState;

    expect(statusMessageForLicenseState(licenseState)).toBe("Invalid license");
  });

  it("shows the unable-to-verify message for backend connection failures", () => {
    const licenseState = {
      valid: false,
      plan: "free",
      status: "unable_to_verify"
    } satisfies StoredLicenseState;

    expect(statusMessageForLicenseState(licenseState)).toBe("Unable to verify license");
  });

  it("shows tester-specific expired and revoked messages", () => {
    expect(
      statusMessageForLicenseState({
        valid: false,
        plan: "free",
        status: "expired"
      })
    ).toBe("This test license has expired.");
    expect(
      statusMessageForLicenseState({
        valid: false,
        plan: "free",
        status: "revoked"
      })
    ).toBe("This license is no longer active.");
  });

  it("stores an active Beta Pro license after successful verification", async () => {
    mockedApiRequest.mockResolvedValue({
      valid: true,
      plan: "beta_pro",
      status: "active"
    });

    const result = await activateLicenseKey("lh-beta-TEST-TEST-TEST-TEST");

    expect(result.statusMessage).toBe("License active");
    expect(result.licenseState).toMatchObject({
      licenseKey: "lh-beta-TEST-TEST-TEST-TEST",
      valid: true,
      plan: "beta_pro",
      status: "active"
    });
    expect(storageSet).toHaveBeenCalled();
  });

  it("stores a free invalid state after invalid verification", async () => {
    mockedApiRequest.mockResolvedValue({
      valid: false,
      plan: "free",
      status: "invalid"
    });

    const result = await activateLicenseKey("bad-key");

    expect(result.statusMessage).toBe("Invalid license");
    expect(result.licenseState).toMatchObject({
      valid: false,
      plan: "free",
      status: "invalid"
    });
  });

  it("stores a free revoked state after revoked verification", async () => {
    mockedApiRequest.mockResolvedValue({
      valid: false,
      plan: "free",
      status: "revoked",
      source: "tester",
      message: "This license is no longer active."
    });

    const result = await activateLicenseKey("lh-beta-TEST-TEST-TEST-TEST");

    expect(result.statusMessage).toBe("This license is no longer active.");
    expect(result.licenseState).toMatchObject({
      valid: false,
      plan: "free",
      status: "revoked"
    });
  });

  it("shows a detailed unable-to-verify message after backend or network failure", async () => {
    mockedApiRequest.mockRejectedValue(new Error("No response from extension background service worker"));

    const result = await activateLicenseKey("lh-beta-TEST-TEST-TEST-TEST");

    expect(result.statusMessage).toBe("Unable to verify license: No response from extension background service worker");
    expect(result.licenseState).toMatchObject({
      valid: false,
      plan: "free",
      status: "unable_to_verify"
    });
  });
});
