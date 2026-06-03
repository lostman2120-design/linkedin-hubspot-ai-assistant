import { describe, expect, it } from "vitest";
import { mapProfileToHubSpotProperties } from "../utils/hubspotMapping.js";

describe("mapProfileToHubSpotProperties", () => {
  it("maps visible LinkedIn fields to HubSpot contact properties", () => {
    expect(
      mapProfileToHubSpotProperties(
        {
          fullName: "Avery Johnson",
          jobTitle: "VP Sales",
          companyName: "Example Corp",
          profileUrl: "https://www.linkedin.com/in/avery-johnson/"
        },
        "lead"
      )
    ).toEqual({
      firstname: "Avery",
      lastname: "Johnson",
      jobtitle: "VP Sales",
      company: "Example Corp",
      hs_linkedin_url: "https://www.linkedin.com/in/avery-johnson/",
      lifecyclestage: "lead"
    });
  });

  it("maps LinkedIn profile URL to HubSpot's default hs_linkedin_url property", () => {
    const properties = mapProfileToHubSpotProperties({
      fullName: "Avery Johnson",
      profileUrl: "https://www.linkedin.com/in/avery-johnson/"
    });

    expect(properties.hs_linkedin_url).toBe("https://www.linkedin.com/in/avery-johnson/");
    expect(properties.linkedin_url).toBeUndefined();
  });
});
