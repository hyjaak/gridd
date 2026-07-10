import {
  CUTS_PRICING,
  DEFAULT_PLATFORM_FEE,
  GRIDD_PRICING,
  RIDE_PRICING,
  type GriddServiceId,
  type PricingConfigDoc,
  type RideTierKey,
} from "./pricing";

export type PriceCalculationOptions = {
  size?: string;
  weight?: string;
  lotSize?: string;
  yardSize?: string;
  duration?: number;
  durationMinutes?: number;
  stairs?: number;
  stairsFloors?: number;
  roadsideType?: string;
  kwh?: number;
  sqFt?: number;
  linearFt?: number;
  treeCount?: string;
  treeSize?: string;
  stumpRemoval?: boolean;
  /** Cuts — urgency multiplier (now / today / schedule) */
  scheduleUrgency?: "now" | "today" | "schedule";
  /** Adds flat $15 rush for non-cuts when "now" (server + client) */
  bookingUrgency?: "now" | "today" | "schedule";
  pressureSurface?: string;
  snowProperty?: string;
  fenceMaterial?: string;
  gutterStories?: number;
  gutterGuards?: boolean;
  protectPlan?: string;
  helpType?: string;
  rideType?: string;
  /** Route duration from Distance Matrix (seconds) — preferred over durationMinutes for ride */
  durationSeconds?: number;
  /** Ride — PriceIQ™ live routes (client passes resolved pickup/dropoff) */
  pickupLat?: number;
  pickupLng?: number;
  dropoffLat?: number;
  dropoffLng?: number;
  loadingHours?: number;
  lawnServices?: { edge?: boolean; bags?: boolean; mow?: boolean; blow?: boolean };
  gateInstall?: boolean;
};

function num(n: unknown, fallback: number): number {
  return typeof n === "number" && Number.isFinite(n) ? n : fallback;
}

function haulSizeKey(weight?: string): keyof (typeof GRIDD_PRICING)["haul"]["sizeMultiplier"] {
  const w = (weight ?? "medium").toLowerCase();
  if (w === "light" || w === "small") return "small";
  if (w === "heavy" || w === "large") return "large";
  if (w === "extra-heavy" || w === "xl" || w === "freight") return "xl";
  return "medium";
}

function haulLoadTier(weight?: string): keyof (typeof GRIDD_PRICING)["haul"]["loadTier"] {
  const w = (weight ?? "medium").toLowerCase();
  if (w === "light" || w === "small") return "small";
  if (w === "heavy" || w === "large") return "large";
  if (w === "extra-heavy" || w === "xl" || w === "freight") return "full";
  return "medium";
}

function sendWeightKey(weight?: string): keyof (typeof GRIDD_PRICING)["send"]["weightMultiplier"] {
  const w = (weight ?? "medium").toLowerCase();
  if (w === "light") return "light";
  if (w === "heavy") return "heavy";
  if (w === "freight" || w === "xl") return "freight";
  return "medium";
}

function lawnYardKey(yardSize?: string): keyof (typeof GRIDD_PRICING)["lawn"]["yardPrice"] {
  const y = (yardSize ?? "medium").toLowerCase();
  if (y === "small") return "small";
  if (y === "large") return "large";
  if (y === "xl" || y === "xlarge") return "xlarge";
  return "medium";
}

function parseTreeCount(s: string): { multKey: number; trees: number } {
  if (s === "5+") return { multKey: 5, trees: 5 };
  const n = Math.min(5, Math.max(1, parseInt(s, 10) || 1));
  return { multKey: n, trees: n };
}

function cutsSizeKeyFromForm(treeSize: string): keyof typeof CUTS_PRICING.treeSizePrice | null {
  const t = treeSize.trim().toLowerCase();
  if (!t) return null;
  if (t === "very-large" || t === "very_large") return "very_large";
  if (t === "small" || t === "medium" || t === "large") return t;
  return null;
}

function cutsSizePriceUsd(
  key: keyof typeof CUTS_PRICING.treeSizePrice,
  o: PricingConfigDoc,
): number {
  const d = CUTS_PRICING.treeSizePrice[key];
  if (key === "small" && o.cutsTreeSmall != null) return o.cutsTreeSmall;
  if (key === "medium" && o.cutsTreeMedium != null) return o.cutsTreeMedium;
  if (key === "large" && o.cutsTreeLarge != null) return o.cutsTreeLarge;
  if (key === "very_large" && o.cutsTreeVeryLarge != null) return o.cutsTreeVeryLarge;
  return d;
}

