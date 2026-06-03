import type { LicenseRecord } from "./license.repository.js";
import { maskLicenseKey } from "./license.service.js";

const productName = "LinkedIn to HubSpot AI Assistant — Beta";
const chromeWebStoreUrl = "https://chromewebstore.google.com/detail/linkedin-to-hubspot-ai-as/mlioefhljfcgleibeibbifdemagocfld";

export type LicenseEmailPayload = {
  email: string;
  licenseKey: string;
  productName: string;
  chromeWebStoreUrl: string;
};

export function buildLicenseEmailPayload(license: LicenseRecord): LicenseEmailPayload {
  return {
    email: license.email,
    licenseKey: license.licenseKey,
    productName,
    chromeWebStoreUrl
  };
}

export async function sendLicenseEmailWebhook(license: LicenseRecord): Promise<boolean> {
  const webhookUrl = process.env.LICENSE_EMAIL_WEBHOOK_URL?.trim();

  if (!webhookUrl) {
    console.warn("[license-email] LICENSE_EMAIL_WEBHOOK_URL is not configured. License email was not sent.");
    return false;
  }

  if (!isValidEmail(license.email)) {
    console.error("[license-email] Missing or invalid customer email. Zapier webhook was not called.", {
      licenseId: license.id,
      stripeSubscriptionId: license.stripeSubscriptionId
    });
    return false;
  }

  const payload = buildLicenseEmailPayload(license);
  console.log("[license-email] Calling Zapier license email webhook.", {
    email: license.email,
    licenseId: license.id,
    maskedLicenseKey: maskLicenseKey(license.licenseKey),
    payloadFields: Object.keys(payload)
  });

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const responseText = await response.text();
  console.log("[license-email] Zapier license email webhook response.", {
    status: response.status,
    ok: response.ok,
    responseText: responseText.slice(0, 500)
  });

  if (!response.ok) {
    throw new Error(`License email webhook failed with HTTP ${response.status}: ${responseText.slice(0, 500)}`);
  }

  return true;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}
