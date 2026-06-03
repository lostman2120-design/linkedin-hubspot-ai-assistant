import { describe, expect, it } from "vitest";
import {
  DEFAULT_CRM_STATUS,
  DM_PLACEHOLDER,
  getSyncStateForAnalyzedProfile,
  localActionStatusForHubSpotSync,
  resetProfileSpecificState,
  shouldResetProfileSpecificState
} from "../sidebar/sidebarState";

describe("sidebar profile-specific state", () => {
  it("clears CRM sync state when analyzing a different profile URL", () => {
    expect(
      getSyncStateForAnalyzedProfile({
        nextProfileUrl: "https://www.linkedin.com/in/new-profile/",
        contactId: "123",
        crmStatus: "Created in HubSpot",
        syncedProfileUrl: "https://www.linkedin.com/in/old-profile/"
      })
    ).toEqual({
      contactId: null,
      crmStatus: DEFAULT_CRM_STATUS,
      syncedProfileUrl: null
    });
  });

  it("preserves CRM sync state when it belongs to the same profile URL", () => {
    expect(
      getSyncStateForAnalyzedProfile({
        nextProfileUrl: "https://www.linkedin.com/in/same-profile/",
        contactId: "123",
        crmStatus: "Updated in HubSpot",
        syncedProfileUrl: "https://www.linkedin.com/in/same-profile/"
      })
    ).toEqual({
      contactId: "123",
      crmStatus: "Updated in HubSpot",
      syncedProfileUrl: "https://www.linkedin.com/in/same-profile/"
    });
  });

  it("detects profile URL changes that should reset profile-specific UI state", () => {
    expect(shouldResetProfileSpecificState("https://www.linkedin.com/in/a/", "https://www.linkedin.com/in/b/")).toBe(true);
    expect(shouldResetProfileSpecificState("https://www.linkedin.com/in/a/", "https://www.linkedin.com/in/a/")).toBe(false);
  });

  it("clears suggested DM and profile-specific action state on reset", () => {
    expect(resetProfileSpecificState()).toMatchObject({
      generatedDmProfileUrl: null,
      selectedMessageType: null,
      profileAnalysis: null,
      crmSyncStatus: DEFAULT_CRM_STATUS,
      contactId: null,
      noteStatus: null,
      taskStatus: null,
      globalMessage: null,
      localActionStatus: null
    });
    expect(DM_PLACEHOLDER).toBe("Generate a message after analyzing this profile.");
  });

  it("returns bottom local action status for HubSpot sync results", () => {
    expect(localActionStatusForHubSpotSync(true)).toEqual({ type: "success", message: "HubSpot contact created." });
    expect(localActionStatusForHubSpotSync(false)).toEqual({ type: "success", message: "HubSpot contact updated." });
  });
});
