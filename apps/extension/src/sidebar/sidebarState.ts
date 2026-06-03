export const DEFAULT_CRM_STATUS = "Not synced";
export const DEFAULT_NEXT_ACTION = "Analyze this profile when you are ready.";
export const DM_PLACEHOLDER = "Generate a message after analyzing this profile.";
export const SCORING_SETTINGS_WARNING = "Set your product and target customer in Options to improve lead scoring.";

export type LocalActionStatus = {
  type: "success" | "error";
  message: string;
};

export type ProfileSpecificState = {
  generatedDmProfileUrl: string | null;
  selectedMessageType: string | null;
  profileAnalysis: unknown;
  crmSyncStatus: string;
  contactId: string | null;
  noteStatus: string | null;
  taskStatus: string | null;
  globalMessage: string | null;
  localActionStatus: LocalActionStatus | null;
};

export type PreservedSyncState = {
  contactId: string | null;
  crmStatus: string;
  syncedProfileUrl: string | null;
};

export function getSyncStateForAnalyzedProfile(input: {
  nextProfileUrl: string;
  contactId: string | null;
  crmStatus: string;
  syncedProfileUrl: string | null;
}): PreservedSyncState {
  const belongsToSameProfile = Boolean(input.syncedProfileUrl && input.syncedProfileUrl === input.nextProfileUrl);

  if (belongsToSameProfile) {
    return {
      contactId: input.contactId,
      crmStatus: input.crmStatus,
      syncedProfileUrl: input.syncedProfileUrl
    };
  }

  return {
    contactId: null,
    crmStatus: DEFAULT_CRM_STATUS,
    syncedProfileUrl: null
  };
}

export function shouldResetProfileSpecificState(previousProfileUrl: string | null, nextProfileUrl: string | null): boolean {
  return Boolean(previousProfileUrl && nextProfileUrl && previousProfileUrl !== nextProfileUrl);
}

export function resetProfileSpecificState(): ProfileSpecificState {
  return {
    generatedDmProfileUrl: null,
    selectedMessageType: null,
    profileAnalysis: null,
    crmSyncStatus: DEFAULT_CRM_STATUS,
    contactId: null,
    noteStatus: null,
    taskStatus: null,
    globalMessage: null,
    localActionStatus: null
  };
}

export function localActionStatusForHubSpotSync(created: boolean): LocalActionStatus {
  return {
    type: "success",
    message: created ? "HubSpot contact created." : "HubSpot contact updated."
  };
}

export function hasLeadScoringSettings(settings: {
  productOrServiceDescription?: string;
  targetCustomerProfile?: string;
}): boolean {
  return Boolean(settings.productOrServiceDescription?.trim() && settings.targetCustomerProfile?.trim());
}
