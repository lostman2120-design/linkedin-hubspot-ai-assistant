export const UNABLE_TO_EXTRACT_FIELD = "Unable to extract this field";

export const DM_TONES = ["professional", "friendly", "concise", "casual"] as const;

export const MESSAGE_TYPES = ["connection", "first_dm", "follow_up", "soft_pitch"] as const;

export const DEFAULT_USER_SETTINGS = {
  backendApiUrl: "http://localhost:8787",
  productOrServiceDescription: "",
  targetCustomerProfile: "",
  dmTone: "professional",
  defaultHubSpotLifecycleStage: "lead",
  defaultFollowUpDays: 3
} as const;

