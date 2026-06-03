import type { Request, Response, NextFunction, RequestHandler } from "express";
import { Router } from "express";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import {
  AnalyzeProfileRequestSchema,
  CreateNoteRequestSchema,
  CreateTaskRequestSchema,
  GenerateDmRequestSchema,
  LicenseVerifyRequestSchema,
  UpsertContactRequestSchema
} from "@linkedin-hubspot-ai/shared";
import { HubSpotService } from "./services/hubspot.service.js";
import { sendLicenseEmailWebhook } from "./services/license-email.service.js";
import { createLicenseRepository, type LicenseRecord } from "./services/license.repository.js";
import { verifyBetaProLicenseKey } from "./services/license.service.js";
import { OpenAiService } from "./services/openai.service.js";
import { StripeLicenseService } from "./services/stripe-license.service.js";
import { AppError } from "./utils/errors.js";

const router = Router();
const openAiService = new OpenAiService();
const hubSpotService = new HubSpotService();
const licenseRepository = createLicenseRepository();
const stripeLicenseService = new StripeLicenseService(licenseRepository);

const AdminLicenseResendRequestSchema = z
  .object({
    licenseKey: z.string().trim().optional(),
    email: z.string().email().optional()
  })
  .refine((value) => Boolean(value.licenseKey || value.email), "Provide a licenseKey or email.");

function asyncHandler(handler: (req: Request, res: Response) => Promise<void>): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    void handler(req, res).catch(next);
  };
}

function buildAnalysisNoteBody(
  profileName: string,
  profileUrl: string,
  persona: string,
  leadScore: number,
  painPoints: string[],
  icebreaker: string,
  recommendedAction: string,
  dmMessage?: string
): string {
  const safeDm = dmMessage ? `<br><strong>Suggested DM:</strong><br>${escapeHtml(dmMessage)}` : "";
  return [
    `<strong>AI Summary for ${escapeHtml(profileName)}</strong>`,
    `<br><strong>LinkedIn:</strong> ${escapeHtml(profileUrl)}`,
    `<br><strong>Lead score:</strong> ${leadScore}`,
    `<br><strong>Persona:</strong> ${escapeHtml(persona)}`,
    `<br><strong>Pain points:</strong><br>${painPoints.map((point) => `- ${escapeHtml(point)}`).join("<br>")}`,
    `<br><strong>Icebreaker:</strong> ${escapeHtml(icebreaker)}`,
    `<br><strong>Recommended action:</strong> ${escapeHtml(recommendedAction)}`,
    safeDm
  ].join("");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

router.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "linkedin-hubspot-ai-api",
    port: Number(process.env.PORT ?? 8787)
  });
});

router.get("/hubspot/status", (_req, res) => {
  res.json({ configured: Boolean(process.env.HUBSPOT_PRIVATE_APP_TOKEN?.trim()) });
});

router.post(
  "/api/license/verify",
  asyncHandler(async (req, res) => {
    const { licenseKey } = LicenseVerifyRequestSchema.parse(req.body);
    console.log("[license-verify] Request received.", {
      maskedLicenseKey: maskLicenseKey(licenseKey)
    });

    try {
      const result = await verifyBetaProLicenseKey(licenseKey, licenseRepository);
      console.log("[license-verify] Verification complete.", {
        maskedLicenseKey: maskLicenseKey(licenseKey),
        licenseExists: result.status !== "invalid",
        status: result.status,
        betaProGranted: result.valid && result.plan === "beta_pro" && result.status === "active"
      });
      res.json(result);
    } catch (error) {
      console.error("[license-verify] Verification failed.");
      if (error instanceof Error && error.stack) {
        console.error(error.stack);
      }
      throw error;
    }
  })
);

router.get(
  "/api/admin/licenses",
  requireAdminSecret,
  asyncHandler(async (_req, res) => {
    const licenses = await licenseRepository.listLicenses();
    res.json({
      licenses: licenses.map(adminLicenseView)
    });
  })
);

router.post(
  "/api/admin/licenses/resend",
  requireAdminSecret,
  asyncHandler(async (req, res) => {
    const { email, licenseKey } = AdminLicenseResendRequestSchema.parse(req.body);
    const license = await licenseRepository.findByEmailOrLicenseKey({ email, licenseKey });

    if (!license) {
      throw new AppError(404, "License was not found.");
    }

    const sent = await sendLicenseEmailWebhook(license);
    const updatedLicense = sent ? await licenseRepository.updateLastEmailSentAt(license.id) : license;

    res.json({ sent, license: adminLicenseView(updatedLicense ?? license) });
  })
);

