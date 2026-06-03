import { createHmac, timingSafeEqual } from "node:crypto";
import { AppError } from "../utils/errors.js";
import { sendLicenseEmailWebhook } from "./license-email.service.js";
import { createLicenseRepository, type LicenseRecord, type LicenseRepositoryLike, type LicenseStatus } from "./license.repository.js";
import { generateUniqueLicenseKey, maskLicenseKey } from "./license.service.js";

type StripeEvent = {
  id: string;
  type: string;
  data: {
    object: Record<string, unknown>;
  };
};

type WebhookProcessResult = {
  received: true;
  eventId: string;
  type: string;
  duplicate?: boolean;
  ignored?: boolean;
  licenseId?: string;
  warning?: string;
};

export class StripeLicenseService {
  constructor(private readonly repository: LicenseRepositoryLike = createLicenseRepository()) {}

  async verifyAndProcessWebhook(rawBody: Buffer, signatureHeader: string | undefined): Promise<WebhookProcessResult> {
    logStripe("Request reached /api/stripe/webhook.", { bytes: rawBody.length });
    const event = verifyStripeWebhookEvent(rawBody, signatureHeader);
    logStripe("Stripe signature verification succeeded.", {
      eventId: event.id,
      type: event.type
    });

    if (await this.repository.hasProcessedStripeEvent(event.id)) {
      logStripe("Stripe event already processed. Skipping duplicate.", {
        eventId: event.id,
        type: event.type
      });
      return {
        received: true,
        eventId: event.id,
        type: event.type,
        duplicate: true
      };
    }

    const result = await this.processEvent(event);
    await this.repository.recordProcessedStripeEvent(event.id, event.type);
    return result;
  }

  private async processEvent(event: StripeEvent): Promise<WebhookProcessResult> {
    if (event.type === "checkout.session.completed") {
      return this.handleCheckoutSessionCompleted(event);
    }

    if (event.type === "customer.subscription.updated") {
      return this.handleSubscriptionUpdated(event);
    }

    if (event.type === "customer.subscription.deleted") {
      return this.handleSubscriptionDeleted(event);
    }

    if (event.type === "invoice.paid" || event.type === "invoice.payment_succeeded") {
      return this.handleInvoicePaid(event);
    }

    if (event.type === "invoice.payment_failed") {
      return this.handleInvoicePaymentFailed(event);
    }

    logStripe("Unsupported Stripe event ignored.", {
      eventId: event.id,
      type: event.type
    });
    return {
      received: true,
      eventId: event.id,
      type: event.type,
      ignored: true
    };
  }