/** Map booking ride type → RIDE_PRICING tier (`cargo` → premium). */
export function rideTierFromForm(rideType: string): RideTierKey {
  const r = rideType.toLowerCase();
  if (r === "xl") return "xl";
  if (r === "cargo" || r === "premium") return "premium";
  return "standard";
}

function rideTierConfig(rideType: string) {
  return RIDE_PRICING[rideTierFromForm(rideType)];
}

export function getRideMinutes(options: PriceCalculationOptions): number {
  if (typeof options.durationSeconds === "number" && options.durationSeconds > 0) {
    return Math.max(0.5, options.durationSeconds / 60);
  }
  return num(options.durationMinutes ?? options.duration, 15);
}

/** Full ride line items + customer total (booking fee + 15% of trip + min + surge). */
export function computeRideLineItems(
  miles: number,
  options: PriceCalculationOptions,
  overrides: PricingConfigDoc = {},
) {
  const m = Math.max(0, miles);
  const tier = rideTierConfig(String(options.rideType ?? "standard"));
  const minutes = getRideMinutes(options);
  const base = tier.baseFare;
  const dist = round2(tier.perMile * m);
  const time = round2(tier.perMinute * minutes);
  const tripSubtotal = round2(base + dist + time);
  const bookingFee = tier.bookingFee;
  const lineSubtotal = round2(tripSubtotal + bookingFee);
  const platformFeeRate =
    typeof overrides.platformFee === "number" && overrides.platformFee >= 0 && overrides.platformFee <= 0.5
      ? overrides.platformFee
      : (tier as { platformFee: number }).platformFee;
  const platformFeeUsd = round2(lineSubtotal * platformFeeRate);
  const totalBeforeMin = round2(lineSubtotal + platformFeeUsd);
  const surge = overrides.surgeMultiplier ?? RIDE_PRICING.surgeMultiplier;
  const afterMin = Math.max(totalBeforeMin, tier.minimumFare);
  const finalTotal = round2(afterMin * surge);
  return {
    tier,
    base,
    dist,
    time,
    minutes,
    tripSubtotal,
    bookingFee,
    lineSubtotal,
    platformFeeRate,
    platformFeeUsd,
    totalBeforeMin,
    minFare: tier.minimumFare,
    surge,
    afterMin,
    finalTotal,
  };
}

function pressureSurfaceBaseUsd(surface: string, sqft: number): number {
  const p = GRIDD_PRICING.pressure;
  const s = surface.toLowerCase();
  if (s === "driveway") return p.surfaceBase.driveway;
  if (s === "patio" || s === "deck") return p.surfaceBase.deck;
  if (s === "house") return sqft > 2000 ? p.surfaceBase.house_large : p.surfaceBase.house_small;
  if (s === "all") return p.surfaceBase.house_large + p.surfaceBase.driveway;
  return p.surfaceBase.driveway;
}

/**
 * Core GRIDD subtotal in USD (before platform fee), using static GRIDD_PRICING + optional CEO overrides.
 */