router.post(
  "/ai/analyze-profile",
  asyncHandler(async (req, res) => {
    const { profile, userSettings } = AnalyzeProfileRequestSchema.parse(req.body);
    const analysis = await openAiService.analyzeProfile(profile, userSettings);
    res.json(analysis);
  })
);

router.post(
  "/ai/generate-dm",
  asyncHandler(async (req, res) => {
    const { profile, analysis, messageType, userSettings } = GenerateDmRequestSchema.parse(req.body);
    const dm = await openAiService.generateDm(profile, analysis, messageType, userSettings);
    res.json(dm);
  })
);

router.post(
  "/hubspot/upsert-contact",
  asyncHandler(async (req, res) => {
    const { profile, userSettings } = UpsertContactRequestSchema.parse(req.body);
    const lifecycleStage = userSettings?.defaultHubSpotLifecycleStage;
    const existingContactId = await hubSpotService.searchContactByLinkedInUrl(profile.profileUrl);

    if (existingContactId) {
      const contactId = await hubSpotService.updateContact(existingContactId, profile, lifecycleStage);
      res.json({ contactId, created: false, updated: true });
      return;
    }

    const contactId = await hubSpotService.createContact(profile, lifecycleStage);
    res.json({ contactId, created: true, updated: false });
  })
);

router.post(
  "/hubspot/create-note",
  asyncHandler(async (req, res) => {
    const { contactId, profile, analysis, dmMessage } = CreateNoteRequestSchema.parse(req.body);
    const noteBody = buildAnalysisNoteBody(
      profile.fullName,
      profile.profileUrl,
      analysis.persona,
      analysis.leadScore,
      analysis.painPoints,
      analysis.icebreaker,
      analysis.recommendedAction,
      dmMessage
    );
    const noteId = await hubSpotService.createNoteForContact(contactId, noteBody);
    res.json({ noteId });
  })
);

router.post(
  "/hubspot/create-task",
  asyncHandler(async (req, res) => {
    const { contactId, daysFromNow, taskTitle, taskBody } = CreateTaskRequestSchema.parse(req.body);
    const dueDate = new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const taskId = await hubSpotService.createFollowUpTask(contactId, taskTitle, taskBody, dueDate);
    res.json({ taskId, fallback: "created_as_note" });
  })
);

export const stripeWebhookHandler: RequestHandler = (req, res, next) => {
  console.log("[stripe-webhook] Incoming request received at /api/stripe/webhook.");

  if (!Buffer.isBuffer(req.body)) {
    next(new AppError(400, "Stripe webhook raw body is missing."));
    return;
  }

  void stripeLicenseService
    .verifyAndProcessWebhook(req.body, req.header("stripe-signature"))
    .then((result) => res.json(result))
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "Stripe webhook processing failed.";
      const statusCode = error instanceof AppError ? error.statusCode : 500;

      if (/signature/i.test(message)) {
        console.error("[stripe-webhook] Stripe signature verification failed:", message);
      } else {
        console.error("[stripe-webhook] Stripe webhook processing error:", message);
      }

      if (error instanceof Error && error.stack) {
        console.error(error.stack);
      }

      res.status(statusCode).json({
        received: false,
        statusCode,
        error:
          statusCode >= 500 && process.env.NODE_ENV !== "development"
            ? "Stripe webhook processing failed. Check API server logs for details."
            : message
      });
    });
};

function requireAdminSecret(req: Request, _res: Response, next: NextFunction) {
  const configuredAdminSecret = process.env.ADMIN_SECRET?.trim();

  if (!configuredAdminSecret) {
    next(new AppError(404, "Admin endpoint is not enabled."));
    return;
  }

  const providedAdminSecret = req.header("x-admin-secret") ?? req.header("authorization")?.replace(/^Bearer\s+/i, "");

  if (!providedAdminSecret || !safeCompare(providedAdminSecret, configuredAdminSecret)) {
    next(new AppError(403, "Admin secret is missing or invalid."));
    return;
  }

  next();
}

function safeCompare(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function adminLicenseView(license: LicenseRecord) {
  return {
    id: license.id,
    email: license.email,
    licenseKey: maskLicenseKey(license.licenseKey),
    plan: license.plan,
    status: license.status,
    stripeCustomerId: license.stripeCustomerId,
    stripeSubscriptionId: license.stripeSubscriptionId,
    stripeCheckoutSessionId: license.stripeCheckoutSessionId,
    currentPeriodEnd: license.currentPeriodEnd,
    createdAt: license.createdAt,
    updatedAt: license.updatedAt,
    lastEmailSentAt: license.lastEmailSentAt
  };
}

function maskLicenseKey(licenseKey: string): string {
  const lastGroup = licenseKey.trim().split("-").at(-1) ?? "****";
  return `lh-beta-****-****-${lastGroup}`;
}

export { router };
