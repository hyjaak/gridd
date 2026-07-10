import {
  calculateGRIDDPrice,
  applyPlatformFee,
  computeRideLineItems,
  metersToMiles,
} from "@/lib/calculatePrice";
import { DEFAULT_PLATFORM_FEE } from "@/lib/pricing";
import { buildPriceIQOptions } from "@/lib/priceIQ-options";
import type { Urgency } from "@/types/booking";

const NOW_FEE_CENTS = 1500;

/** Flat rush when booking "now" — not stacked on services that already encode urgency in price. */
export function shouldAddFlatRushFee(serviceId: string): boolean {
  return serviceId !== "cuts" && serviceId !== "send" && serviceId !== "ride";
}

export function urgencyFeeCents(urgency: Urgency): number {
  if (urgency === "now") return NOW_FEE_CENTS;
  return 0;
}

export type BookingForm = Record<string, unknown>;

/**
 * Customer-facing estimate in cents (includes platform fee on subtotal).
 * Pass `routeMeters` when distance affects price (ride, send, haul, tow).
 */
export function estimateCentsForService(
  serviceId: string,
  form: BookingForm,
  urgency: Urgency,
  routeMeters?: number | null,
): number {
  const miles = metersToMiles(routeMeters ?? undefined);
  const options = buildPriceIQOptions(serviceId, form, urgency);
  let subUsd = calculateGRIDDPrice(serviceId, miles, options);
  if (serviceId === "ride") {
    return Math.round(subUsd * 100);
  }
  if (shouldAddFlatRushFee(serviceId)) {
    subUsd += urgencyFeeCents(urgency) / 100;
  }
  const pf = applyPlatformFee(subUsd, DEFAULT_PLATFORM_FEE);
  return Math.round(pf.totalUsd * 100);
}

/** Labor / service subtotal in USD before platform fee (for provider share). */
export function estimateSubtotalUsdBeforeFee(
  serviceId: string,
  form: BookingForm,
  urgency: Urgency,
  routeMeters?: number | null,
): number {
  const miles = metersToMiles(routeMeters ?? undefined);
  const options = buildPriceIQOptions(serviceId, form, urgency);
  if (serviceId === "ride") {
    const li = computeRideLineItems(miles, options, {});
    return li.tripSubtotal + li.bookingFee;
  }
  let subUsd = calculateGRIDDPrice(serviceId, miles, options);
  if (shouldAddFlatRushFee(serviceId)) {
    subUsd += urgencyFeeCents(urgency) / 100;
  }
  return subUsd;
}

/** Extra cents from driving distance — legacy; distance is now folded into `calculateGRIDDPrice` for routed services. */
export function distancePremiumCents(_routeMeters: number | null | undefined): number {
  return 0;
}
