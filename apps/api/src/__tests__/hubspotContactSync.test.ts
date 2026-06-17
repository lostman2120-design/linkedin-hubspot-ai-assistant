import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getHubSpotInvalidPropertyNames,
  HubSpotService,
  isHubSpotInvalidPropertyError
} from "../services/hubspot.service.js";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete process.env.HUBSPOT_PRIVATE_APP_TOKEN;
});

describe("HubSpot contact property sync", () => {
  it("sends prepared standard and AI contact properties to HubSpot", async () => {
    process.env.HUBSPOT_PRIVATE_APP_TOKEN = "test-token";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "contact-123" }), {
        status: 201,
        headers: { "Content-Type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const contactId = await new HubSpotService().createContactWithProperties({
      firstname: "Avery",
      lastname: "Johnson",
      company: "Example Corp",
      jobtitle: "VP Sales",
      hs_linkedin_url: "https://www.linkedin.com/in/avery-johnson/",
      lifecyclestage: "lead",
      ai_lead_score: "84",
      ai_persona: "Founder-led B2B SaaS buyer"
    });

    expect(contactId).toBe("contact-123");
    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string) as {
      properties: Record<string, string>;
    };
    expect(body.properties).toMatchObject({
      firstname: "Avery",
      lastname: "Johnson",
      company: "Example Corp",
      jobtitle: "VP Sales",
      hs_linkedin_url: "https://www.linkedin.com/in/avery-johnson/",
      lifecyclestage: "lead",
      ai_lead_score: "84",
      ai_persona: "Founder-led B2B SaaS buyer"
    });
    expect(body.properties.phone).toBeUndefined();
    expect(body.properties.city).toBeUndefined();
  });

  it("identifies invalid optional HubSpot custom property errors", async () => {
    process.env.HUBSPOT_PRIVATE_APP_TOKEN = "test-token";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            message: "Property values were not valid",
            validationResults: [
              {
                propertyName: "ai_persona",
                message: "Property ai_persona does not exist"
              }
            ]
          }),
          {
            status: 400,
            statusText: "Bad Request",
            headers: { "Content-Type": "application/json" }
          }
        )
      )
    );

    try {
      await new HubSpotService().createContactWithProperties({
        firstname: "Avery",
        hs_linkedin_url: "https://www.linkedin.com/in/avery-johnson/",
        ai_persona: "Founder-led B2B SaaS buyer"
      });
      throw new Error("Expected HubSpot request to fail.");
    } catch (error) {
      expect(isHubSpotInvalidPropertyError(error)).toBe(true);
      expect(getHubSpotInvalidPropertyNames(error)).toEqual(["ai_persona"]);
    }
  });
});
