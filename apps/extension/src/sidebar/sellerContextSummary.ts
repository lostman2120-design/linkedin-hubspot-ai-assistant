import type { SellerContext, UserSettings } from "@linkedin-hubspot-ai/shared";
import { DEFAULT_SELLER_CONTEXT } from "@linkedin-hubspot-ai/shared";

export type SellerContextSummaryField = {
  label: string;
  value: string;
};

const summaryKeys: Array<keyof Pick<SellerContext, "productOrServiceName" | "targetOutcome" | "preferredCta" | "brandVoice">> = [
  "productOrServiceName",
  "targetOutcome",
  "preferredCta",
  "brandVoice"
];

export function truncateSellerContextValue(value: string, maxLength = 96): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "Not set";
  }

  if (Array.from(normalized).length <= maxLength) {
    return normalized;
  }

  return `${Array.from(normalized).slice(0, Math.max(0, maxLength - 3)).join("").trimEnd()}...`;
}

export function buildSellerContextSummaryFields(settings: UserSettings, maxLength = 96): SellerContextSummaryField[] {
  const sellerContext = settings.sellerContext ?? DEFAULT_SELLER_CONTEXT;

  return [
    { label: "Offer", value: truncateSellerContextValue(sellerContext.productOrServiceName, maxLength) },
    { label: "Target outcome", value: truncateSellerContextValue(sellerContext.targetOutcome, maxLength) },
    { label: "Preferred CTA", value: truncateSellerContextValue(sellerContext.preferredCta, maxLength) },
    { label: "Brand voice", value: truncateSellerContextValue(sellerContext.brandVoice, maxLength) }
  ];
}

export function sellerContextStatus(sellerContext: SellerContext): "Custom context" | "Default context" | "Incomplete context" {
  const missingRequiredField = summaryKeys.some((key) => !sellerContext[key]?.trim());
  if (missingRequiredField) {
    return "Incomplete context";
  }

  const hasCustomValue = (Object.keys(DEFAULT_SELLER_CONTEXT) as Array<keyof SellerContext>).some(
    (key) => sellerContext[key]?.trim() !== DEFAULT_SELLER_CONTEXT[key]
  );

  return hasCustomValue ? "Custom context" : "Default context";
}