  private async handleCheckoutSessionCompleted(event: StripeEvent): Promise<WebhookProcessResult> {
    const session = event.data.object;
    logStripe("checkout.session.completed received.", {
      eventId: event.id,
      checkoutSessionId: getString(session.id)
    });

    if (!isExpectedPaymentLinkSession(session)) {
      logStripe("Checkout session ignored because payment_link does not match STRIPE_PAYMENT_LINK_ID.", {
        eventId: event.id,
        checkoutSessionId: getString(session.id),
        paymentLinkId: getStripeId(session.payment_link)
      });
      return {
        received: true,
        eventId: event.id,
        type: event.type,
        ignored: true
      };
    }

    const email = getCheckoutSessionEmail(session);
    const stripeSubscriptionId = getStripeId(session.subscription);
    const stripeCustomerId = getStripeId(session.customer);

    logStripe("Checkout customer details extracted.", {
      eventId: event.id,
      email: email ?? "(missing)",
      stripeCustomerId,
      stripeSubscriptionId
    });
    const missingEmailWarning = email ? undefined : "Checkout session did not include a customer email. License was saved, but email was not sent.";
    if (missingEmailWarning) {
      console.error("[stripe-webhook] Customer email missing from checkout.session.completed. Zapier email will not be sent.", {
        eventId: event.id,
        stripeCustomerId,
        stripeSubscriptionId
      });
    }

    if (!stripeSubscriptionId) {
      logStripe("Checkout session ignored because subscription id is missing.", {
        eventId: event.id,
        email: email ?? "(missing)",
        stripeCustomerId
      });
      return {
        received: true,
        eventId: event.id,
        type: event.type,
        ignored: true
      };
    }

    const existingLicense = await this.repository.findByStripeSubscriptionId(stripeSubscriptionId);
    const licenseKey = existingLicense?.licenseKey ?? (await generateUniqueLicenseKey(this.repository));
    logStripe("Checkout license lookup complete.", {
      eventId: event.id,
      existingLicenseFound: Boolean(existingLicense),
      maskedLicenseKey: maskLicenseKey(licenseKey)
    });

    const license = await this.repository.upsertLicenseForStripeCheckout({
      email: email ?? "",
      licenseKey,
      stripeCustomerId,
      stripeSubscriptionId,
      stripeCheckoutSessionId: getString(session.id) ?? event.id,
      status: "active",
      currentPeriodEnd: getCurrentPeriodEndIso(session)
    });
    logStripe(existingLicense ? "Existing license reused and updated." : "New license created.", {
      eventId: event.id,
      licenseId: license.id,
      maskedLicenseKey: maskLicenseKey(license.licenseKey),
      status: license.status
    });

    if (!license.lastEmailSentAt) {
      await this.trySendLicenseEmail(license);
    } else {
      logStripe("License email already sent previously. Skipping Zapier call.", {
        eventId: event.id,
        licenseId: license.id,
        lastEmailSentAt: license.lastEmailSentAt
      });
    }

    return {
      received: true,
      eventId: event.id,
      type: event.type,
      licenseId: license.id,
      warning: missingEmailWarning
    };
  }

  private async handleSubscriptionUpdated(event: StripeEvent): Promise<WebhookProcessResult> {
    const subscription = event.data.object;
    const stripeSubscriptionId = getString(subscription.id);
    logStripe("customer.subscription.updated received.", {
      eventId: event.id,
      stripeSubscriptionId,
      stripeCustomerId: getStripeId(subscription.customer),
      stripeStatus: getString(subscription.status)
    });

    if (!stripeSubscriptionId) {
      return this.ignored(event);
    }

    const license = await this.repository.findByStripeSubscriptionId(stripeSubscriptionId);

    if (!license) {
      return this.ignored(event);
    }

    const updatedLicense = await this.repository.updateLicenseStatus(license.id, {
      status: subscriptionStatusToLicenseStatus(getString(subscription.status)),
      currentPeriodEnd: getCurrentPeriodEndIso(subscription),
      stripeCustomerId: getStripeId(subscription.customer)
    });
    logStripe("License status updated from subscription update.", {
      eventId: event.id,
      licenseId: updatedLicense?.id,
      status: updatedLicense?.status
    });

    return {
      received: true,
      eventId: event.id,
      type: event.type,
      licenseId: updatedLicense?.id
    };
  }

  private async handleSubscriptionDeleted(event: StripeEvent): Promise<WebhookProcessResult> {
    const subscription = event.data.object;
    const stripeSubscriptionId = getString(subscription.id);
    logStripe("customer.subscription.deleted received.", {
      eventId: event.id,
      stripeSubscriptionId,
      stripeCustomerId: getStripeId(subscription.customer)
    });

    if (!stripeSubscriptionId) {
      return this.ignored(event);
    }

    const license = await this.repository.findByStripeSubscriptionId(stripeSubscriptionId);

    if (!license) {
      return this.ignored(event);
    }

    const updatedLicense = await this.repository.updateLicenseStatus(license.id, {
      status: "canceled",
      currentPeriodEnd: getCurrentPeriodEndIso(subscription),
      stripeCustomerId: getStripeId(subscription.customer)
    });
    logStripe("License canceled from subscription deleted event.", {
      eventId: event.id,
      licenseId: updatedLicense?.id,
      status: updatedLicense?.status
    });

    return {
      received: true,
      eventId: event.id,
      type: event.type,
      licenseId: updatedLicense?.id
    };
  }

