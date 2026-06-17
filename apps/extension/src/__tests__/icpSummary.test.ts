import { describe, expect, it, vi } from "vitest";
import { DEFAULT_USER_SETTINGS } from "@linkedin-hubspot-ai/shared";
import { SETTINGS_KEY, type StorageAreaLike } from "../storage";
import { buildIcpSummaryFields, getIcpSettingsSafe, truncateIcpValue } from "../sidebar/icpSummary";

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

describe("ICP summary helpers", () => {
  it("returns default ICP settings when no custom settings are stored", async () => {
    const result = await getIcpSettingsSafe(createStorage());

    expect(result.loadFailed).toBe(false);
    expect(result.usingDefaults).toBe(true);
    expect(result.settings.targetRoles).toBe(DEFAULT_USER_SETTINGS.targetRoles);
  });

  it("loads saved custom ICP settings", async () => {
    const result = await getIcpSettingsSafe(
      createStorage({
        [SETTINGS_KEY]: {
          ...DEFAULT_USER_SETTINGS,
          targetRoles: "Founders, SDRs, RevOps",
          targetIndustries: "B2B SaaS, agencies",
          targetCompanySize: "1-50",
          productOrServiceDescription: "LinkedIn to HubSpot AI workflow",
          mainPainPointsSolved: "manual CRM entry, DM writing",
          preferredOutreachTone: "Soft feedback request"
        }
      })
    );

    expect(result.loadFailed).toBe(false);
    expect(result.usingDefaults).toBe(false);
    expect(result.settings.targetRoles).toBe("Founders, SDRs, RevOps");
  });

  it("truncates long ICP fields for display without mutating saved settings", () => {
    const longValue = "manual CRM entry, LinkedIn prospecting, lead qualification, DM writing, CRM hygiene, follow-up tasks";

    expect(truncateIcpValue(longValue, 48)).toBe("manual CRM entry, LinkedIn prospecting, lead...");
    expect(longValue).toContain("follow-up tasks");
  });

  it("builds compact summary fields with safe fallbacks", () => {
    const fields = buildIcpSummaryFields({
      ...DEFAULT_USER_SETTINGS,
      targetRoles: "",
      targetIndustries: "B2B SaaS",
      preferredOutreachTone: ""
    });

    expect(fields).toContainEqual({ label: "Roles", value: "Not set" });
    expect(fields).toContainEqual({ label: "Industries", value: "B2B SaaS" });
    expect(fields).toContainEqual({ label: "Tone", value: "professional" });
  });

  it("falls back safely when storage is malformed", async () => {
    const result = await getIcpSettingsSafe(
      createStorage({
        [SETTINGS_KEY]: {
          ...DEFAULT_USER_SETTINGS,
          targetRoles: ["bad"],
          defaultFollowUpDays: 500
        }
      })
    );

    expect(result.loadFailed).toBe(false);
    expect(result.usingDefaults).toBe(true);
    expect(result.settings.targetRoles).toBe(DEFAULT_USER_SETTINGS.targetRoles);
  });

  it("falls back safely when chrome storage fails", async () => {
    const storage: StorageAreaLike = {
      get: vi.fn(async () => {
        throw new Error("storage unavailable");
      }),
      set: vi.fn()
    };

    const result = await getIcpSettingsSafe(storage);

    expect(result.loadFailed).toBe(true);
    expect(result.settings.targetIndustries).toBe(DEFAULT_USER_SETTINGS.targetIndustries);
  });
});
