/**
 * Smart Discount Engine — $3 off when profitable. Reason codes are internal only.
 * CEO overrides: Firestore `pricingConfig/smartDiscount`.
 */

export interface DiscountCheck {
  eligible: boolean;
  discountAmount: number;
  reason: string;
  displayText: string;
}

const HOME_MIN_PRICE_SERVICES = new Set([
  "lawn",
  "pressure",
  "cuts",
  "snow",
  "gutter",
  "fence",
  "protect",
]);

export type SmartDiscountRuleToggles = {
  newCustomerBoost: boolean;
  loyaltyEvery5th: boolean;
  slowHourStimulator: boolean;
  lateNightBoost: boolean;
  bigSpender: boolean;
  /** When true, no discount 5–9 AM and 4–8 PM (returning customers only). */
  peakHourBlock: boolean;
  /** When true, no discount when Uber surge is above threshold. */
  surgeProtection: boolean;
};

export type SmartDiscountConfig = {
  amount: number;
  minJobValue: number;
  /** First-order acquisition: min customer total (Rule 4). */
  minNewCustomerJobValue: number;
  minGriddProfit: number;
  minMilesRide: number;
  minMilesDelivery: number;
  minHomeService: number;
  bigSpenderThreshold: number;
  /** Same default as spec / ride PriceIQ. */
  surgeBlockAbove: number;
  rules: SmartDiscountRuleToggles;
};

export const DEFAULT_SMART_DISCOUNT_CONFIG: SmartDiscountConfig = {
  amount: 3.0,
  minJobValue: 25.0,
  minNewCustomerJobValue: 20.0,
  minGriddProfit: 2.5,
  minMilesRide: 8,
  minMilesDelivery: 5,
  minHomeService: 80.0,
  bigSpenderThreshold: 100.0,
  surgeBlockAbove: 1.3,
  rules: {
    newCustomerBoost: true,
    loyaltyEvery5th: true,
    slowHourStimulator: true,
    lateNightBoost: true,
    bigSpender: true,
    peakHourBlock: true,
    surgeProtection: true,
  },
};

export function mergeSmartDiscountConfig(
  partial: Partial<SmartDiscountConfig> | null | undefined,
): SmartDiscountConfig {
  if (!partial) return { ...DEFAULT_SMART_DISCOUNT_CONFIG, rules: { ...DEFAULT_SMART_DISCOUNT_CONFIG.rules } };
  return {
    ...DEFAULT_SMART_DISCOUNT_CONFIG,
    ...partial,
    rules: { ...DEFAULT_SMART_DISCOUNT_CONFIG.rules, ...partial.rules },
  };
}

function approxSubtotalFromTotal(griddTotalUsd: number, platformFeePct: number): number {
  if (griddTotalUsd <= 0) return 0;
  return griddTotalUsd / (1 + platformFeePct);
}

/** GRIDD share after $3 (spec: 90% to ops). */
export function griddProfitAfterDiscountUsd(
  platformFeeUsd: number,
  discountAmount: number,
): number {
  const after = platformFeeUsd - discountAmount;
  if (after <= 0) return 0;
  return after * 0.9;
}

export type SmartDiscountContext = {
  griddTotalUsd: number;
  subtotalUsd: number;
  platformFeeUsd: number;
  platformFeePct: number;
};

function resolvePriceContext(
  griddTotalUsd: number,
  subtotalUsd: number | null | undefined,
  platformFeeUsd: number | null | undefined,
  platformFeePct: number | null | undefined,
): SmartDiscountContext {
  const pct = platformFeePct != null && platformFeePct > 0 ? platformFeePct : 0.15;
  let sub = subtotalUsd;
  if (sub == null || sub <= 0) {
    sub = approxSubtotalFromTotal(griddTotalUsd, pct);
  }
  let pf = platformFeeUsd;
  if (pf == null || pf <= 0) {
    pf = griddTotalUsd - sub;
  }
  if (pf < 0) pf = 0;
  return { griddTotalUsd, subtotalUsd: sub, platformFeeUsd: pf, platformFeePct: pct };
}

/**
 * @param getHour — inject for tests (0–23, local time).
 * @param _pickupLat _pickupLng — reserved for future geo-based rules.
 */
