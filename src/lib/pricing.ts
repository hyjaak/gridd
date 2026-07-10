/**
 * PriceIQ™ — single source of truth for GRIDD list pricing (before CEO overrides).
 * CEO overrides live in Firestore `pricingConfig/{serviceId}` and merge at runtime.
 */

export const DEFAULT_PLATFORM_FEE = 0.15;
export const DEFAULT_SURGE = 1.0;
/** Non-ride PriceIQ: at least 3.2% below market reference; rides use $1.84 or 3.2% in `priceMonitor`. */
export const DEFAULT_BEAT_PERCENT = 0.032;

/** Tree / arborist — size-based + quantity bulk + stump + urgency */
export const CUTS_PRICING = {
  baseFee: 0,
  treeSizePrice: {
    small: 150,
    medium: 450,
    large: 900,
    very_large: 1500,
  },
  quantityMultiplier: {
    1: 1.0,
    2: 1.85,
    3: 2.65,
    4: 3.4,
    5: 4.0,
  } as Record<number, number>,
  stumpRemoval: 150,
  minimum: 150,
  urgencySurcharge: {
    now: 1.25,
    today: 1.0,
    schedule: 0.9,
  },
} as const;

/**
 * Ride-hailing — PriceIQ™ 2.0
 * Subtotal = base + (mi×rate) + (min×rate) + booking; platform = subtotal × platformFee; total = subtotal + platform; then min & surge.
 */
export const RIDE_PRICING = {
  standard: {
    baseFare: 1.5,
    perMile: 1.3,
    perMinute: 0.2,
    bookingFee: 1.99,
    platformFee: 0.1,
    minimumFare: 5.0,
  },
  xl: {
    baseFare: 3.0,
    perMile: 1.85,
    perMinute: 0.3,
    bookingFee: 1.99,
    platformFee: 0.1,
    minimumFare: 10.0,
  },
  premium: {
    baseFare: 6.0,
    perMile: 2.75,
    perMinute: 0.45,
    bookingFee: 2.99,
    platformFee: 0.12,
    minimumFare: 18.0,
  },
  surgeMultiplier: 1.0,
} as const;

export type RideTierKey = keyof Omit<typeof RIDE_PRICING, "surgeMultiplier">;

export const GRIDD_PRICING = {
  ride: {
    baseFare: RIDE_PRICING.standard.baseFare,
    perMile: RIDE_PRICING.standard.perMile,
    perMinute: RIDE_PRICING.standard.perMinute,
    minimum: RIDE_PRICING.standard.minimumFare,
    surge: RIDE_PRICING.surgeMultiplier,
    bookingFee: RIDE_PRICING.standard.bookingFee,
    competitors: ["uber"],
  },

  haul: {
    baseFare: 45.0,
    perMile: 3.5,
    perHourLoading: 35.0,
    perStairFlight: 15.0,
    loadTier: {
      small: 85,
      medium: 145,
      large: 225,
      full: 350,
    },
    sizeMultiplier: {
      small: 1.0,
      medium: 1.15,
      large: 1.35,
      xl: 1.55,
    },
    minimum: 85.0,
    competitors: ["lugg", "dolly", "hired"],
  },

  send: {
    baseFare: 8.0,
    perMile: 1.75,
    sameHourAdd: 25.0,
    scheduledAdd: 12.0,
    weightMultiplier: {
      light: 1.0,
      medium: 1.2,
      heavy: 1.5,
      freight: 2.0,
    },
    minimum: 12.0,
    competitors: ["doordash", "ubereats", "uber_connect", "roadie"],
  },

  roadside: {
    jumpstart: 65.0,
    lockout: 85.0,
    fuel: {
      serviceFee: 35.0,
      fuelCostPassthrough: true,
    },
    tireChange: 75.0,
    tireReplacement: "quote" as const,
    tow: {
      baseFare: 95.0,
      perMile: 5.5,
      minimum: 95.0,
    },
    competitors: ["aaa", "bwc", "urgently"],
  },

  evcharge: {
    serviceFee: 35.0,
    perKwh: 0.45,
    minimum: 55.0,
    competitors: ["blink", "chargepoint"],
  },

  lawn: {
    yardPrice: {
      small: 45,
      medium: 75,
      large: 120,
      xlarge: 180,
    },
    edgingAdd: 15,
    baggingAdd: 20,
    minimum: 45.0,
    competitors: ["thumbtack", "angi", "lawn_love"],
  },

  pressure: {
    surfaceBase: {
      driveway: 150,
      house_small: 250,
      house_large: 400,
      deck: 175,
      fence: 125,
      siding: 200,
    },
    perSqFt: 0.35,
    minimum: 125.0,
    competitors: ["thumbtack", "angi"],
  },

  snow: {
    drivewaySmall: 45,
    drivewayLarge: 85,
    walkway: 25,
    perHour: 65.0,
    minimum: 45.0,
    competitors: ["thumbtack", "angi"],
  },

  gutter: {
    singleStory: 125,
    twoStory: 175,
    threeStory: 250,
    perLinearFt: 1.5,
    minimum: 125.0,
    competitors: ["thumbtack", "angi"],
  },

  fence: {
    perLinearFtWood: 25,
    perLinearFtVinyl: 30,
    perLinearFtChain: 15,
    gateInstall: 200,
    baseFare: "quote" as const,
    competitors: ["thumbtack", "angi"],
  },

  protect: {
    perHour: 45.0,
    minimum4hrs: 180.0,
    overnight: 350.0,
    eventRate: 55.0,
    minimum: 70.0,
    competitors: ["thumbtack", "bark"],
  },

  cuts: {
    minimum: CUTS_PRICING.minimum,
    competitors: ["thumbtack", "styleseat"],
  },

  help: {
    perHour: 35.0,
    minimum2hrs: 70.0,
    heavyPerHour: 45.0,
    handymanPerHour: 55.0,
    minimum: 70.0,
    competitors: ["taskrabbit", "thumbtack"],
  },
} as const;

export type GriddServiceId = keyof typeof GRIDD_PRICING;

export type PricingConfigDoc = {
  baseFare?: number;
  perMile?: number;
  perMinute?: number;
  perHour?: number;
  perSqFt?: number;
  perLinearFt?: number;
  perKwh?: number;
  minimum?: number;
  surgeMultiplier?: number;
  beatPercent?: number;
  platformFee?: number;
  /** Cuts (tree) — CEO overrides */
  cutsTreeSmall?: number;
  cutsTreeMedium?: number;
  cutsTreeLarge?: number;
  cutsTreeVeryLarge?: number;
  cutsStump?: number;
  cutsMinimum?: number;
  updatedAt?: unknown;
  updatedBy?: string;
};
