import type { z } from "zod";
import type {
  ApiErrorResponseSchema,
  GeneratedDmSchema,
  HubSpotSyncResultSchema,
  LicenseVerifyRequestSchema,
  LicenseVerifyResponseSchema,
  LinkedInProfileSchema,
  ProfileAnalysisSchema,
  UserSettingsSchema
} from "./schemas.js";
import type { MESSAGE_TYPES } from "./constants.js";

export type LinkedInProfile = z.infer<typeof LinkedInProfileSchema>;
export type ProfileAnalysis = z.infer<typeof ProfileAnalysisSchema>;
export type GeneratedDm = z.infer<typeof GeneratedDmSchema>;
export type UserSettings = z.infer<typeof UserSettingsSchema>;
export type HubSpotSyncResult = z.infer<typeof HubSpotSyncResultSchema>;
export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>;
export type LicenseVerifyRequest = z.infer<typeof LicenseVerifyRequestSchema>;
export type LicenseVerifyResponse = z.infer<typeof LicenseVerifyResponseSchema>;
export type MessageType = (typeof MESSAGE_TYPES)[number];