export async function checkSmartDiscount(
  _customerId: string,
  service: string,
  jobPrice: number,
  miles: number,
  _pickupLat: number,
  _pickupLng: number,
  isNewCustomer: boolean,
  jobsCompleted: number,
  uberSurgeMultiplier: number = 1.0,
  config: Partial<SmartDiscountConfig> | null = null,
  price: Partial<SmartDiscountContext> | null = null,
  getHour: () => number = () => new Date().getHours(),
): Promise<DiscountCheck> {
  const c = mergeSmartDiscountConfig(config);
  const amount = c.amount;
  const ctx = resolvePriceContext(
    jobPrice,
    price?.subtotalUsd,
    price?.platformFeeUsd,
    price?.platformFeePct,
  );
  const { griddTotalUsd, subtotalUsd, platformFeeUsd } = ctx;
  const driverPayout = subtotalUsd * 0.85;
  const costFloor = driverPayout + 1.5;
  const hour = getHour();

  const ineligible = (reason: string): DiscountCheck => ({
    eligible: false,
    discountAmount: 0,
    reason,
    displayText: "",
  });

  if (!Number.isFinite(griddTotalUsd) || griddTotalUsd <= 0) {
    return ineligible("invalid_price");
  }

  // Rule 1 — min job: $25 returning; new customers need order > $20 (Rule 4).
  if (!isNewCustomer && griddTotalUsd < c.minJobValue) {
    return ineligible("job_too_small");
  }
  if (isNewCustomer && griddTotalUsd <= c.minNewCustomerJobValue) {
    return ineligible("new_customer_order_too_small");
  }

  // Rule 2 — min GRIDD profit (platform fee after discount)
  const afterPlatformDiscount = platformFeeUsd - amount;
  const ceoNet = afterPlatformDiscount * 0.9;
  if (ceoNet < c.minGriddProfit) {
    return ineligible("insufficient_profit");
  }

  // Rule 7 — cost floor (GRIDD price − $3 still covers driver + buffer)
  if (griddTotalUsd - amount < costFloor) {
    return ineligible("below_cost_floor");
  }

  // Rule 3 — distance & home minimum
  if (service === "ride" && miles < c.minMilesRide) {
    return ineligible("ride_too_short");
  }
  if (service === "send" && miles < c.minMilesDelivery) {
    return ineligible("delivery_too_short");
  }
  if (HOME_MIN_PRICE_SERVICES.has(service) && griddTotalUsd < c.minHomeService) {
    return ineligible("home_service_too_small");
  }

  // Rule 8 — surge protection
  if (c.rules.surgeProtection && uberSurgeMultiplier > c.surgeBlockAbove) {
    return ineligible("uber_surging_keep_profit");
  }

  // Rule 6 — peak (returning only; new customers never blocked by peak here)
  if (c.rules.peakHourBlock && !isNewCustomer) {
    const isPeakHour = (hour >= 5 && hour <= 9) || (hour >= 16 && hour <= 20);
    if (isPeakHour) {
      return ineligible("peak_hour_no_discount");
    }
  }

  const isSlowWindow = hour >= 10 && hour <= 15;
  const isLateNight = hour >= 22 || hour < 4;

  if (c.rules.newCustomerBoost && isNewCustomer && griddTotalUsd > c.minNewCustomerJobValue) {
    return {
      eligible: true,
      discountAmount: amount,
      reason: "new_customer_acquisition",
      displayText: "🎉 Welcome to GRIDD! $3 off your first order",
    };
  }

  if (c.rules.loyaltyEvery5th) {
    const isEvery5thOrder = (jobsCompleted + 1) % 5 === 0 && jobsCompleted > 0;
    if (isEvery5thOrder) {
      return {
        eligible: true,
        discountAmount: amount,
        reason: "loyalty_every_5th_job",
        displayText: "🎁 Loyalty reward! $3 off",
      };
    }
  }

  if (c.rules.slowHourStimulator && isSlowWindow) {
    return {
      eligible: true,
      discountAmount: amount,
      reason: "slow_hour_stimulator",
      displayText: "⚡ Limited time — $3 off!",
    };
  }

  if (c.rules.lateNightBoost && isLateNight) {
    return {
      eligible: true,
      discountAmount: amount,
      reason: "late_night_boost",
      displayText: "🌙 Night rate — $3 off",
    };
  }

  if (c.rules.bigSpender && griddTotalUsd >= c.bigSpenderThreshold) {
    return {
      eligible: true,
      discountAmount: amount,
      reason: "big_spender_reward",
      displayText: "💚 $3 off — thanks for choosing GRIDD",
    };
  }

  return {
    eligible: false,
    discountAmount: 0,
    reason: "no_trigger_met",
    displayText: "",
  };
}
