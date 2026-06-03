import { describe, expect, it } from "vitest";
import { dedupeProfileText, normalizeText, uniqueStrings } from "../linkedinProfileExtractor";

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