export function calculateGRIDDPrice(
  service: string,
  miles: number,
  options: PriceCalculationOptions = {},
  overrides: PricingConfigDoc = {},
): number {
  if (!isGriddService(service)) return 0;
  const m = Math.max(0, miles);
  const o = overrides;

  switch (service) {
    case "ride": {
      return computeRideLineItems(m, options, o).finalTotal;
    }

    case "haul": {
      const p = GRIDD_PRICING.haul;
      const base = o.baseFare ?? p.baseFare;
      const pm = o.perMile ?? p.perMile;
      const sz = haulSizeKey(options.weight ?? options.size);
      const mult = p.sizeMultiplier[sz] ?? 1;
      const tier = haulLoadTier(options.weight ?? options.size);
      const tierFloor = p.loadTier[tier];
      const loadingHrs = Math.min(8, Math.max(0.5, num(options.loadingHours, 1)));
      let price = base + pm * m + p.perHourLoading * loadingHrs;
      price *= mult;
      const flights = num(options.stairs ?? options.stairsFloors, 0);
      if (flights > 0) price += p.perStairFlight * Math.min(flights, 20);
      price = Math.max(price, tierFloor);
      const min = o.minimum ?? p.minimum;
      price = Math.max(price, min);
      return round2(price);
    }

    case "send": {
      const p = GRIDD_PRICING.send;
      const base = o.baseFare ?? p.baseFare;
      const pm = o.perMile ?? p.perMile;
      const wk = sendWeightKey(options.weight ?? options.size);
      const mult = p.weightMultiplier[wk] ?? 1;
      let price = (base + pm * m) * mult;
      const u = options.bookingUrgency ?? "today";
      if (u === "now") price += p.sameHourAdd;
      else if (u === "schedule") price += p.scheduledAdd;
      const min = o.minimum ?? p.minimum;
      price = Math.max(price, min);
      return round2(price);
    }

    case "roadside": {
      const p = GRIDD_PRICING.roadside;
      const t = String(options.roadsideType ?? "flat_tire");
      if (t === "jump_start") return round2(p.jumpstart);
      if (t === "lockout") return round2(p.lockout);
      if (t === "fuel") return round2(p.fuel.serviceFee);
      if (t === "flat_tire") return round2(p.tireChange);
      if (t === "tire_replace" || t === "tire") return 0;
      if (t === "tow") {
        const tw = p.tow;
        const baseTow = o.baseFare ?? tw.baseFare;
        const pm = o.perMile ?? tw.perMile;
        let price = baseTow + pm * m;
        const min = o.minimum ?? tw.minimum;
        price = Math.max(price, min);
        return round2(price);
      }
      return round2(p.tireChange);
    }

    case "evcharge": {
      const p = GRIDD_PRICING.evcharge;
      const kwh = num(options.kwh, 12);
      const pk = o.perKwh ?? p.perKwh;
      const sf = o.baseFare ?? p.serviceFee;
      let price = sf + pk * kwh;
      const min = o.minimum ?? p.minimum;
      price = Math.max(price, min);
      return round2(price);
    }

    case "lawn": {
      const p = GRIDD_PRICING.lawn;
      const yk = lawnYardKey(options.lotSize ?? options.yardSize);
      let price: number = p.yardPrice[yk] ?? p.yardPrice.medium;
      const svc = options.lawnServices ?? {};
      if (svc.edge) price += p.edgingAdd;
      if (svc.bags) price += p.baggingAdd;
      const min = o.minimum ?? p.minimum;
      price = Math.max(price, min);
      return round2(price);
    }

    case "pressure": {
      const p = GRIDD_PRICING.pressure;
      const sq = num(options.sqFt, 800);
      const surf = String(options.pressureSurface ?? "driveway");
      const baseSurf = pressureSurfaceBaseUsd(surf, sq);
      const psf = o.perSqFt ?? p.perSqFt;
      let price = baseSurf + psf * sq;
      const min = o.minimum ?? p.minimum;
      price = Math.max(price, min);
      return round2(price);
    }

    case "snow": {
      const p = GRIDD_PRICING.snow;
      const prop = String(options.snowProperty ?? "driveway").toLowerCase();
      let price: number = p.drivewaySmall;
      if (prop === "walkway") price = p.walkway;
      else if (prop === "full") price = p.drivewayLarge;
      else price = p.drivewaySmall;
      const min = o.minimum ?? p.minimum;
      price = Math.max(price, min);
      return round2(price);
    }

    case "gutter": {
      const p = GRIDD_PRICING.gutter;
      const stories = Math.min(3, Math.max(1, Math.round(num(options.gutterStories, 1))));
      const lf = num(options.linearFt, stories * 50);
      const storyBase =
        stories >= 3 ? p.threeStory : stories === 2 ? p.twoStory : p.singleStory;
      const plf = o.perLinearFt ?? p.perLinearFt;
      let price = storyBase + plf * lf;
      if (options.gutterGuards) price *= 1.15;
      const min = o.minimum ?? p.minimum;
      price = Math.max(price, min);
      return round2(price);
    }

    case "fence": {
      const p = GRIDD_PRICING.fence;
      const lf = num(options.linearFt, 40);
      const mat = String(options.fenceMaterial ?? "wood").toLowerCase();
      const perFt =
        mat === "vinyl" ? p.perLinearFtVinyl : mat === "chain" ? p.perLinearFtChain : p.perLinearFtWood;
      let price = perFt * lf;
      if (options.gateInstall === true) price += p.gateInstall;
      return round2(price);
    }

    case "protect": {
      const p = GRIDD_PRICING.protect;
      const plan = String(options.protectPlan ?? "basic").toLowerCase();
      let price: number;
      if (plan === "monthly") price = p.overnight;
      else if (plan === "business") price = Math.max(400, p.eventRate * 6);
      else if (plan === "pro") price = Math.max(p.eventRate * 4, p.minimum4hrs);
      else price = Math.max(p.minimum4hrs, p.perHour * 4);
      const min = o.minimum ?? p.minimum;
      price = Math.max(price, min);
      return round2(price);
    }

    case "cuts": {
      const sk = cutsSizeKeyFromForm(String(options.treeSize ?? ""));
      if (!sk) return 0;
      const { multKey, trees } = parseTreeCount(String(options.treeCount ?? "1"));
      const sizeUsd = cutsSizePriceUsd(sk, o);
      const qMult = CUTS_PRICING.quantityMultiplier[multKey] ?? 1;
      const stumpEach = o.cutsStump ?? CUTS_PRICING.stumpRemoval;
      const stumpCost = options.stumpRemoval ? stumpEach * trees : 0;
      const beforeUrgency = sizeUsd * qMult + stumpCost;
      const u = (options.scheduleUrgency ?? "today") as keyof typeof CUTS_PRICING.urgencySurcharge;
      const urg = CUTS_PRICING.urgencySurcharge[u] ?? 1;
      let price = beforeUrgency * urg;
      const min = o.cutsMinimum ?? o.minimum ?? CUTS_PRICING.minimum;
      price = Math.max(price, min);
      return round2(price);
    }

    case "help": {
      const p = GRIDD_PRICING.help;
      const hours = Math.min(12, Math.max(1, num(options.duration ?? options.durationMinutes, 2)));
      const ht = String(options.helpType ?? "loading").toLowerCase();
      let ph = o.perHour ?? p.perHour;
      if (ht === "loading") ph = p.heavyPerHour;
      if (ht === "moving") ph = p.perHour;
      if (ht === "assembly") ph = p.handymanPerHour;
      if (ht === "crew") ph = p.perHour * 1.5;
      let price = ph * hours;
      const min2 = p.minimum2hrs;
      price = Math.max(price, min2);
      const min = o.minimum ?? p.minimum;
      price = Math.max(price, min);
      return round2(price);
    }

    default:
      return 0;
  }
}

