import type { Request, Response, NextFunction, RequestHandler } from "express";
import { Router } from "express";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import {
  AnalyzeProfileRequestSchema,
  CreateNoteRequestSchema,
  GenerateDmRequestSchema,
  LicenseVerifyRequestSchema,
  ProfileAnalysisSchema,
  UpsertContactRequestSchema,
  compactLinkedInProfile,
  validateLinkedInProfileIdentity
} from "@linkedin-hubspot-ai/shared";
import { HubSpotService } from "./services/hubspot.service.js";
import { sendLicenseEmailWebhook } from "./services/license-email.service.js";
import { saveOptionalHubSpotCustomProperties } from "./services/hubspot-custom-properties.service.js";
import { createLicenseRepository, type LicenseRecord } from "./services/license.repository.js";
import { verifyBetaProLicenseKey } from "./services/license.service.js";
import { OpenAiService } from "./services/openai.service.js";
import { StripeLicenseService } from "./services/stripe-license.service.js";
import { AppError } from "./utils/errors.js";
import {
  buildFollowUpTaskBody,
  buildFollowUpTaskFallbackNoteBody,
  mapFollowUpTaskError,
  sanitizeFollowUpTaskRequestShape,
  shouldCreateFollowUpFallbackNote,
  summarizeHubSpotError,
  validateFollowUpTaskRequest
} from "./utils/followUpTask.js";
import {
  buildHubSpotAnalysisNoteBody,
  buildHubSpotContactSyncPayload,
  getConfiguredHubSpotAiPropertyMapping
} from "./utils/hubspotMapping.js";

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
const EnrichProfileRequestSchema = z.object({
  profile: AnalyzeProfileRequestSchema.shape.profile,
  analysis: ProfileAnalysisSchema,
  userSettings: AnalyzeProfileRequestSchema.shape.userSettings
});

function asyncHandler(handler: (req: Request, res: Response) => Promise<void>): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    void handler(req, res).catch(next);
  };
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
        source: result.source,
        betaProGranted: result.valid && (result.plan === "beta_pro" || result.plan === "pro") && result.status === "active"
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
    const { profile, userSettings } = AnalyzeProfileRequestSchema.parse(compactProfileRequestBody(req.body));
    const analysis = await openAiService.analyzeProfile(profile, userSettings);
    res.json(analysis);
  })
);

router.post(
  "/ai/analyze-profile/quick",
  asyncHandler(async (req, res) => {
    const { profile, userSettings } = AnalyzeProfileRequestSchema.parse(compactProfileRequestBody(req.body));
    const analysis = openAiService.quickAnalyzeProfile(profile, userSettings);
    res.json(analysis);
  })
);

router.post(
  "/ai/analyze-profile/enrich",
  asyncHandler(async (req, res) => {
    const { profile, analysis, userSettings } = EnrichProfileRequestSchema.parse(compactProfileRequestBody(req.body));
    const enrichedAnalysis = await openAiService.enrichProfileAnalysis(profile, analysis, userSettings);
    res.json(enrichedAnalysis);
  })
);

router.post(
  "/ai/generate-dm",
  asyncHandler(async (req, res) => {
    const { profile, analysis, messageType, userSettings } = GenerateDmRequestSchema.parse(compactProfileRequestBody(req.body));
    const dm = await openAiService.generateDm(profile, analysis, messageType, userSettings);
    res.json(dm);
  })
);

router.post(
  "/hubspot/upsert-contact",
  asyncHandler(async (req, res) => {
    const { profile, analysis, generatedDm, userSettings } = UpsertContactRequestSchema.parse(compactProfileRequestBody(req.body));
    const validation = validateLinkedInProfileIdentity(profile);
    if (!validation.ok) {
      throw new AppError(400, validation.message);
    }

    const lifecycleStage = userSettings?.defaultHubSpotLifecycleStage;
    const aiPropertyMapping = getConfiguredHubSpotAiPropertyMapping();
    const syncPayload = buildHubSpotContactSyncPayload({
      profile,
      analysis,
      generatedDm,
      lifecycleStage,
      aiPropertyMapping
    });

    console.log("[hubspot-contact] Request received.", {
      hasFullName: profile.fullName.trim().length > 0,
      hasProfileUrl: profile.profileUrl.trim().length > 0,
      hasLeadScore: typeof analysis.leadScore === "number",
      hasGeneratedDm: Boolean(generatedDm?.message)
    });
    console.log("[hubspot-contact] Properties prepared.", {
      standard: syncPayload.standardPropertyKeys,
      custom: syncPayload.customPropertyKeys
    });
    for (const skippedProperty of syncPayload.skippedProperties) {
      console.log("[hubspot-contact] Skipping property.", skippedProperty);
    }

    const existingContactId = await hubSpotService.searchContactByLinkedInUrl(profile.profileUrl);
    const contactId = existingContactId
      ? await hubSpotService.updateContactWithProperties(existingContactId, syncPayload.standardProperties)
      : await hubSpotService.createContactWithProperties(syncPayload.standardProperties);

    const customPropertySync = await saveOptionalHubSpotCustomProperties(
      hubSpotService,
      contactId,
      syncPayload.customProperties
    );
    const customPropertyWarnings = customPropertySync.warnings;

    const noteBody = buildHubSpotAnalysisNoteBody({ profile, analysis, generatedDm, userSettings });
    const noteId = await hubSpotService.createNoteForContact(contactId, noteBody);
    const created = !existingContactId;
    const partialPropertySync = customPropertyWarnings.length > 0;
    const skippedProperties = [
      ...syncPayload.skippedProperties.map((property) =>
        property.property ? `${property.property}: ${property.reason}` : `${property.field}: ${property.reason}`
      ),
      ...customPropertyWarnings
    ];

    console.log("[hubspot-contact] AI details saved as note.", {
      contactId: maskHubSpotId(contactId),
      noteId,
      partialPropertySync
    });

    res.json({
      contactId,
      created,
      updated: Boolean(existingContactId),
      noteId,
      partialPropertySync,
      customPropertiesUpdated: customPropertySync.updated,
      skippedProperties,
      message: hubSpotSyncMessage(created, partialPropertySync)
    });
  })
);

