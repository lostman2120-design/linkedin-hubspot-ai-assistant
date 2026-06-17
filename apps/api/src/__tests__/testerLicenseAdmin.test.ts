import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LicenseRepository } from "../services/license.repository.js";
import { verifyBetaProLicenseKey } from "../services/license.service.js";
import {
  createTesterLicense,
  inspectLicense,
  listTesterLicenses,
  parsePositiveTesterDays,
  revokeLicense
} from "../services/tester-license-admin.service.js";

async function createTestRepository(): Promise<LicenseRepository> {
  const directory = await mkdtemp(join(tmpdir(), "lhai-tester-license-test-"));
  return new LicenseRepository(join(directory, "license-db.json"));
}

describe("tester license admin service", () => {
  it("creates secure unique tester keys with expiration and null Stripe fields", async () => {
    const repository = await createTestRepository();
    const firstLicense = await createTesterLicense(repository, {
      label: "Chaofan feedback test",
      plan: "beta_pro",
      days: 7,
      now: new Date("2026-06-17T00:00:00.000Z")
    });
    const secondLicense = await createTesterLicense(repository, {
      email: "tester@example.com",
      label: "Second feedback test",
      plan: "pro",
      days: 3,
      now: new Date("2026-06-17T00:00:00.000Z")
    });

    expect(firstLicense.licenseKey).toMatch(/^lh-beta-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
    expect(secondLicense.licenseKey).toMatch(/^lh-beta-/);
    expect(secondLicense.licenseKey).not.toBe(firstLicense.licenseKey);
    expect(firstLicense).toMatchObject({
      email: "tester-license@internal.invalid",
      plan: "beta_pro",
      status: "active",
      source: "tester",
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      stripeCheckoutSessionId: null,
      expiresAt: "2026-06-24T00:00:00.000Z"
    });
    expect(secondLicense.plan).toBe("pro");
  });

  it("rejects invalid tester expiration values", () => {
    expect(() => parsePositiveTesterDays("0")).toThrow("positive number of days");
    expect(() => parsePositiveTesterDays("-3")).toThrow("positive number of days");
    expect(() => parsePositiveTesterDays("not-a-number")).toThrow("positive number of days");
  });

  it("revokes a tester key and makes verification invalid", async () => {
    const repository = await createTestRepository();
    const license = await createTesterLicense(repository, {
      label: "Revocation test",
      days: 7
    });

    const revokedLicense = await revokeLicense(repository, license.licenseKey);
    const verification = await verifyBetaProLicenseKey(license.licenseKey, repository, "");

    expect(revokedLicense.revokedAt).toBeTruthy();
    expect(verification).toMatchObject({
      valid: false,
      plan: "free",
      status: "revoked",
      source: "tester"
    });
  });

  it("inspect and list views never return full license keys", async () => {
    const repository = await createTestRepository();
    const license = await createTesterLicense(repository, {
      email: "tester@example.com",
      label: "Masking test",
      days: 7
    });

    const inspected = await inspectLicense(repository, license.licenseKey);
    const listed = await listTesterLicenses(repository);

    expect(inspected.licenseKey).toBe(`lh-beta-****-****-${license.licenseKey.split("-").at(-1)}`);
    expect(inspected.licenseKey).not.toBe(license.licenseKey);
    expect(JSON.stringify(listed)).not.toContain(license.licenseKey);
  });
});
