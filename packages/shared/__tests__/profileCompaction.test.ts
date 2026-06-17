import { describe, expect, it } from "vitest";
import { DEFAULT_USER_SETTINGS } from "../constants.js";
import {
  PROFILE_TEXT_LIMITS,
  compactLinkedInProfile,
  compactVisibleProfileText
} from "../profileCompaction.js";
import { AnalyzeProfileRequestSchema, LinkedInProfileSchema } from "../schemas.js";

const longText = (label: string, repeat = 260) => Array.from({ length: repeat }, (_, index) => `${label} ${index + 1}`).join(" ");

describe("profile text compaction", () => {
  it("truncates visibleTextSample to the shared schema limit", () => {
    const profile = compactLinkedInProfile({
      fullName: "Avery Johnson",
      headline: "RevOps Lead at Example Corp",
      profileUrl: "https://www.linkedin.com/in/avery-johnson/",
      visibleTextSample: longText("visible profile context")
    });

    expect(profile.visibleTextSample?.length).toBeLessThanOrEqual(PROFILE_TEXT_LIMITS.visibleTextSample);
    expect(profile.visibleTextSample).toContain("[Truncated for analysis input limit]");
    expect(() => LinkedInProfileSchema.parse(profile)).not.toThrow();
  });

  it("preserves high-priority identity, headline, about, and current role before lower-priority sections", () => {
    const compacted = compactVisibleProfileText(
      {
        fullName: "Avery Johnson",
        headline: "RevOps Lead at Example Corp",
        companyName: "Example Corp",
        location: "San Francisco",
        profileUrl: "https://www.linkedin.com/in/avery-johnson/",
        about: longText("About CRM hygiene"),
        currentRoleDescription: "Owns HubSpot cleanup and outbound workflow improvements.",
        visibleProfileContext: {
          experience: { visibleItems: [longText("Experience HubSpot process")] },
          education: { visibleItems: ["MBA Program"] },
          skills: { visibleItems: ["Revenue Operations", "CRM Hygiene", "Salesforce", "HubSpot"] }
        }
      },
      1600
    );

    expect(compacted).toContain("Name:");
    expect(compacted).toContain("Headline:");
    expect(compacted).toContain("About:");
    expect(compacted).toContain("RevOps Lead at Example Corp");
    expect(compacted).not.toContain("Skills:");
    expect(compacted?.length).toBeLessThanOrEqual(1600);
  });

  it("removes duplicate lines and LinkedIn UI boilerplate before truncation", () => {
    const compacted = compactVisibleProfileText({
      visibleProfileContext: {
        rawVisibleContext: [
          "CRM hygiene and HubSpot workflow cleanup",
          "CRM hygiene and HubSpot workflow cleanup",
          "Show more",
          "Connect",
          "Message"
        ].join("\n")
      }
    });

    expect(compacted).toContain("CRM hygiene and HubSpot workflow cleanup");
    expect(compacted).not.toContain("Show more");
    expect(compacted).not.toContain("Connect");
    expect(compacted).not.toContain("Message");
    expect(compacted?.match(/CRM hygiene/g)).toHaveLength(1);
  });

  it("makes a long analyze-profile payload pass shared schema validation", () => {
    const compactedProfile = compactLinkedInProfile({
      fullName: "Avery Johnson",
      headline: "RevOps Lead at Example Corp",
      companyName: "Example Corp",
      profileUrl: "https://www.linkedin.com/in/avery-johnson/",
      about: longText("About CRM hygiene"),
      currentRoleDescription: longText("Current role HubSpot cleanup"),
      visibleProfileContext: {
        about: { text: longText("Visible about text"), source: "visible About section" },
        currentRole: { description: longText("Visible role text") },
        experience: { visibleItems: [longText("Experience text")] },
        rawVisibleContext: longText("Raw visible context")
      },
      visibleTextSample: longText("Visible sample")
    });

    expect(() =>
      AnalyzeProfileRequestSchema.parse({
        profile: compactedProfile,
        userSettings: DEFAULT_USER_SETTINGS
      })
    ).not.toThrow();
  });
});