  private async handleInvoicePaid(event: StripeEvent): Promise<WebhookProcessResult> {
    const invoice = event.data.object;
    logStripe(`${event.type} received.`, {
      eventId: event.id,
      stripeCustomerId: getStripeId(invoice.customer),
      stripeSubscriptionId: getStripeId(invoice.subscription) ?? getNestedString(invoice, ["parent", "subscription_details", "subscription"])
    });
    const license = await this.findLicenseForInvoice(invoice);

    if (!license) {
      return this.ignored(event);
    }

    const updatedLicense = await this.repository.updateLicenseStatus(license.id, {
      status: "active",
      currentPeriodEnd: getInvoicePeriodEndIso(invoice),
      stripeCustomerId: getStripeId(invoice.customer)
    });
    logStripe("License activated from invoice paid event.", {
      eventId: event.id,
      licenseId: updatedLicense?.id,
      status: updatedLicense?.status
    });

    return {
      received: true,
      eventId: event.id,
      type: event.type,
      licenseId: updatedLicense?.id
    };
  }

  private async handleInvoicePaymentFailed(event: StripeEvent): Promise<WebhookProcessResult> {
    const invoice = event.data.object;
    logStripe("invoice.payment_failed received.", {
      eventId: event.id,
      stripeCustomerId: getStripeId(invoice.customer),
      stripeSubscriptionId: getStripeId(invoice.subscription) ?? getNestedString(invoice, ["parent", "subscription_details", "subscription"])
    });
    const license = await this.findLicenseForInvoice(invoice);

    if (!license) {
      return this.ignored(event);
    }

    const updatedLicense = await this.repository.updateLicenseStatus(license.id, {
      status: "past_due",
      currentPeriodEnd: getInvoicePeriodEndIso(invoice),
      stripeCustomerId: getStripeId(invoice.customer)
    });
    logStripe("License marked past_due from invoice payment failed event.", {
      eventId: event.id,
      licenseId: updatedLicense?.id,
      status: updatedLicense?.status
    });

    return {
      received: true,
      eventId: event.id,
      type: event.type,
      licenseId: updatedLicense?.id
    };
  }

  private async findLicenseForInvoice(invoice: Record<string, unknown>): Promise<LicenseRecord | null> {
    const stripeSubscriptionId =
      getStripeId(invoice.subscription) ?? getNestedString(invoice, ["parent", "subscription_details", "subscription"]);

    if (stripeSubscriptionId) {
      const license = await this.repository.findByStripeSubscriptionId(stripeSubscriptionId);
      if (license) {
        return license;
      }
    }

    const stripeCustomerId = getStripeId(invoice.customer);
    return stripeCustomerId ? this.repository.findByStripeCustomerId(stripeCustomerId) : null;
  }

