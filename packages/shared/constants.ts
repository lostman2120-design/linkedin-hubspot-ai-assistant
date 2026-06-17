export const UNABLE_TO_EXTRACT_FIELD = "Unable to extract this field";

export const DM_TONES = ["professional", "friendly", "concise", "casual"] as const;

export const MESSAGE_TYPES = ["connection", "first_dm", "follow_up", "soft_pitch"] as const;

export const SELLER_CONTEXT_FIELD_LIMITS = {
  productOrServiceName: 120,
  productOrServiceDescription: 1000,
  targetOutcome: 600,
  mainDifferentiators: 1000,
  proofPoints: 1000,
  pricingContext: 300,
  preferredCta: 300,
  claimsAllowed: 1000,
  claimsToAvoid: 1000,
  brandVoice: 400,
  competitorsOrAlternatives: 600,
  compatibilityContext: 600
} as const;

export const DEFAULT_SELLER_CONTEXT = {
  productOrServiceName: "LinkedIn to HubSpot AI Assistant",
  productOrServiceDescription:
    "A Chrome extension that scores visible LinkedIn profiles against a saved ICP, drafts personalized outreach, and saves the sales context to HubSpot.",
  targetOutcome: "Reduce manual LinkedIn prospecting work and improve lead prioritization.",
  mainDifferentiators:
    "ICP-based scoring, visible reasoning, three DM variants, HubSpot context saving, no auto-messaging.",
  proofPoints: "Live Chrome Web Store product, working HubSpot contact, note, and follow-up task flow.",
  pricingContext: "$19/month Beta Pro.",
  preferredCta: "Ask for a short demo or honest workflow feedback.",
  claimsAllowed: "Lightweight, human-reviewed, $19/month, no auto-messaging.",
  claimsToAvoid: "Guaranteed replies, guaranteed revenue, full automation, hidden-data enrichment.",
  brandVoice: "Professional, concise, helpful, not aggressive.",
  competitorsOrAlternatives: "Hublead, Surfe, Apollo, Sales Navigator, manual copy-paste.",
  compatibilityContext: "Designed to work alongside existing sales and RevOps platforms rather than replacing the entire stack."
} as const;

export const DEFAULT_USER_SETTINGS = {
  backendApiUrl: "http://localhost:8787",
  productOrServiceDescription:
    "Chrome extension that helps LinkedIn prospecting users save AI-scored leads, outreach context, and follow-up tasks into HubSpot.",
  targetCustomerProfile:
    "B2B founders, SDRs, BDRs, RevOps leaders, sales managers, growth leads, and small B2B sales teams that use HubSpot and prospect on LinkedIn.",
  targetIndustries: "B2B SaaS, agencies, consulting, recruiting, RevOps",
  targetRoles: "Founder, CEO, SDR, BDR, RevOps, Sales Manager, Growth Lead",
  targetCompanySize: "1-10, 11-50, 51-200",
  targetRegion: "United States, Canada, United Kingdom, Europe, English-speaking B2B markets",
  mainPainPointsSolved: "manual CRM entry, LinkedIn prospecting, lead qualification, DM writing, CRM hygiene",
  excludedRoles: "students, job seekers, unrelated recruiters, enterprise-only buyers",
  preferredOutreachTone: "casual, professional, direct, soft feedback request",
  sellerContext: DEFAULT_SELLER_CONTEXT,
  dmTone: "professional",
  defaultHubSpotLifecycleStage: "lead",
  defaultFollowUpDays: 3
} as const;
