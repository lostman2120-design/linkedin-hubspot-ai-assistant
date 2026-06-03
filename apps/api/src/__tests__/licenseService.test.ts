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
      status: "active"
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
      email: "bu***@example.com",
      currentPeriodEnd: "2026-07-01T00:00:00.000Z"
    });
  });

  it("generates license keys in the public beta format", () => {
    expect(generateLicenseKey()).toMatch(/^lh-beta-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
  });
});
