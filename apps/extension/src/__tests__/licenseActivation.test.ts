import { describe, expect, it } from "vitest";
import { statusMessageForLicenseState } from "../licenseActivation";
import type { StoredLicenseState } from "../storage";

describe("license activation UI status messages", () => {
  it("shows the active message for a valid Beta Pro license", () => {
    const licenseState = {
      valid: true,
      plan: "beta_pro",
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
});
