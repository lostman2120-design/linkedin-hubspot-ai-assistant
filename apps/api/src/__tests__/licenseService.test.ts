import { describe, expect, it } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { LicenseRepository } from "../services/license.repository.js";
import { generateLicenseKey, verifyBetaProLicenseKey } from "../services/license.service.js";

async function createTestRepository(): Promise<LicenseRepository> {
  const directory = await mkdtemp(join(tmpdir(), "lhai-license-test-"));
  return new LicenseRepository(join(directory, "license-db.json"));
}

describe("license service", () => {
  it("returns Beta Pro when the license key is in the development allowlist", async () => {
    await expect(verifyBetaProLicenseKey("pro-key-2", await createTestRepository(), "pro-key-1, pro-key-2,pro-key-3")).resolves.toEqual({
      valid: true,
      plan: "beta_pro",
      status: "active",
      source: "internal",
      type: "internal"
    });
  });

  it("returns Free when the license key is not allowed", async () => {
    await expect(verifyBetaProLicenseKey("unknown-key", await createTestRepository(), "pro-key-1,pro-key-2")).resolves.toEqual({
      valid: false,
      plan: "free",
      status: "invalid"
    });
  });

  it("returns Beta Pro for an active database license", async () => {
    const repository = await createTestRepository();
    await repository.upsertLicenseForStripeCheckout({
      email: "buyer@example.com",
      licenseKey: "lh-beta-ABCD-EFGH-JKLM-NPQR",
      stripeCustomerId: "cus_123",
      stripeSubscriptionId: "sub_123",
      stripeCheckoutSessionId: "cs_123",
      status: "active",
      currentPeriodEnd: "2026-07-01T00:00:00.000Z"
    });

    await expect(verifyBetaProLicenseKey("lh-beta-ABCD-EFGH-JKLM-NPQR", repository, "")).resolves.toMatchObject({
      valid: true,
      plan: "beta_pro",
      status: "active",
      source: "stripe",
      email: "bu***@example.com",
      currentPeriodEnd: "2026-07-01T00:00:00.000Z"
    });
  });

  it("creates and verifies an internal active Beta Pro license without Stripe fields", async () => {
    const repository = await createTestRepository();
    const license = await repository.createInternalLicense({
      email: "owner@example.com",
      licenseKey: "lh-beta-BCDF-GHJK-LMNP-QRST",
      status: "active"
    });

    expect(license).toMatchObject({
      email: "owner@example.com",
      licenseKey: "lh-beta-BCDF-GHJK-LMNP-QRST",
      plan: "beta_pro",
      status: "active",
      source: "internal",
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      stripeCheckoutSessionId: null
    });

    await expect(verifyBetaProLicenseKey("lh-beta-BCDF-GHJK-LMNP-QRST", repository, "")).resolves.toMatchObject({
      valid: true,
      plan: "beta_pro",
      status: "active",
      source: "internal",
      email: "ow***@example.com"
    });
  });

  it("verifies an active tester license without Stripe fields", async () => {
    const repository = await createTestRepository();
    await repository.createTesterLicense({
      email: "tester@example.com",
      licenseKey: "lh-beta-CDEF-GHJK-LMNP-QRST",
      plan: "beta_pro",
      status: "active",
      expiresAt: "2099-01-01T00:00:00.000Z",
      label: "External feedback test"
    });

    await expect(verifyBetaProLicenseKey("lh-beta-CDEF-GHJK-LMNP-QRST", repository, "")).resolves.toMatchObject({
      valid: true,
      plan: "beta_pro",
      status: "active",
      source: "tester",
      type: "tester",
      email: "te***@example.com",
      expiresAt: "2099-01-01T00:00:00.000Z"
    });
  });

  it("rejects an expired tester license", async () => {
    const repository = await createTestRepository();
    await repository.createTesterLicense({
      email: "tester@example.com",
      licenseKey: "lh-beta-DDDD-GHJK-LMNP-QRST",
      plan: "beta_pro",
      status: "active",
      expiresAt: "2000-01-01T00:00:00.000Z",
      label: "Expired feedback test"
    });

    await expect(verifyBetaProLicenseKey("lh-beta-DDDD-GHJK-LMNP-QRST", repository, "")).resolves.toMatchObject({
      valid: false,
      plan: "free",
      status: "expired",
      source: "tester",
      message: "This test license has expired."
    });
  });

  it("rejects a revoked tester license", async () => {
    const repository = await createTestRepository();
    await repository.createTesterLicense({
      email: "tester@example.com",
      licenseKey: "lh-beta-EEEE-GHJK-LMNP-QRST",
      plan: "beta_pro",
      status: "active",
      expiresAt: "2099-01-01T00:00:00.000Z",
      label: "Revoked feedback test"
    });
    await repository.revokeLicenseByKey("lh-beta-EEEE-GHJK-LMNP-QRST", "2026-06-17T00:00:00.000Z");

    await expect(verifyBetaProLicenseKey("lh-beta-EEEE-GHJK-LMNP-QRST", repository, "")).resolves.toMatchObject({
      valid: false,
      plan: "free",
      status: "revoked",
      source: "tester",
      message: "This license is no longer active."
    });
  });

  it("does not treat a past due paid Stripe license as active", async () => {
    const repository = await createTestRepository();
    await repository.upsertLicenseForStripeCheckout({
      email: "buyer@example.com",
      licenseKey: "lh-beta-FFFF-GHJK-LMNP-QRST",
      stripeCustomerId: "cus_123",
      stripeSubscriptionId: "sub_past_due",
      stripeCheckoutSessionId: "cs_past_due",
      status: "past_due"
    });

    await expect(verifyBetaProLicenseKey("lh-beta-FFFF-GHJK-LMNP-QRST", repository, "")).resolves.toMatchObject({
      valid: false,
      plan: "free",
      status: "past_due",
      source: "stripe"
    });
  });

  it("does not expose Stripe identifiers in the public verification response", async () => {
    const repository = await createTestRepository();
    await repository.upsertLicenseForStripeCheckout({
      email: "buyer@example.com",
      licenseKey: "lh-beta-GGGG-GHJK-LMNP-QRST",
      stripeCustomerId: "cus_secret",
      stripeSubscriptionId: "sub_secret",
      stripeCheckoutSessionId: "cs_secret",
      status: "active"
    });

    const result = await verifyBetaProLicenseKey("lh-beta-GGGG-GHJK-LMNP-QRST", repository, "");

    expect("stripeCustomerId" in result).toBe(false);
    expect("stripeSubscriptionId" in result).toBe(false);
    expect("stripeCheckoutSessionId" in result).toBe(false);
  });

  it("generates license keys in the public beta format", () => {
    expect(generateLicenseKey()).toMatch(/^lh-beta-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
  });
});
