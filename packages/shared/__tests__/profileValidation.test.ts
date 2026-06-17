import { describe, expect, it } from "vitest";
import { splitProfileName, validateLinkedInProfileIdentity } from "../profileValidation";

describe("LinkedIn profile identity validation", () => {
  it("accepts a normal visible LinkedIn person profile", () => {
    expect(
      validateLinkedInProfileIdentity({
        fullName: "Avery Johnson",
        companyName: "Example Corp",
        profileUrl: "https://www.linkedin.com/in/avery-johnson/"
      })
    ).toEqual({ ok: true });
  });

  it("blocks missing names", () => {
    expect(
      validateLinkedInProfileIdentity({
        fullName: "Unable to extract this field",
        companyName: "Example Corp",
        profileUrl: "https://www.linkedin.com/in/avery-johnson/"
      })
    ).toMatchObject({ ok: false, reason: "missing_name" });
  });

  it("blocks company-only extraction from becoming a contact name", () => {
    expect(
      validateLinkedInProfileIdentity({
        fullName: "Example Corp",
        companyName: "Example Corp",
        profileUrl: "https://www.linkedin.com/in/avery-johnson/"
      })
    ).toMatchObject({ ok: false, reason: "company_only_name" });
  });

  it("blocks missing or non-profile LinkedIn URLs", () => {
    expect(
      validateLinkedInProfileIdentity({
        fullName: "Avery Johnson",
        profileUrl: "https://www.linkedin.com/company/example-corp/"
      })
    ).toMatchObject({ ok: false, reason: "missing_profile_url" });
  });
});

describe("splitProfileName", () => {
  it("splits first and last names without Unknown fallbacks", () => {
    expect(splitProfileName("Avery Johnson")).toEqual({ firstName: "Avery", lastName: "Johnson" });
    expect(splitProfileName("Unable to extract this field")).toEqual({ firstName: "" });
  });
});
