import { z } from "zod";
import { DEFAULT_USER_SETTINGS, DM_TONES, MESSAGE_TYPES, UNABLE_TO_EXTRACT_FIELD } from "./constants.js";

const readableString = z.string().trim().min(1, "This field is required.");

export const LinkedInProfileSchema = z.object({
  fullName: readableString.default(UNABLE_TO_EXTRACT_FIELD),
  headline: z.string().trim().optional(),
  companyName: z.string().trim().optional(),
  jobTitle: z.string().trim().optional(),
  location: z.string().trim().optional(),
  profileUrl: z.string().url("The LinkedIn profile URL is not valid."),
  about: z.string().trim().optional(),
  visibleTextSample: z.string().trim().max(2000).optional()
});

export const UserSettingsSchema = z.object({
  backendApiUrl: z.string().url().default(DEFAULT_USER_SETTINGS.backendApiUrl),
  productOrServiceDescription: z.string().trim().max(2000).default(""),
  targetCustomerProfile: z.string().trim().max(2000).default(""),
  dmTone: z.enum(DM_TONES).default(DEFAULT_USER_SETTINGS.dmTone),
  defaultHubSpotLifecycleStage: z.string().trim().max(80).default(DEFAULT_USER_SETTINGS.defaultHubSpotLifecycleStage),
  defaultFollowUpDays: z.number().int().min(1).max(60).default(DEFAULT_USER_SETTINGS.defaultFollowUpDays)
});

export const ProfileAnalysisSchema = z.object({
  leadScore: z.number().int().min(0).max(100),
  persona: readableString,
  painPoints: z.array(z.string().trim().min(1)).max(6),
  icebreaker: readableString,
  recommendedAction: readableString,
  confidence: z.enum(["high", "medium", "low"])
});

export const GeneratedDmSchema = z.object({
  message: readableString.max(1200),
  personalizationScore: z.number().int().min(0).max(100),
  spamRisk: z.enum(["low", "medium", "high"]),
  warnings: z.array(z.string().trim().min(1)).max(6)
});

export const HubSpotSyncResultSchema = z.object({
  contactId: readableString,
  created: z.boolean(),
  updated: z.boolean()
});

export const ApiErrorResponseSchema = z.object({
  statusCode: z.number().int().min(400).max(599).optional(),
  error: readableString,
  details: z.array(z.string()).optional()
});

export const LicenseVerifyRequestSchema = z.object({
  licenseKey: readableString.max(200)
});

export const LicenseVerifyResponseSchema = z.object({
  valid: z.boolean(),
  plan: z.enum(["free", "beta_pro"]),
  status: z.enum(["active", "invalid", "expired", "past_due", "canceled", "inactive"]),
  email: z.string().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  currentPeriodEnd: z.string().datetime().nullable().optional()
});

export const AnalyzeProfileRequestSchema = z.object({
  profile: LinkedInProfileSchema,
  userSettings: UserSettingsSchema
});

export const GenerateDmRequestSchema = z.object({
  profile: LinkedInProfileSchema,
  analysis: ProfileAnalysisSchema,
  messageType: z.enum(MESSAGE_TYPES),
  userSettings: UserSettingsSchema
});

export const UpsertContactRequestSchema = z.object({
  profile: LinkedInProfileSchema,
  analysis: ProfileAnalysisSchema,
  userSettings: UserSettingsSchema.optional()
});

export const CreateNoteRequestSchema = z.object({
  contactId: readableString,
  profile: LinkedInProfileSchema,
  analysis: ProfileAnalysisSchema,
  dmMessage: z.string().trim().optional()
});

export const CreateTaskRequestSchema = z.object({
  contactId: readableString,
  daysFromNow: z.number().int().min(1).max(365),
  taskTitle: readableString.max(160),
  taskBody: readableString.max(3000)
});
