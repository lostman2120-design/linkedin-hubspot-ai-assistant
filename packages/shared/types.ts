import type { z } from "zod";
import type {
  ApiErrorResponseSchema,
  DmVariantSchema,
  GeneratedDmSchema,
  HubSpotSyncResultSchema,
  LicenseVerifyRequestSchema,
  LicenseVerifyResponseSchema,
  LinkedInVisibleProfileContextSchema,
  LinkedInProfileSchema,
  OutreachStrategySchema,
  ProfileAnalysisSchema,
  RecommendedActionSchema,
  ScoreEvidenceSchema,
  ScoringMetadataSchema,
  SellerContextSchema,
  UserSettingsSchema
} from "./schemas.js";
import type { MESSAGE_TYPES } from "./constants.js";

export type LinkedInProfile = z.infer<typeof LinkedInProfileSchema>;
export type LinkedInVisibleProfileContext = z.infer<typeof LinkedInVisibleProfileContextSchema>;
export type ProfileAnalysis = z.infer<typeof ProfileAnalysisSchema>;
export type RecommendedAction = z.infer<typeof RecommendedActionSchema>;
export type OutreachStrategy = z.infer<typeof OutreachStrategySchema>;
export type DmVariant = z.infer<typeof DmVariantSchema>;
export type GeneratedDm = z.infer<typeof GeneratedDmSchema>;
export type SellerContext = z.infer<typeof SellerContextSchema>;
export type ScoreEvidence = z.infer<typeof ScoreEvidenceSchema>;
export type ScoringMetadata = z.infer<typeof ScoringMetadataSchema>;
export type UserSettings = z.infer<typeof UserSettingsSchema>;
export type HubSpotSyncResult = z.infer<typeof HubSpotSyncResultSchema>;
export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>;
export type LicenseVerifyRequest = z.infer<typeof LicenseVerifyRequestSchema>;
export type LicenseVerifyResponse = z.infer<typeof LicenseVerifyResponseSchema>;
export type MessageType = (typeof MESSAGE_TYPES)[number];
