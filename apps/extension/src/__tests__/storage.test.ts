import { describe, expect, it } from "vitest";
import { DEFAULT_USER_SETTINGS } from "@linkedin-hubspot-ai/shared";
import {
  DAILY_USAGE_KEY,
  DEFAULT_LICENSE_STATE,
  LICENSE_STATE_KEY,
  getDailyUsage,
  getStoredLicenseState,
  getStoredSettings,
  incrementDailyUsage,
  removeStoredLicenseState,
  saveStoredLicenseState,
  saveStoredSettings,
  SETTINGS_KEY,
  type StorageAreaLike
} from "../storage";

const productionApiBaseUrl = "https://linkedin-hubspot-ai-assistant.onrender.com";

function createStorage(initial: Record<string, unknown> = {}): StorageAreaLike & { data: Record<string, unknown> } {
  const data = { ...initial };

  return {
    data,
    async get(keys?: string | string[] | Record<string, unknown> | null) {
      if (typeof keys === "string") {
        return { [keys]: data[keys] };
      }

      if (Array.isArray(keys)) {
        return Object.fromEntries(keys.map((key) => [key, data[key]]));
      }

      return { ...data };
    },
    async set(items: Record<string, unknown>) {
      Object.assign(data, items);
    }
  };
}

describe("settings storage helper", () => {
  it("returns default settings when storage is empty", async () => {
    await expect(getStoredSettings(createStorage())).resolves.toMatchObject({
      ...DEFAULT_USER_SETTINGS,
      backendApiUrl: productionApiBaseUrl
    });
  });

  it("saves and loads settings", async () => {
    const storage = createStorage();
    await saveStoredSettings(
      {
        ...DEFAULT_USER_SETTINGS,
        backendApiUrl: "http://localhost:8787",
        dmTone: "friendly",
        productOrServiceDescription: "AI sales research",
        targetCustomerProfile: "B2B sales leaders",
        targetIndustries: "B2B SaaS",
        targetRoles: "Founder, RevOps",
        targetCompanySize: "11-50",
        targetRegion: "United States",
        mainPainPointsSolved: "manual CRM entry",
        excludedRoles: "students",
        preferredOutreachTone: "soft feedback request",
        defaultHubSpotLifecycleStage: "lead",
        defaultFollowUpDays: 5
      },
      storage
    );

    expect(storage.data[SETTINGS_KEY]).toMatchObject({ dmTone: "friendly", targetRoles: "Founder, RevOps", defaultFollowUpDays: 5 });
    await expect(getStoredSettings(storage)).resolves.toMatchObject({
      dmTone: "friendly",
      targetIndustries: "B2B SaaS",
      targetRoles: "Founder, RevOps",
      mainPainPointsSolved: "manual CRM entry",
      defaultFollowUpDays: 5
    });
  });
});

describe("license storage helper", () => {
  it("returns Free plan when no license is stored", async () => {
    await expect(getStoredLicenseState(createStorage())).resolves.toEqual(DEFAULT_LICENSE_STATE);
  });

  it("saves and removes a Beta Pro license", async () => {
    const storage = createStorage();
    await saveStoredLicenseState(
      {
        licenseKey: "beta-key",
        valid: true,
        plan: "beta_pro",
        status: "active",
        verifiedAt: "2026-06-02T00:00:00.000Z"
      },
      storage
    );

    expect(storage.data[LICENSE_STATE_KEY]).toMatchObject({ plan: "beta_pro", status: "active" });
    await expect(getStoredLicenseState(storage)).resolves.toMatchObject({ plan: "beta_pro", status: "active", valid: true });

    await removeStoredLicenseState(storage);
    await expect(getStoredLicenseState(storage)).resolves.toEqual(DEFAULT_LICENSE_STATE);
  });
});

describe("daily usage storage helper", () => {
  it("increments separate daily Free plan counters", async () => {
    const storage = createStorage();
    const afterAnalysis = await incrementDailyUsage("profileAnalyses", storage);
    const afterDraft = await incrementDailyUsage("outreachDrafts", storage);

    expect(afterAnalysis.profileAnalyses).toBe(1);
    expect(afterDraft.profileAnalyses).toBe(1);
    expect(afterDraft.outreachDrafts).toBe(1);
  });

  it("resets counters when the stored date is not today", async () => {
    const storage = createStorage({
      [DAILY_USAGE_KEY]: {
        date: "2000-01-01",
        profileAnalyses: 3,
        outreachDrafts: 1
      }
    });

    await expect(getDailyUsage(storage)).resolves.toMatchObject({
      profileAnalyses: 0,
      outreachDrafts: 0
    });
    expect(storage.data[DAILY_USAGE_KEY]).toMatchObject({ profileAnalyses: 0, outreachDrafts: 0 });
  });
});
