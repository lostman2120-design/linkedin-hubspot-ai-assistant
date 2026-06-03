import { describe, expect, it } from "vitest";
import { getPlanAccess, isBetaProLicenseActive, isFeatureLockedForFree, planLabel } from "../plan";
import type { DailyUsage, StoredLicenseState } from "../storage";

const freeLicense: StoredLicenseState = {
  valid: false,
  plan: "free",
  status: "none"
};

const betaProLicense: StoredLicenseState = {
  licenseKey: "beta-key",
  valid: true,
  plan: "beta_pro",
  status: "active"
};

const unusedFreeUsage: DailyUsage = {
  date: "2026-06-02",
  profileAnalyses: 0,
  outreachDrafts: 0
};

describe("plan gate", () => {
  it("labels active licenses as Beta Pro", () => {
    expect(isBetaProLicenseActive(betaProLicense)).toBe(true);
    expect(planLabel(betaProLicense)).toBe("Beta Pro");
  });

  it("allows Free users to analyze three profiles per day", () => {
    expect(getPlanAccess({ feature: "analyze_profile", licenseState: freeLicense, usage: unusedFreeUsage })).toEqual({
      allowed: true
    });

    expect(
      getPlanAccess({
        feature: "analyze_profile",
        licenseState: freeLicense,
        usage: { ...unusedFreeUsage, profileAnalyses: 3 }
      })
    ).toMatchObject({ allowed: false, reason: "limit_reached" });
  });

  it("allows Free users to create one First DM per day", () => {
    expect(getPlanAccess({ feature: "first_dm", licenseState: freeLicense, usage: unusedFreeUsage })).toEqual({
      allowed: true
    });

    expect(
      getPlanAccess({
        feature: "first_dm",
        licenseState: freeLicense,
        usage: { ...unusedFreeUsage, outreachDrafts: 1 }
      })
    ).toMatchObject({ allowed: false, reason: "limit_reached" });
  });

  it("locks premium features on the Free plan", () => {
    expect(isFeatureLockedForFree("connection_message", freeLicense)).toBe(true);
    expect(getPlanAccess({ feature: "add_to_hubspot", licenseState: freeLicense, usage: unusedFreeUsage })).toMatchObject({
      allowed: false,
      reason: "beta_pro_only",
      message: "Available in Beta Pro"
    });
  });

  it("unlocks all features on Beta Pro", () => {
    expect(getPlanAccess({ feature: "create_hubspot_note", licenseState: betaProLicense, usage: unusedFreeUsage })).toEqual({
      allowed: true
    });
  });
});
