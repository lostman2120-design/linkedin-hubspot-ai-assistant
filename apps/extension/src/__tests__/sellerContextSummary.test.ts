import { describe, expect, it } from "vitest";
import { DEFAULT_SELLER_CONTEXT, DEFAULT_USER_SETTINGS } from "@linkedin-hubspot-ai/shared";
import { buildSellerContextSummaryFields, sellerContextStatus, truncateSellerContextValue } from "../sidebar/sellerContextSummary";

describe("Seller Context sidebar summary", () => {
  it("renders default Seller Context summary", () => {
    const fields = buildSellerContextSummaryFields({
      ...DEFAULT_USER_SETTINGS,
      sellerContext: DEFAULT_SELLER_CONTEXT
    });

    expect(fields).toContainEqual({ label: "Offer", value: DEFAULT_SELLER_CONTEXT.productOrServiceName });
    expect(sellerContextStatus(DEFAULT_SELLER_CONTEXT)).toBe("Default context");
  });

  it("renders custom Seller Context summary", () => {
    const sellerContext = {
      ...DEFAULT_SELLER_CONTEXT,
      productOrServiceName: "WorkflowOS",
      targetOutcome: "Reduce CRM busywork",
      preferredCta: "Ask for workflow feedback",
      brandVoice: "Helpful and direct"
    };

    expect(sellerContextStatus(sellerContext)).toBe("Custom context");
    expect(buildSellerContextSummaryFields({ ...DEFAULT_USER_SETTINGS, sellerContext })).toContainEqual({
      label: "Preferred CTA",
      value: "Ask for workflow feedback"
    });
  });

  it("shows incomplete context when key fields are empty", () => {
    const sellerContext = {
      ...DEFAULT_SELLER_CONTEXT,
      productOrServiceName: "",
      targetOutcome: "",
      preferredCta: ""
    };

    expect(sellerContextStatus(sellerContext)).toBe("Incomplete context");
  });

  it("truncates long display values without crashing", () => {
    expect(truncateSellerContextValue("A".repeat(140), 80)).toHaveLength(80);
    expect(truncateSellerContextValue("A".repeat(140), 80)).toMatch(/\.\.\.$/);
  });
});
