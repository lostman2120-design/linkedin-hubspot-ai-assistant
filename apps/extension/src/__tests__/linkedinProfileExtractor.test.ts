// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://www.linkedin.com/in/avery-johnson/"}
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LinkedInProfileSchema, PROFILE_TEXT_LIMITS, validateLinkedInProfileIdentity } from "@linkedin-hubspot-ai/shared";
import {
  dedupeProfileText,
  extractLinkedInProfile,
  normalizeText,
  parseFullNameFromDocumentTitle,
  uniqueStrings
} from "../linkedinProfileExtractor";

beforeEach(() => {
  window.history.pushState({}, "", "https://www.linkedin.com/in/avery-johnson/");
  document.title = "LinkedIn";
  document.body.innerHTML = "";
  Object.defineProperty(HTMLElement.prototype, "innerText", {
    configurable: true,
    get() {
      return this.textContent ?? "";
    }
  });
  vi.spyOn(window, "getComputedStyle").mockReturnValue({
    display: "block",
    visibility: "visible",
    opacity: "1"
  } as CSSStyleDeclaration);
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue([{ width: 1, height: 1 }] as unknown as DOMRectList);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("LinkedIn profile text cleanup", () => {
  it("normalizes whitespace", () => {
    expect(normalizeText("  Building\n\nRetainIQ\t(AI SaaS)  ")).toBe("Building RetainIQ (AI SaaS)");
  });

  it("keeps only the first copy of duplicate strings", () => {
    expect(
      uniqueStrings([
        "Building RetainIQ (AI SaaS) | Product & AI Lead",
        "Building RetainIQ (AI SaaS) | Product & AI Lead",
        "Aielevate · Part-time",
        "Aielevate · Part-time"
      ])
    ).toEqual(["Building RetainIQ (AI SaaS) | Product & AI Lead", "Aielevate · Part-time"]);
  });

  it("deduplicates exact duplicate profile lines", () => {
    expect(
      dedupeProfileText(
        [
          "Building RetainIQ (AI SaaS) | Product & AI Lead",
          "Building RetainIQ (AI SaaS) | Product & AI Lead",
          "Aielevate · Part-time",
          "Aielevate · Part-time"
        ].join("\n")
      )
    ).toBe(["Building RetainIQ (AI SaaS) | Product & AI Lead", "Aielevate · Part-time"].join("\n"));
  });

  it("deduplicates repeated consecutive text inside one field", () => {
    expect(dedupeProfileText("Aielevate · Part-time Aielevate · Part-time")).toBe("Aielevate · Part-time");
  });
});

describe("LinkedIn profile extraction", () => {
  it("extracts structured visible profile fields from an h1-based profile", () => {
    document.body.innerHTML = `
      <main>
        <section>
          <div class="pv-text-details__left-panel">
            <h1>Avery Johnson</h1>
            <div class="text-body-medium break-words">VP Sales at Example Corp</div>
            <span class="text-body-small inline t-black--light break-words">San Francisco, California, United States</span>
          </div>
          <a href="/company/example-corp/"><span aria-hidden="true">Example Corp</span></a>
        </section>
      </main>
    `;

    const profile = extractLinkedInProfile();

    expect(profile).toMatchObject({
      fullName: "Avery Johnson",
      firstName: "Avery",
      lastName: "Johnson",
      headline: "VP Sales at Example Corp",
      companyName: "Example Corp",
      location: "San Francisco, California, United States",
      profileUrl: "https://www.linkedin.com/in/avery-johnson/"
    });
    expect(validateLinkedInProfileIdentity(profile)).toEqual({ ok: true });
  });

  it("extracts name and headline from the current top-card region", () => {
    document.body.innerHTML = `
      <main>
        <section data-view-name="profile-top-card">
          <div>
            <h1><span aria-hidden="true">Morgan Smith</span></h1>
            <div class="text-body-medium break-words">Founder at RevenueWorks</div>
            <span class="text-body-small inline t-black--light break-words">New York, New York, United States</span>
          </div>
          <button aria-label="Current company: RevenueWorks">
            <span aria-hidden="true">RevenueWorks</span>
          </button>
        </section>
      </main>
    `;

    const profile = extractLinkedInProfile();

    expect(profile.fullName).toBe("Morgan Smith");
    expect(profile.headline).toBe("Founder at RevenueWorks");
    expect(profile.companyName).toBe("RevenueWorks");
    expect(profile.location).toBe("New York, New York, United States");
    expect(validateLinkedInProfileIdentity(profile)).toEqual({ ok: true });
  });

  it("extracts visible About and Experience context without LinkedIn boilerplate", () => {
    document.body.innerHTML = `
      <main>
        <section data-view-name="profile-top-card">
          <h1>Avery Johnson</h1>
          <div class="text-body-medium break-words">RevOps Lead at Example Corp</div>
          <a href="/company/example-corp/"><span aria-hidden="true">Example Corp</span></a>
        </section>
        <section>
          <div id="about"></div>
          <h2>About</h2>
          <p>I help sales teams improve CRM hygiene and outbound workflows.</p>
          <button>Show more</button>
        </section>
        <section>
          <div id="experience"></div>
          <h2>Experience</h2>
          <div>RevOps Lead</div>
          <div>Example Corp · Full-time</div>
          <p>Owns HubSpot process improvements and sales workflow cleanup.</p>
          <button>Connect</button>
          <button>Message</button>
        </section>
      </main>
    `;

    const profile = extractLinkedInProfile();

    expect(profile.about).toContain("improve CRM hygiene");
    expect(profile.currentRoleDescription).toContain("RevOps Lead");
    expect(profile.visibleProfileContext?.experience?.visibleItems.join(" ")).toContain("HubSpot process improvements");
    expect(profile.visibleProfileContext?.rawVisibleContext).toContain("CRM hygiene");
    expect(profile.visibleProfileContext?.rawVisibleContext).not.toContain("Show more");
    expect(profile.visibleProfileContext?.rawVisibleContext).not.toContain("Connect");
    expect(profile.contextConfidence).toBe("high");
  });

  it("compacts long visible profile context before returning the profile payload", () => {
    const longAbout = Array.from({ length: 260 }, (_, index) => `CRM hygiene and outbound workflow detail ${index + 1}`).join(" ");
    const longExperience = Array.from({ length: 180 }, (_, index) => `HubSpot process improvement detail ${index + 1}`).join(" ");
    document.body.innerHTML = `
      <main>
        <section data-view-name="profile-top-card">
          <h1>Avery Johnson</h1>
          <div class="text-body-medium break-words">RevOps Lead at Example Corp</div>
          <a href="/company/example-corp/"><span aria-hidden="true">Example Corp</span></a>
        </section>
        <section>
          <div id="about"></div>
          <h2>About</h2>
          <p>${longAbout}</p>
          <button>Show more</button>
        </section>
        <section>
          <div id="experience"></div>
          <h2>Experience</h2>
          <div>RevOps Lead</div>
          <div>Example Corp · Full-time</div>
          <p>${longExperience}</p>
        </section>
      </main>
    `;

    const profile = extractLinkedInProfile();

    expect(profile.visibleTextSample?.length).toBeLessThanOrEqual(PROFILE_TEXT_LIMITS.visibleTextSample);
    expect(profile.visibleProfileContext?.rawVisibleContext?.length).toBeLessThanOrEqual(PROFILE_TEXT_LIMITS.rawVisibleContext);
    expect(profile.visibleTextSample).toContain("RevOps Lead at Example Corp");
    expect(profile.visibleTextSample).toContain("About:");
    expect(profile.visibleTextSample).not.toContain("Show more");
    expect(() => LinkedInProfileSchema.parse(profile)).not.toThrow();
  });

  it("warns when optional visible profile context is limited", () => {
    document.body.innerHTML = `
      <main>
        <section>
          <h1>Avery Johnson</h1>
          <div class="text-body-medium break-words">Sales Leader</div>
        </section>
      </main>
    `;

    const profile = extractLinkedInProfile();

    expect(profile.fullName).toBe("Avery Johnson");
    expect(profile.extractionWarnings).toContain("Limited profile context detected. AI score may be less accurate.");
  });

  it("can extract fields after a delayed profile DOM load", () => {
    document.body.innerHTML = "<main><section></section></main>";

    expect(extractLinkedInProfile().fullName).toBe("");

    document.body.innerHTML = `
      <main>
        <section>
          <h1>Avery Johnson</h1>
          <div class="text-body-medium break-words">Revenue Leader at Example Corp</div>
        </section>
      </main>
    `;

    expect(extractLinkedInProfile().fullName).toBe("Avery Johnson");
  });

  it.each([
    ["Bill Gates - Co-chair, Bill & Melinda Gates Foundation | LinkedIn", "Bill Gates"],
    ["William H. Gates III | LinkedIn", "William H. Gates III"],
    ["John Smith - Founder - Company | LinkedIn", "John Smith"],
    ["John Smith | LinkedIn", "John Smith"]
  ])("extracts a full name from document.title fallback: %s", (title, expectedName) => {
    expect(parseFullNameFromDocumentTitle(title)).toBe(expectedName);
  });

  it.each(["LinkedIn", "Profile", "Feed", "Home", "Unknown", "N/A", "Unable to extract this field"])(
    "rejects invalid document.title full name candidates: %s",
    (title) => {
      expect(parseFullNameFromDocumentTitle(`${title} | LinkedIn`)).toBeUndefined();
    }
  );

  it("recovers the observed production case from document.title when DOM name selectors fail", () => {
    window.history.pushState({}, "", "https://www.linkedin.com/in/williamhgates/");
    document.title = "Bill Gates - Co-chair, Bill & Melinda Gates Foundation | LinkedIn";
    document.body.innerHTML = `
      <main>
        <section data-view-name="profile-top-card">
          <a href="/company/gates-foundation/"><span aria-hidden="true">Gates Foundation</span></a>
        </section>
      </main>
    `;

    const profile = extractLinkedInProfile();

    expect(profile).toMatchObject({
      fullName: "Bill Gates",
      firstName: "Bill",
      lastName: "Gates",
      headline: "Co-chair, Bill & Melinda Gates Foundation",
      companyName: "Gates Foundation",
      profileUrl: "https://www.linkedin.com/in/williamhgates/"
    });
    expect(validateLinkedInProfileIdentity(profile)).toEqual({ ok: true });
  });

  it("ignores unrelated company links outside the top card and current experience", () => {
    document.body.innerHTML = `
      <main>
        <section>
          <h1>Avery Johnson</h1>
          <div class="text-body-medium break-words">Independent advisor</div>
        </section>
        <aside>
          <p>People also viewed</p>
          <a href="/company/unrelated-enterprise/"><span aria-hidden="true">Unrelated Enterprise</span></a>
        </aside>
      </main>
    `;

    const profile = extractLinkedInProfile();

    expect(profile.companyName).toBeUndefined();
    expect(profile.extractionSources?.companyName).toBeUndefined();
  });

  it("does not treat a company-only value as a person name", () => {
    document.body.innerHTML = `
      <main>
        <section>
          <h1>Example Corp</h1>
          <a href="/company/example-corp/"><span aria-hidden="true">Example Corp</span></a>
        </section>
      </main>
    `;

    const profile = extractLinkedInProfile();

    expect(profile.fullName).toBe("");
    expect(validateLinkedInProfileIdentity(profile)).toMatchObject({ ok: false, reason: "missing_name" });
  });
});
