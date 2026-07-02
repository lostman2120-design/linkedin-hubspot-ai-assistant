import { describe, expect, it, vi } from "vitest";
import { saveOptionalHubSpotCustomProperties } from "../services/hubspot-custom-properties.service.js";

describe("optional HubSpot custom property sync", () => {
  it("returns a warning instead of failing contact and note flow when property update fails", async () => {
    const client = {
      ensureContactProperties: vi.fn().mockResolvedValue({
        ready: ["lha_icp_fit_score", "lha_recommended_action"],
        failed: []
      }),
      updateContactWithProperties: vi.fn().mockRejectedValue(new Error("HubSpot permission scope is missing."))
    };

    await expect(
      saveOptionalHubSpotCustomProperties(client, "contact-123", {
        lha_icp_fit_score: "84",
        lha_recommended_action: "Pursue now"
      })
    ).resolves.toMatchObject({
      updated: false,
      warnings: expect.arrayContaining([
        expect.stringContaining("lha_icp_fit_score"),
        expect.stringContaining("HubSpot permission scope is missing")
      ])
    });
  });

  it("skips properties that could not be created and updates the available properties", async () => {
    const client = {
      ensureContactProperties: vi.fn().mockResolvedValue({
        ready: ["lha_icp_fit_score"],
        failed: [{ property: "lha_recommended_action", message: "Missing property write scope." }]
      }),
      updateContactWithProperties: vi.fn().mockResolvedValue("contact-123")
    };

    const result = await saveOptionalHubSpotCustomProperties(client, "contact-123", {
      lha_icp_fit_score: "84",
      lha_recommended_action: "Pursue now"
    });

    expect(client.updateContactWithProperties).toHaveBeenCalledWith("contact-123", {
      lha_icp_fit_score: "84"
    });
    expect(result).toMatchObject({ updated: true });
    expect(result.warnings[0]).toContain("lha_recommended_action");
  });
});
