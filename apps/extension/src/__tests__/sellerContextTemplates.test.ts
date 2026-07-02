import { describe, expect, it } from "vitest";
import { SELLER_CONTEXT_TEMPLATES, getSellerContextTemplate, sellerContextHasValues } from "../sellerContextTemplates";

describe("Seller Context templates", () => {
  it("provides all five launch templates with complete Seller Context fields", () => {
    expect(SELLER_CONTEXT_TEMPLATES.map((template) => template.name)).toEqual([
      "B2B SaaS Founder",
      "HubSpot Consultant",
      "RevOps Agency",
      "Sales Agency",
      "Freelance Consultant"
    ]);

    for (const template of SELLER_CONTEXT_TEMPLATES) {
      expect(Object.values(template.context).every((value) => value.trim().length > 0)).toBe(true);
    }
  });

  it("returns practical HubSpot consultant context", () => {
    const template = getSellerContextTemplate("hubspot-consultant");

    expect(template.context.productOrServiceName).toBe("HubSpot consulting and implementation");
    expect(template.context.productOrServiceDescription).toContain("lifecycle design");
    expect(template.context.compatibilityContext).toContain("current HubSpot portal");
  });

  it("detects existing values before a template overwrite", () => {
    const context = getSellerContextTemplate("freelance-consultant").context;
    expect(sellerContextHasValues(context)).toBe(true);
    expect(sellerContextHasValues(Object.fromEntries(Object.keys(context).map((key) => [key, ""])) as typeof context)).toBe(false);
  });
});