  private async trySendLicenseEmail(license: LicenseRecord): Promise<void> {
    try {
      logStripe("Calling license email webhook.", {
        licenseId: license.id,
        email: license.email || "(missing)",
        maskedLicenseKey: maskLicenseKey(license.licenseKey)
      });
      const sent = await sendLicenseEmailWebhook(license);
      if (sent) {
        await this.repository.updateLastEmailSentAt(license.id);
        logStripe("License email webhook completed successfully.", {
          licenseId: license.id
        });
      } else {
        logStripe("License email webhook was not called or did not send.", {
          licenseId: license.id,
          email: license.email || "(missing)"
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown license email webhook error.";
      console.error("[stripe-webhook] License email webhook failed:", message);
      if (error instanceof Error && error.stack) {
        console.error(error.stack);
      }
    }
  }

  private ignored(event: StripeEvent): WebhookProcessResult {
    return {
      received: true,
      eventId: event.id,
      type: event.type,
      ignored: true
    };
  }
}

export function verifyStripeWebhookEvent(rawBody: Buffer, signatureHeader: string | undefined): StripeEvent {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();

  if (!webhookSecret) {
    throw new AppError(500, "Stripe webhook secret is missing.");
  }

  if (!signatureHeader) {
    throw new AppError(400, "Stripe webhook signature is missing.");
  }

  const parsedSignature = parseStripeSignatureHeader(signatureHeader);
  if (!parsedSignature.timestamp || parsedSignature.signatures.length === 0) {
    throw new AppError(400, "Stripe webhook signature is not valid.");
  }

  const timestampAgeSeconds = Math.abs(Date.now() / 1000 - Number(parsedSignature.timestamp));
  if (timestampAgeSeconds > 300) {
    throw new AppError(400, "Stripe webhook signature is too old.");
  }

  const payloadToSign = `${parsedSignature.timestamp}.${rawBody.toString("utf8")}`;
  const expectedSignature = createHmac("sha256", webhookSecret).update(payloadToSign).digest("hex");

  const hasMatchingSignature = parsedSignature.signatures.some((signature) => safeCompareHex(signature, expectedSignature));
  if (!hasMatchingSignature) {
    throw new AppError(400, "Stripe webhook signature could not be verified.");
  }

  const parsedEvent = JSON.parse(rawBody.toString("utf8")) as Partial<StripeEvent>;

  if (!parsedEvent.id || !parsedEvent.type || !parsedEvent.data || typeof parsedEvent.data.object !== "object") {
    throw new AppError(400, "Stripe webhook event is not in the expected format.");
  }

  return parsedEvent as StripeEvent;
}

function logStripe(message: string, details?: Record<string, unknown>): void {
  if (details) {
    console.log(`[stripe-webhook] ${message}`, details);
    return;
  }

  console.log(`[stripe-webhook] ${message}`);
}

function parseStripeSignatureHeader(signatureHeader: string): { timestamp: string | null; signatures: string[] } {
  const values = signatureHeader.split(",").map((part) => part.trim().split("="));
  const timestamp = values.find(([key]) => key === "t")?.[1] ?? null;
  const signatures = values.flatMap(([key, value]) => (key === "v1" && value ? [value] : []));
  return { timestamp, signatures };
}

function safeCompareHex(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function isExpectedPaymentLinkSession(session: Record<string, unknown>): boolean {
  const expectedPaymentLinkId = process.env.STRIPE_PAYMENT_LINK_ID?.trim();

  if (!expectedPaymentLinkId) {
    return true;
  }

  return getStripeId(session.payment_link) === expectedPaymentLinkId;
}

function getCheckoutSessionEmail(session: Record<string, unknown>): string | null {
  return getNestedString(session, ["customer_details", "email"]) ?? getString(session.customer_email);
}

function subscriptionStatusToLicenseStatus(status: string | null | undefined): LicenseStatus {
  if (status === "active" || status === "trialing") {
    return "active";
  }

  if (status === "past_due" || status === "unpaid") {
    return "past_due";
  }

  if (status === "canceled") {
    return "canceled";
  }

  return "inactive";
}

function getCurrentPeriodEndIso(value: Record<string, unknown>): string | null {
  return unixTimestampToIso(value.current_period_end);
}

function getInvoicePeriodEndIso(invoice: Record<string, unknown>): string | null {
  return (
    unixTimestampToIso(getNestedValue(invoice, ["lines", "data", "0", "period", "end"])) ??
    unixTimestampToIso(invoice.period_end) ??
    null
  );
}

function unixTimestampToIso(value: unknown): string | null {
  return typeof value === "number" && Number.isFinite(value) ? new Date(value * 1000).toISOString() : null;
}

function getStripeId(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "object" && value !== null && typeof (value as Record<string, unknown>).id === "string") {
    return (value as Record<string, unknown>).id as string;
  }

  return null;
}

function getString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function getNestedString(value: Record<string, unknown>, path: string[]): string | null {
  const nestedValue = getNestedValue(value, path);
  return typeof nestedValue === "string" && nestedValue.trim() ? nestedValue : null;
}

function getNestedValue(value: Record<string, unknown>, path: string[]): unknown {
  return path.reduce<unknown>((currentValue, key) => {
    if (Array.isArray(currentValue) && /^\d+$/.test(key)) {
      return currentValue[Number(key)];
    }

    if (typeof currentValue === "object" && currentValue !== null) {
      return (currentValue as Record<string, unknown>)[key];
    }

    return undefined;
  }, value);
}