function isGriddService(s: string): s is GriddServiceId {
  return s in GRIDD_PRICING;
}

export function getPerMileRate(
  service: string,
  overrides: PricingConfigDoc = {},
  options?: PriceCalculationOptions,
): number {
  if (overrides.perMile != null) return overrides.perMile;
  if (!isGriddService(service)) return 0;
  if (service === "ride") {
    return rideTierConfig(String(options?.rideType ?? "standard")).perMile;
  }
  if (service === "roadside" && String(options?.roadsideType ?? "") === "tow") {
    return GRIDD_PRICING.roadside.tow.perMile;
  }
  const p = GRIDD_PRICING[service];
  if (p && "perMile" in p && typeof (p as { perMile?: number }).perMile === "number") {
    return (p as { perMile: number }).perMile;
  }
  return 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function applyPlatformFee(
  subtotalUsd: number,
  platformFee: number = DEFAULT_PLATFORM_FEE,
): { subtotalUsd: number; platformFeeUsd: number; totalUsd: number } {
  const sub = Math.max(0, subtotalUsd);
  const fee = round2(sub * platformFee);
  return {
    subtotalUsd: sub,
    platformFeeUsd: fee,
    totalUsd: round2(sub + fee),
  };
}

export function metersToMiles(meters: number | null | undefined): number {
  if (meters == null || !Number.isFinite(meters) || meters <= 0) return 0;
  return Math.round((meters / 1609.34) * 10) / 10;
}

/** Line items for LIVE ESTIMATE / PriceIQ™ UI (USD). */
export type SubtotalParts = {
  baseComponent: number;
  distanceComponent: number;
  timeComponent: number;
  extraComponent: number;
  subtotalUsd: number;
};

export function getSubtotalParts(
  service: string,
  miles: number,
  options: PriceCalculationOptions = {},
  overrides: PricingConfigDoc = {},
): SubtotalParts {
  const empty: SubtotalParts = {
    baseComponent: 0,
    distanceComponent: 0,
    timeComponent: 0,
    extraComponent: 0,
    subtotalUsd: 0,
  };
  if (!isGriddService(service)) return empty;
  const m = Math.max(0, miles);
  const o = overrides;

  switch (service) {
    case "ride": {
      const li = computeRideLineItems(m, options, o);
      return {
        baseComponent: li.base,
        distanceComponent: li.dist,
        timeComponent: li.time,
        extraComponent: li.bookingFee,
        subtotalUsd: round2(li.tripSubtotal + li.bookingFee),
      };
    }
    case "haul": {
      const p = GRIDD_PRICING.haul;
      const base = o.baseFare ?? p.baseFare;
      const pm = o.perMile ?? p.perMile;
      const sz = haulSizeKey(options.weight ?? options.size);
      const mult = p.sizeMultiplier[sz] ?? 1;
      const tier = haulLoadTier(options.weight ?? options.size);
      const tierFloor = p.loadTier[tier];
      const loadingHrs = Math.min(8, Math.max(0.5, num(options.loadingHours, 1)));
      const loadCost = p.perHourLoading * loadingHrs * mult;
      const flights = num(options.stairs ?? options.stairsFloors, 0);
      const stairCost = flights > 0 ? p.perStairFlight * Math.min(flights, 20) : 0;
      const core = (base + pm * m) * mult + loadCost;
      const min = o.minimum ?? p.minimum;
      const sub = Math.max(Math.max(core + stairCost, tierFloor), min);
      return {
        baseComponent: round2(base * mult),
        distanceComponent: round2(pm * m * mult),
        timeComponent: round2(loadCost),
        extraComponent: round2(stairCost),
        subtotalUsd: round2(sub),
      };
    }
    case "send": {
      const p = GRIDD_PRICING.send;
      const base = o.baseFare ?? p.baseFare;
      const pm = o.perMile ?? p.perMile;
      const wk = sendWeightKey(options.weight ?? options.size);
      const mult = p.weightMultiplier[wk] ?? 1;
      const core = (base + pm * m) * mult;
      const u = options.bookingUrgency ?? "today";
      const sched =
        u === "now" ? p.sameHourAdd : u === "schedule" ? p.scheduledAdd : 0;
      const min = o.minimum ?? p.minimum;
      const sub = Math.max(core + sched, min);
      return {
        baseComponent: round2(base * mult),
        distanceComponent: round2(pm * m * mult),
        timeComponent: 0,
        extraComponent: round2(sched),
        subtotalUsd: round2(sub),
      };
    }
    case "cuts": {
      const sk = cutsSizeKeyFromForm(String(options.treeSize ?? ""));
      if (!sk) {
        return { ...empty, subtotalUsd: 0 };
      }
      const { multKey, trees } = parseTreeCount(String(options.treeCount ?? "1"));
      const sizeUsd = cutsSizePriceUsd(sk, o);
      const qMult = CUTS_PRICING.quantityMultiplier[multKey] ?? 1;
      const stumpEach = o.cutsStump ?? CUTS_PRICING.stumpRemoval;
      const stumpCost = options.stumpRemoval ? stumpEach * trees : 0;
      const treeBundle = round2(sizeUsd * qMult);
      const beforeUrgency = treeBundle + stumpCost;
      const u = (options.scheduleUrgency ?? "today") as keyof typeof CUTS_PRICING.urgencySurcharge;
      const urg = CUTS_PRICING.urgencySurcharge[u] ?? 1;
      const afterUrg = round2(beforeUrgency * urg);
      const minV = o.cutsMinimum ?? o.minimum ?? CUTS_PRICING.minimum;
      const sub = Math.max(afterUrg, minV);
      return {
        baseComponent: treeBundle,
        distanceComponent: 0,
        timeComponent: round2(sub - treeBundle - stumpCost),
        extraComponent: round2(stumpCost),
        subtotalUsd: sub,
      };
    }
    default: {
      const sub = calculateGRIDDPrice(service, m, options, overrides);
      return {
        baseComponent: sub,
        distanceComponent: 0,
        timeComponent: 0,
        extraComponent: 0,
        subtotalUsd: sub,
      };
    }
  }
}
