import { describe, expect, it } from "vitest";
import {
  DEFAULT_SELLER_CONTEXT,
  DEFAULT_USER_SETTINGS,
  SELLER_CONTEXT_FIELD_LIMITS,
  SellerContextSchema,
  UserSettingsSchema,
  normalizeUserSettingsInput
} from "../index.js";

describe("Seller Context shared settings", () => {
  it("loads defaults when Seller Context is missing", () => {
    const settings = normalizeUserSettingsInput({
      ...DEFAULT_USER_SETTINGS,
      sellerContext: undefined
    });

    expect(settings.sellerContext).toMatchObject(DEFAULT_SELLER_CONTEXT);
  });

  it("loads saved Seller Context and preserves existing ICP settings", () => {
    const settings = normalizeUserSettingsInput({
      ...DEFAULT_USER_SETTINGS,
      targetRoles: "Founders, RevOps",
      targetIndustries: "B2B SaaS",
      sellerContext: {
        productOrServiceName: "WorkflowOS",
        productOrServiceDescription: "A workflow assistant for revenue teams.",
        targetOutcome: "Reduce manual CRM cleanup.",
        mainDifferentiators: "Evidence-based scoring and HubSpot notes.",
        proofPoints: "Live beta product.",
        pricingContext: "$19/month",
        preferredCta: "Ask for workflow feedback.",
        claimsAllowed: "Lightweight and human-reviewed.",
        claimsToAvoid: "Guaranteed revenue.",
        brandVoice: "Professional and concise.",
        competitorsOrAlternatives: "Manual copy-paste.",
        compatibilityContext: "Works alongside existing RevOps tools."
      }
    });

    expect(settings.targetRoles).toBe("Founders, RevOps");
    expect(settings.targetIndustries).toBe("B2B SaaS");
    expect(settings.sellerContext.productOrServiceName).toBe("WorkflowOS");
    expect(settings.sellerContext.preferredCta).toBe("Ask for workflow feedback.");
  });

  it("handles malformed Seller Context without throwing", () => {
    const settings = normalizeUserSettingsInput({
      ...DEFAULT_USER_SETTINGS,
      sellerContext: {
        productOrServiceName: ["bad"],
        brandVoice: null
      }
    });

    expect(settings.sellerContext.productOrServiceName).toBe(DEFAULT_SELLER_CONTEXT.productOrServiceName);
    expect(settings.sellerContext.brandVoice).toBe(DEFAULT_SELLER_CONTEXT.brandVoice);
  });

  it("enforces shared field limits by truncating normalized stored values", () => {
    const longName = "A".repeat(SELLER_CONTEXT_FIELD_LIMITS.productOrServiceName + 50);
    const settings = normalizeUserSettingsInput({
      ...DEFAULT_USER_SETTINGS,
      sellerContext: {
        ...DEFAULT_SELLER_CONTEXT,
        productOrServiceName: longName
      }
    });

    expect(settings.sellerContext.productOrServiceName).toHaveLength(SELLER_CONTEXT_FIELD_LIMITS.productOrServiceName);
  });

  it("supports Unicode and emoji safely", () => {
    const parsed = SellerContextSchema.parse({
      ...DEFAULT_SELLER_CONTEXT,
      brandVoice: "Helpful, concise, 日本語 notes okay for configuration 🙂"
    });

    expect(parsed.brandVoice).toContain("日本語");
    expect(parsed.brandVoice).toContain("🙂");
  });

  it("rejects likely secrets before saving settings", () => {
    const result = UserSettingsSchema.safeParse({
      ...DEFAULT_USER_SETTINGS,
      sellerContext: {
        ...DEFAULT_SELLER_CONTEXT,
        proofPoints: "api_key=sk-test-secret-value-that-should-not-be-stored"
      }
    });

    expect(result.success).toBe(false);
  });

  it("repeated normalization is idempotent", () => {
    const once = normalizeUserSettingsInput({
      ...DEFAULT_USER_SETTINGS,
      sellerContext: {
        ...DEFAULT_SELLER_CONTEXT,
        productOrServiceName: "  LinkedIn   Assistant  "
      }
    });
    const twice = normalizeUserSettingsInput(once);

    expect(twice).toEqual(once);
  });
});
