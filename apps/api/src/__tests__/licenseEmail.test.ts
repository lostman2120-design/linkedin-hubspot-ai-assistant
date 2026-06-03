import { describe, expect, it } from "vitest";
import { buildLicenseEmailPayload } from "../services/license-email.service.js";
import type { LicenseRecord } from "../services/license.repository.js";

const license = {
  id: "license_1",
  email: "buyer@example.com",
  licenseKey: "lh-beta-ABCD-EFGH-JKLM-NPQR",
  plan: "beta_pro",
  status: "active",
  stripeCustomerId: "cus_123",
  stripeSubscriptionId: "sub_123",
  stripeCheckoutSessionId: "cs_123",
  currentPeriodEnd: null,
  createdAt: "2026-06-02T00:00:00.000Z",
  updatedAt: "2026-06-02T00:00:00.000Z",
  lastEmailSentAt: null
} satisfies LicenseRecord;

describe("license email payload", () => {
  it("sends only the minimal Zapier payload fields", () => {
    const payload = buildLicenseEmailPayload(license);

    expect(Object.keys(payload).sort()).toEqual(["chromeWebStoreUrl", "email", "licenseKey", "productName"]);
    expect(payload).toMatchObject({
      email: "buyer@example.com",
      licenseKey: "lh-beta-ABCD-EFGH-JKLM-NPQR",
      productName: "LinkedIn to HubSpot AI Assistant — Beta",
      chromeWebStoreUrl: "https://chromewebstore.google.com/detail/linkedin-to-hubspot-ai-as/mlioefhljfcgleibeibbifdemagocfld"
    });
    expect("key" in payload).toBe(false);
    expect("license" in payload).toBe(false);
    expect("license_key" in payload).toBe(false);
    expect("licenseKeyText" in payload).toBe(false);
  });
});
