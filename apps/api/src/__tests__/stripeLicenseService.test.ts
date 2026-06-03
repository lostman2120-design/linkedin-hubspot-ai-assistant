import { createHmac } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LicenseRepository } from "../services/license.repository.js";
import { StripeLicenseService, verifyStripeWebhookEvent } from "../services/stripe-license.service.js";

const webhookSecret = "whsec_test_secret";

afterEach(() => {
  vi.unstubAllEnvs();
});

async function createTestRepository(): Promise<LicenseRepository> {
  const directory = await mkdtemp(join(tmpdir(), "lhai-stripe-test-"));
  return new LicenseRepository(join(directory, "license-db.json"));
}

function stripeSignatureHeader(rawBody: Buffer, secret = webhookSecret): string {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = createHmac("sha256", secret).update(`${timestamp}.${rawBody.toString("utf8")}`).digest("hex");
  return `t=${timestamp},v1=${signature}`;
}

describe("Stripe license service", () => {
  it("verifies Stripe webhook signatures with the raw request body", () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", webhookSecret);
    const rawBody = Buffer.from(JSON.stringify({ id: "evt_1", type: "invoice.paid", data: { object: {} } }));

    expect(verifyStripeWebhookEvent(rawBody, stripeSignatureHeader(rawBody))).toMatchObject({
      id: "evt_1",
      type: "invoice.paid"
    });
  });

  it("rejects Stripe webhooks with invalid signatures", () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", webhookSecret);
    const rawBody = Buffer.from(JSON.stringify({ id: "evt_1", type: "invoice.paid", data: { object: {} } }));

    expect(() => verifyStripeWebhookEvent(rawBody, stripeSignatureHeader(rawBody, "wrong_secret"))).toThrow(
      "Stripe webhook signature could not be verified."
    );
  });

  it("creates one active license for a checkout session and ignores duplicate events", async () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", webhookSecret);
    vi.stubEnv("STRIPE_PAYMENT_LINK_ID", "plink_beta");
    const repository = await createTestRepository();
    const service = new StripeLicenseService(repository);
    const rawBody = Buffer.from(
      JSON.stringify({
        id: "evt_checkout",
        type: "checkout.session.completed",
        data: {
          object: {
            id: "cs_test",
            payment_link: "plink_beta",
            customer: "cus_test",
            subscription: "sub_test",
            customer_details: {
              email: "buyer@example.com"
            }
          }
        }
      })
    );

    await expect(service.verifyAndProcessWebhook(rawBody, stripeSignatureHeader(rawBody))).resolves.toMatchObject({
      received: true,
      eventId: "evt_checkout"
    });
    await expect(service.verifyAndProcessWebhook(rawBody, stripeSignatureHeader(rawBody))).resolves.toMatchObject({
      received: true,
      duplicate: true
    });

    const licenses = await repository.listLicenses();
    expect(licenses).toHaveLength(1);
    expect(licenses[0]).toMatchObject({
      email: "buyer@example.com",
      status: "active",
      stripeSubscriptionId: "sub_test"
    });
    expect(licenses[0]?.licenseKey).toMatch(/^lh-beta-/);
  });

  it("sets a license to past_due when payment fails", async () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", webhookSecret);
    const repository = await createTestRepository();
    const service = new StripeLicenseService(repository);
    await repository.upsertLicenseForStripeCheckout({
      email: "buyer@example.com",
      licenseKey: "lh-beta-ABCD-EFGH-JKLM-NPQR",
      stripeCustomerId: "cus_test",
      stripeSubscriptionId: "sub_test",
      stripeCheckoutSessionId: "cs_test",
      status: "active"
    });
    const rawBody = Buffer.from(
      JSON.stringify({
        id: "evt_payment_failed",
        type: "invoice.payment_failed",
        data: {
          object: {
            id: "in_test",
            customer: "cus_test",
            subscription: "sub_test"
          }
        }
      })
    );

    await service.verifyAndProcessWebhook(rawBody, stripeSignatureHeader(rawBody));

    const license = await repository.findByStripeSubscriptionId("sub_test");
    expect(license?.status).toBe("past_due");
  });

  it("handles invoice.payment_succeeded like invoice.paid", async () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", webhookSecret);
    const repository = await createTestRepository();
    const service = new StripeLicenseService(repository);
    await repository.upsertLicenseForStripeCheckout({
      email: "buyer@example.com",
      licenseKey: "lh-beta-ABCD-EFGH-JKLM-NPQR",
      stripeCustomerId: "cus_test",
      stripeSubscriptionId: "sub_test",
      stripeCheckoutSessionId: "cs_test",
      status: "past_due"
    });
    const rawBody = Buffer.from(
      JSON.stringify({
        id: "evt_payment_succeeded",
        type: "invoice.payment_succeeded",
        data: {
          object: {
            id: "in_test",
            customer: "cus_test",
            subscription: "sub_test"
          }
        }
      })
    );

    await service.verifyAndProcessWebhook(rawBody, stripeSignatureHeader(rawBody));

    const license = await repository.findByStripeSubscriptionId("sub_test");
    expect(license?.status).toBe("active");
  });
});