router.post(
  "/hubspot/create-note",
  asyncHandler(async (req, res) => {
    const { contactId, profile, analysis, dmMessage, userSettings } = CreateNoteRequestSchema.parse(compactProfileRequestBody(req.body));
    const noteBody = buildHubSpotAnalysisNoteBody({
      profile,
      analysis,
      generatedDm: dmMessage ? { message: dmMessage } : undefined,
      userSettings
    });
    const noteId = await hubSpotService.createNoteForContact(contactId, noteBody);
    res.json({ noteId });
  })
);

router.post(
  "/hubspot/create-task",
  asyncHandler(async (req, res) => {
    console.log("[follow-up-task] Request received.", sanitizeFollowUpTaskRequestShape(req.body));

    let taskRequest: ReturnType<typeof validateFollowUpTaskRequest>;
    try {
      taskRequest = validateFollowUpTaskRequest(compactProfileRequestBody(req.body));
    } catch (error) {
      const mappedError = error instanceof AppError ? error : mapFollowUpTaskError(error);
      console.error("[follow-up-task] Request validation failed.", {
        status: mappedError.statusCode,
        code: mappedError.code,
        message: mappedError.message
      });
      throw mappedError;
    }

    console.log("[follow-up-task] Creating HubSpot task.", {
      contactId: maskHubSpotId(taskRequest.contactId),
      hasProfileUrl: taskRequest.profileUrl.length > 0,
      dueAt: taskRequest.dueAt,
      dueAtType: typeof taskRequest.dueAt,
      hasTaskTitle: taskRequest.taskTitle.length > 0,
      hasTaskBody: taskRequest.taskBody.length > 0,
      hasOwnerId: false
    });

    try {
      const taskBody = buildFollowUpTaskBody(taskRequest.taskBody, taskRequest.profileUrl);
      const taskId = await hubSpotService.createFollowUpTask(taskRequest.contactId, taskRequest.taskTitle, taskBody, taskRequest.dueAt);
      console.log("[follow-up-task] Task created.", {
        taskId,
        finalStatus: 200
      });
      res.json({
        taskId,
        fallback: false,
        createdAs: "task",
        message: "HubSpot follow-up task created."
      });
    } catch (error) {
      const hubSpotSummary = summarizeHubSpotError(error);
      console.error("[follow-up-task] HubSpot task API failed.", {
        status: hubSpotSummary?.status,
        category: hubSpotSummary?.category,
        message: hubSpotSummary?.message,
        path: hubSpotSummary?.path
      });

      if (shouldCreateFollowUpFallbackNote(error)) {
        const noteBody = buildFollowUpTaskFallbackNoteBody(taskRequest);
        const noteId = await hubSpotService.createNoteForContact(taskRequest.contactId, noteBody);
        console.log("[follow-up-task] Fallback note created.", {
          noteId,
          finalStatus: 200
        });
        res.json({
          noteId,
          fallback: true,
          createdAs: "note",
          message: "Follow-up note created because HubSpot task creation is not available."
        });
        return;
      }

      const mappedError = mapFollowUpTaskError(error);
      console.error("[follow-up-task] Returning structured error response.", {
        status: mappedError.statusCode,
        code: mappedError.code,
        message: mappedError.message
      });
      throw mappedError;
    }
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

export function compactProfileRequestBody(body: unknown): unknown {
  if (!isRecord(body) || !isRecord(body.profile)) {
    return body;
  }

  return {
    ...body,
    profile: compactLinkedInProfile(body.profile)
  };
}

function hubSpotSyncMessage(created: boolean, partialPropertySync: boolean): string {
  if (partialPropertySync) {
    return `${created ? "HubSpot contact was created" : "HubSpot contact was updated"} and the AI summary note was saved, but custom properties could not be created or updated.`;
  }

  return created
    ? "HubSpot contact created. AI summary note and LHA sales context properties saved."
    : "HubSpot contact updated. AI summary note and LHA sales context properties saved.";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

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
    source: license.source,
    stripeCustomerId: license.stripeCustomerId,
    stripeSubscriptionId: license.stripeSubscriptionId,
    stripeCheckoutSessionId: license.stripeCheckoutSessionId,
    currentPeriodEnd: license.currentPeriodEnd,
    expiresAt: license.expiresAt,
    revokedAt: license.revokedAt,
    label: license.label,
    createdAt: license.createdAt,
    updatedAt: license.updatedAt,
    lastEmailSentAt: license.lastEmailSentAt
  };
}

function maskLicenseKey(licenseKey: string): string {
  const lastGroup = licenseKey.trim().split("-").at(-1) ?? "****";
  return `lh-beta-****-****-${lastGroup}`;
}

function maskHubSpotId(value: string): string {
  const trimmedValue = value.trim();
  return trimmedValue.length <= 4 ? "****" : `****${trimmedValue.slice(-4)}`;
}

export { router };
