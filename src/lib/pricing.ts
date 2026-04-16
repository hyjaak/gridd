import type { ServiceTier } from "@/types";

export type PricingQuote = {
  currency: "usd";
  tier: ServiceTier;
  subtotalCents: number;
  feeCents: number;
  totalCents: number;
};

export function quotePrice({
  tier,
  baseCents,
}: {
  tier: ServiceTier;
  baseCents: number;
}): PricingQuote {
  const multiplier = tier === "premium" ? 1.4 : tier === "priority" ? 1.2 : 1;
  const subtotalCents = Math.round(baseCents * multiplier);
  const feeCents = Math.max(50, Math.round(subtotalCents * 0.08));
  return {
    currency: "usd",
    tier,
    subtotalCents,
    feeCents,
    totalCents: subtotalCents + feeCents,
  };
}

