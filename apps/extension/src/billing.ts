declare const __STRIPE_PAYMENT_LINK__: string;

const DEFAULT_STRIPE_PAYMENT_LINK = "https://buy.stripe.com/4gMdR94zOalH6pebny8Vi00";

export const STRIPE_PAYMENT_LINK =
  typeof __STRIPE_PAYMENT_LINK__ === "string" && __STRIPE_PAYMENT_LINK__.trim()
    ? __STRIPE_PAYMENT_LINK__
    : DEFAULT_STRIPE_PAYMENT_LINK;
